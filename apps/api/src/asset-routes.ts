import { randomUUID } from 'node:crypto';

import type { HotelCutRepository, QueuedAssetAnalysis } from '@hotelcut/domain';
import type { AnalysisQueue } from '@hotelcut/job-queue';
import { ANALYSIS_PIPELINE_VERSION, type AnalysisJobData } from '@hotelcut/media';
import {
  analysisRetryResponseSchema,
  assetBatchDeleteSchema,
  assetDerivativeParamsSchema,
  assetDetailSchema,
  assetIdParamsSchema,
  assetSchema,
  assetSegmentSchema,
  completeAssetUploadResponseSchema,
  completeAssetUploadSchema,
  createAssetUploadResponseSchema,
  createAssetUploadSchema,
  createManualSegmentSchema,
  derivativeDownloadSchema,
  errorResponseSchema,
  hotelIdParamsSchema,
} from '@hotelcut/schemas';
import type { MultipartObjectStorage } from '@hotelcut/storage';
import { DomainConflictError } from '@hotelcut/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

interface AssetRouteOptions {
  analysisQueue?: AnalysisQueue | undefined;
  bucket: string;
  objectStorage?: MultipartObjectStorage | undefined;
  repository?: HotelCutRepository | undefined;
  uploadUrlTtlSeconds: number;
}

const commonResponses = {
  400: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
};

function analysisJobData(queued: QueuedAssetAnalysis): AnalysisJobData {
  if (!queued.asset.checksumSha256) {
    throw new DomainConflictError('Asset checksum is required before analysis');
  }
  if (queued.asset.kind !== 'video' && queued.asset.kind !== 'audio') {
    throw new DomainConflictError(`Asset kind ${queued.asset.kind} is not supported for analysis`);
  }
  return {
    analysisJobId: queued.analysisJob.id,
    assetId: queued.asset.id,
    assetKind: queued.asset.kind,
    hotelId: queued.asset.hotelId,
    storageBucket: queued.asset.storageBucket,
    storageKey: queued.asset.storageKey,
    expectedChecksumSha256: queued.asset.checksumSha256,
    pipelineVersion: ANALYSIS_PIPELINE_VERSION,
  };
}

