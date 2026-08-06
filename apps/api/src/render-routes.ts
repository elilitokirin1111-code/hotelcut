import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { HotelCutRepository } from '@hotelcut/domain';
import type { RenderQueue } from '@hotelcut/job-queue';
import {
  createRenderJobSchema,
  errorResponseSchema,
  idParamsSchema,
  renderArtifactDownloadSchema,
  renderJobDetailSchema,
  renderJobSchema,
  renderJobBatchDeleteSchema,
} from '@hotelcut/schemas';
import type { MultipartObjectStorage } from '@hotelcut/storage';

interface RenderRouteOptions {
  downloadUrlTtlSeconds: number;
  objectStorage?: MultipartObjectStorage | undefined;
  renderQueue?: RenderQueue | undefined;
  repository?: HotelCutRepository | undefined;
}

const renderJobDeleteParamsSchema = z
  .object({
    projectId: z.uuid(),
    renderJobId: z.uuid(),
  })
  .strict();

export const renderRoutes: FastifyPluginCallback<RenderRouteOptions> = (fastify, options) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };
  const renderQueue = (): RenderQueue => {
    if (!options.renderQueue) {
      throw new Error('Render queue is not configured');
    }
    return options.renderQueue;
  };
  const objectStorage = (): MultipartObjectStorage => {
    if (!options.objectStorage) {
      throw new Error('Object storage is not configured');
    }
    return options.objectStorage;
  };

  app.get(
    '/v1/video-projects/:id/render-jobs',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: z.array(renderJobSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List immutable render attempts for a video project',
        tags: ['render-jobs'],
      },
    },
    async (request) => repository().listRenderJobs(request.actorUserId, request.params.id),
  );

  app.post(
    '/v1/video-projects/:id/render-jobs',
    {
      schema: {
        body: createRenderJobSchema,
        params: idParamsSchema,
        response: {
          201: renderJobSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Queue a render for an immutable project revision',
        tags: ['render-jobs'],
      },
    },
    async (request, reply) => {
      const store = repository();
      const project = await store.getVideoProject(request.actorUserId, request.params.id);
      const job = await store.createRenderJob(request.actorUserId, request.params.id, request.body);
      try {
        await renderQueue().enqueue({
          attempt: job.attempt + 1,
          pipelineVersion: 'm6-v1',
          renderJobId: job.id,
        });
      } catch (error) {
        await store.markRenderQueueFailure(
          job.id,
          error instanceof Error ? error.message : 'Unknown queue publish error',
        );
        throw error;
      }
      await store.createCreativeFeedbackEvent(request.actorUserId, project.project.hotelId, {
        eventType: 'final_render_requested',
        videoProjectId: project.project.id,
        subjectId: job.id,
        metadata: { projectRevisionId: job.projectRevisionId, attempt: job.attempt },
      });
      return reply.code(201).send(job);
    },
  );

  app.get(
    '/v1/render-jobs/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: renderJobDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Get render progress, logs, artifacts, and quality report',
        tags: ['render-jobs'],
      },
    },
    async (request) => repository().getRenderJob(request.actorUserId, request.params.id),
  );

  app.post(
    '/v1/render-jobs/:id/cancel',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: renderJobSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Request cancellation without mutating the source project',
        tags: ['render-jobs'],
      },
    },
    async (request) =>
      repository().requestRenderCancellation(request.actorUserId, request.params.id),
  );

  app.post(
    '/v1/render-jobs/:id/retry',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: renderJobSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Retry a failed or cancelled render within its attempt budget',
        tags: ['render-jobs'],
      },
    },
    async (request) => {
      const job = await repository().retryRenderJob(request.actorUserId, request.params.id);
      try {
        await renderQueue().enqueue({
          attempt: job.attempt + 1,
          pipelineVersion: 'm6-v1',
          renderJobId: job.id,
        });
      } catch (error) {
        await repository().markRenderQueueFailure(
          job.id,
          error instanceof Error ? error.message : 'Unknown queue publish error',
        );
        throw error;
      }
      return job;
    },
  );

  app.get(
    '/v1/render-artifacts/:id/download',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: renderArtifactDownloadSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a short-lived download URL for a render artifact',
        tags: ['render-artifacts'],
      },
    },
    async (request) => {
      const artifact = await repository().getRenderArtifact(request.actorUserId, request.params.id);
      const downloadUrl = await objectStorage().presignDownload(
        { bucket: artifact.storageBucket, key: artifact.storageKey },
        options.downloadUrlTtlSeconds,
      );
      return {
        artifact,
        downloadUrl,
        expiresAt: new Date(Date.now() + options.downloadUrlTtlSeconds * 1_000).toISOString(),
      };
    },
  );

  app.delete(
    '/v1/video-projects/:projectId/render-jobs/:renderJobId',
    {
      schema: {
        params: renderJobDeleteParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Delete a finished render job and its delivery artifacts',
        tags: ['render-jobs'],
      },
    },
    async (request, reply) => {
      await repository().deleteRenderJobs(request.actorUserId, request.params.projectId, [
        request.params.renderJobId,
      ]);
      return reply.code(204).send();
    },
  );

  app.post(
    '/v1/video-projects/:projectId/render-jobs/batch-delete',
    {
      schema: {
        body: renderJobBatchDeleteSchema,
        params: idParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Batch-delete finished render jobs',
        tags: ['render-jobs'],
      },
    },
    async (request, reply) => {
      await repository().deleteRenderJobs(
        request.actorUserId,
        request.params.id,
        request.body.renderJobIds,
      );
      return reply.code(204).send();
    },
  );
};