export const assetRoutes: FastifyPluginCallbackZod<AssetRouteOptions> = (app, options, done) => {
  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };
  const storage = (): MultipartObjectStorage => {
    if (!options.objectStorage) {
      throw new Error('HotelCut object storage is not configured');
    }
    return options.objectStorage;
  };
  const analysisQueue = (): AnalysisQueue => {
    if (!options.analysisQueue) {
      throw new Error('HotelCut analysis queue is not configured');
    }
    return options.analysisQueue;
  };

  app.get(
    '/v1/hotels/:hotelId/assets',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: { 200: z.array(assetSchema), ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List media assets for a hotel',
        tags: ['assets'],
      },
    },
    async (request) => repository().listAssets(request.actorUserId, request.params.hotelId),
  );

  app.post(
    '/v1/hotels/:hotelId/assets/uploads',
    {
      schema: {
        body: createAssetUploadSchema,
        params: hotelIdParamsSchema,
        response: { 201: createAssetUploadResponseSchema, ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a multipart object-storage upload',
        tags: ['assets'],
      },
    },
    async (request, reply) => {
      const actorUserId = request.actorUserId;
      const hotelId = request.params.hotelId;
      await repository().getHotel(actorUserId, hotelId);

      const assetId = randomUUID();
      const storageKey = `hotels/${hotelId}/assets/${assetId}/original`;
      const partCount = Math.ceil(request.body.byteSize / request.body.partSize);
      if (partCount > 10_000) {
        throw new DomainConflictError('Upload exceeds the maximum multipart part count');
      }
      const expiresAt = new Date(Date.now() + options.uploadUrlTtlSeconds * 1_000).toISOString();
      const providerUploadId = await storage().startMultipartUpload({
        bucket: options.bucket,
        key: storageKey,
        contentType: request.body.contentType,
        checksumSha256: request.body.checksumSha256,
      });

      try {
        const registered = await repository().registerAssetUpload(actorUserId, hotelId, {
          ...request.body,
          assetId,
          storageBucket: options.bucket,
          storageKey,
          providerUploadId,
          partCount,
          expiresAt,
        });
        const parts = await Promise.all(
          Array.from({ length: partCount }, async (_, index) => ({
            partNumber: index + 1,
            url: await storage().presignUploadPart({
              bucket: options.bucket,
              key: storageKey,
              uploadId: providerUploadId,
              partNumber: index + 1,
              expiresInSeconds: options.uploadUrlTtlSeconds,
            }),
            expiresAt,
          })),
        );
        return reply.code(201).send({ ...registered, parts });
      } catch (error) {
        await storage().abortMultipartUpload({
          bucket: options.bucket,
          key: storageKey,
          uploadId: providerUploadId,
        });
        throw error;
      }
    },
  );

  app.post(
    '/v1/assets/:assetId/uploads/complete',
    {
      schema: {
        body: completeAssetUploadSchema,
        params: assetIdParamsSchema,
        response: { 202: completeAssetUploadResponseSchema, ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Complete an upload and queue media analysis',
        tags: ['assets'],
      },
    },
    async (request, reply) => {
      const context = await repository().getAssetUpload(
        request.actorUserId,
        request.params.assetId,
        request.body.uploadId,
      );
      if (context.upload.status !== 'initiated') {
        throw new DomainConflictError('Asset upload has already been finalized');
      }
      if (new Date(context.upload.expiresAt).getTime() <= Date.now()) {
        throw new DomainConflictError('Asset upload has expired');
      }
      const partNumbers = new Set(request.body.parts.map((part) => part.partNumber));
      if (
        request.body.parts.length !== context.expectedPartCount ||
        partNumbers.size !== context.expectedPartCount ||
        !request.body.parts.every(
          (part) => part.partNumber >= 1 && part.partNumber <= context.expectedPartCount,
        )
      ) {
        throw new DomainConflictError('Multipart completion does not contain every expected part');
      }

      await storage().completeMultipartUpload({
        bucket: context.asset.storageBucket,
        key: context.asset.storageKey,
        uploadId: request.body.uploadId,
        parts: request.body.parts,
      });
      const stored = await storage().headObject({
        bucket: context.asset.storageBucket,
        key: context.asset.storageKey,
      });
      if (stored.byteSize !== context.asset.byteSize) {
        throw new DomainConflictError('Uploaded object size does not match the registration');
      }
      if (stored.checksumSha256?.toLowerCase() !== context.asset.checksumSha256?.toLowerCase()) {
        throw new DomainConflictError('Uploaded object checksum metadata does not match');
      }

      const queued = await repository().completeAssetUpload(
        request.actorUserId,
        request.params.assetId,
        request.body,
      );
      await analysisQueue().enqueue(analysisJobData(queued));
      return reply.code(202).send({
        assetId: queued.asset.id,
        analysisJobId: queued.analysisJob.id,
        status: 'queued',
      });
    },
  );

  app.get(
    '/v1/assets/:assetId',
    {
      schema: {
        params: assetIdParamsSchema,
        response: { 200: assetDetailSchema, ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Get media parameters, derivatives, segments, transcript and analysis logs',
        tags: ['assets'],
      },
    },
    async (request) => repository().getAssetDetail(request.actorUserId, request.params.assetId),
  );

  app.post(
    '/v1/assets/:assetId/analysis/retry',
    {
      schema: {
        params: assetIdParamsSchema,
        response: { 202: analysisRetryResponseSchema, ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Safely retry, refresh or dispatch an asset analysis job',
        tags: ['assets'],
      },
    },
    async (request, reply) => {
      const queued = await repository().retryAssetAnalysis(
        request.actorUserId,
        request.params.assetId,
      );
      await analysisQueue().enqueue(analysisJobData(queued));
      return reply.code(202).send({
        assetId: queued.asset.id,
        analysisJobId: queued.analysisJob.id,
        status: 'queued',
      });
    },
  );

  app.post(
    '/v1/assets/:assetId/segments',
    {
      schema: {
        body: createManualSegmentSchema,
        params: assetIdParamsSchema,
        response: { 201: assetSegmentSchema, ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Add a manual media label or time range',
        tags: ['assets'],
      },
    },
    async (request, reply) => {
      const segment = await repository().createManualSegment(
        request.actorUserId,
        request.params.assetId,
        request.body,
      );
      return reply.code(201).send(segment);
    },
  );

  app.get(
    '/v1/assets/:assetId/derivatives/:kind/download',
    {
      schema: {
        params: assetDerivativeParamsSchema,
        response: { 200: derivativeDownloadSchema, ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a short-lived derivative download URL',
        tags: ['assets'],
      },
    },
    async (request) => {
      const derivative = await repository().getAssetDerivative(
        request.actorUserId,
        request.params.assetId,
        request.params.kind,
      );
      const expiresInSeconds = 15 * 60;
      return {
        url: await storage().presignDownload(
          {
            bucket: derivative.storageBucket,
            key: derivative.storageKey,
          },
          expiresInSeconds,
        ),
        expiresInSeconds,
      };
    },
  );

  app.delete(
    '/v1/assets/:assetId',
    {
      schema: {
        params: assetIdParamsSchema,
        response: { 204: z.void(), ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Delete an asset and its analysis artifacts',
        tags: ['assets'],
      },
    },
    async (request, reply) => {
      const detail = await repository().getAssetDetail(request.actorUserId, request.params.assetId);
      const references = await repository().listAssetStorageReferences(
        request.actorUserId,
        detail.hotelId,
        [request.params.assetId],
      );
      await repository().deleteAssets(request.actorUserId, detail.hotelId, [
        request.params.assetId,
      ]);
      try {
        await storage().deleteObjects(references);
      } catch (error) {
        request.log.warn(
          { assetId: request.params.assetId, objectCount: references.length, error },
          'Asset rows deleted but object-storage cleanup failed; orphan objects will need a cleanup pass',
        );
      }
      return reply.code(204).send();
    },
  );

  app.post(
    '/v1/hotels/:hotelId/assets/batch-delete',
    {
      schema: {
        body: assetBatchDeleteSchema,
        params: hotelIdParamsSchema,
        response: { 204: z.void(), ...commonResponses },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Batch-delete hotel assets',
        tags: ['assets'],
      },
    },
    async (request, reply) => {
      const references = await repository().listAssetStorageReferences(
        request.actorUserId,
        request.params.hotelId,
        request.body.assetIds,
      );
      await repository().deleteAssets(
        request.actorUserId,
        request.params.hotelId,
        request.body.assetIds,
      );
      try {
        await storage().deleteObjects(references);
      } catch (error) {
        request.log.warn(
          { hotelId: request.params.hotelId, objectCount: references.length, error },
          'Asset rows deleted but object-storage cleanup failed; orphan objects will need a cleanup pass',
        );
      }
      return reply.code(204).send();
    },
  );

  done();
};
