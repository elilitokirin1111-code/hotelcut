import { randomInt, randomUUID } from 'node:crypto';

import { buildAiTemplateCompilationTemplate, compileVideo } from '@hotelcut/compiler';
import type { HotelCutRepository } from '@hotelcut/domain';
import {
  type Asset,
  createVideoProjectSchema,
  errorResponseSchema,
  generatedVideoProjectSchema,
  generateVideoProjectSchema,
  hotelIdParamsSchema,
  idParamsSchema,
  projectTemplateSchema,
  projectRevisionSchema,
  saveProjectRevisionSchema,
  videoProjectBatchDeleteSchema,
  videoProjectDetailSchema,
  videoProjectSchema,
} from '@hotelcut/schemas';
import { parseHotelVideoProject, type HotelVideoProjectV1 } from '@hotelcut/timeline';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  buildCompilerInput,
  missingRequiredSlotLabels,
  projectTemplates,
  resolveProjectTemplate,
  summarizeGeneration,
} from './project-generation.js';

interface ProjectRouteOptions {
  repository?: HotelCutRepository | undefined;
}

class ProjectRequestError extends Error {
  readonly validation: readonly { message: string }[];

  constructor(message: string) {
    super(message);
    this.name = 'ProjectRequestError';
    this.validation = [{ message }];
  }
}

function validateProjectDocument(value: unknown): HotelVideoProjectV1 {
  try {
    return parseHotelVideoProject(value);
  } catch (error) {
    throw new ProjectRequestError(
      error instanceof Error ? error.message : 'Invalid HotelVideoProject document',
    );
  }
}

export function isClipAssetKindCompatible(
  clipKind: 'audio' | 'image' | 'video',
  assetKind: Asset['kind'],
): boolean {
  if (clipKind === 'image') {
    return assetKind === 'image' || assetKind === 'logo';
  }
  if (clipKind === 'audio') {
    // The compiler can extract an ambient/dialogue audio clip from a video asset.
    return assetKind === 'audio' || assetKind === 'video';
  }
  return assetKind === 'video';
}

async function validateProjectAssets(
  store: HotelCutRepository,
  actorUserId: string,
  hotelId: string,
  project: HotelVideoProjectV1,
): Promise<void> {
  const availableAssets = new Map(
    (await store.listAssets(actorUserId, hotelId)).map((asset) => [asset.id, asset]),
  );
  for (const clip of project.tracks.flatMap((track) => track.clips)) {
    if (clip.kind === 'caption' || clip.kind === 'text') {
      continue;
    }
    const asset = availableAssets.get(clip.assetId);
    const compatibleKind = asset && isClipAssetKindCompatible(clip.kind, asset.kind);
    if (
      !asset ||
      asset.status !== 'ready' ||
      asset.purpose === 'reference_video' ||
      !compatibleKind
    ) {
      throw new ProjectRequestError(`项目片段 ${clip.id} 引用了当前酒店不可用或类型不匹配的素材。`);
    }
  }
}

export const projectRoutes: FastifyPluginCallback<ProjectRouteOptions> = (fastify, options) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };

  app.get(
    '/v1/video-project-templates',
    {
      schema: {
        response: {
          200: z.array(projectTemplateSchema),
          400: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List supported automatic-edit templates',
        tags: ['video-projects'],
      },
    },
    () => [...projectTemplates],
  );

  app.post(
    '/v1/hotels/:hotelId/video-projects/generate',
    {
      schema: {
        body: generateVideoProjectSchema,
        params: hotelIdParamsSchema,
        response: {
          201: generatedVideoProjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Compile analyzed hotel assets into a new editable project',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      const store = repository();
      const brief = await store.getVideoBrief(request.actorUserId, request.body.videoBriefId);
      if (brief.hotelId !== request.params.hotelId) {
        throw new ProjectRequestError('Video brief does not belong to the selected hotel');
      }
      const brandKit = await store.getBrandKit(request.actorUserId, request.params.hotelId);
      const assets = await store.listAssets(request.actorUserId, request.params.hotelId);
      const readyAssets = assets.filter(
        (asset) =>
          asset.status === 'ready' && asset.kind !== 'font' && asset.purpose !== 'reference_video',
      );
      if (!readyAssets.some((asset) => asset.kind === 'video' || asset.kind === 'image')) {
        throw new ProjectRequestError('自动剪辑至少需要一条已经分析完成的可用视频素材。');
      }

      let template;
      try {
        template = resolveProjectTemplate(request.body.templateKey);
      } catch {
        let aiTemplate = null;
        try {
          aiTemplate = await store.getAiTemplate(
            request.actorUserId,
            request.params.hotelId,
            request.body.templateKey,
          );
        } catch {
          aiTemplate = null;
        }
        if (!aiTemplate) {
          throw new ProjectRequestError(
            `Unknown automatic-edit template: ${request.body.templateKey}`,
          );
        }
        template = buildAiTemplateCompilationTemplate(
          aiTemplate.id,
          aiTemplate.name,
          aiTemplate.spec,
        );
      }

      const projectId = randomUUID();
      const seed = request.body.seed ?? randomInt(0, 4_294_967_296);
      const assetDetails = await Promise.all(
        readyAssets.map((asset) => store.getAssetDetail(request.actorUserId, asset.id)),
      );
      let compilation: ReturnType<typeof compileVideo>;
      try {
        const input = buildCompilerInput({
          assetDetails,
          brandKit,
          brief,
          projectId,
          seed,
          template,
        });
        compilation = compileVideo(input, template);
      } catch (error) {
        if (error instanceof Error) {
          throw new ProjectRequestError(`Automatic editing failed: ${error.message}`);
        }
        throw error;
      }
      const generation = summarizeGeneration(compilation);
      const missingRequiredSlots = missingRequiredSlotLabels(generation);
      if (missingRequiredSlots.length > 0) {
        throw new ProjectRequestError(
          `自动剪辑预检未通过，缺少必需画面：${missingRequiredSlots.join('、')}。请在素材库补充对应素材并添加标签后重新生成。`,
        );
      }
      if (generation.selectedSlots === 0) {
        throw new ProjectRequestError(
          '没有素材满足所选模板。请先为可用镜头添加模板建议标签后重试。',
        );
      }
      const detail = await store.createVideoProject(request.actorUserId, request.params.hotelId, {
        id: projectId,
        name: brief.title,
        projectDocument: compilation.project,
        schemaVersion: compilation.project.schemaVersion,
        templateKey: template.id,
        videoBriefId: brief.id,
      });
      return reply.code(201).send({
        detail,
        generation,
      });
    },
  );

  app.get(
    '/v1/hotels/:hotelId/video-projects',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: {
          200: z.array(videoProjectSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List editable video projects for a hotel',
        tags: ['video-projects'],
      },
    },
    async (request) => repository().listVideoProjects(request.actorUserId, request.params.hotelId),
  );

  app.post(
    '/v1/hotels/:hotelId/video-projects',
    {
      schema: {
        body: createVideoProjectSchema,
        params: hotelIdParamsSchema,
        response: {
          201: videoProjectDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a project and immutable first revision',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      const projectDocument = validateProjectDocument(request.body.projectDocument);
      if (projectDocument.id !== request.body.id) {
        throw new ProjectRequestError('Project document id must match the requested project id');
      }
      if (projectDocument.hotelId !== request.params.hotelId) {
        throw new ProjectRequestError('Project document hotelId must match the route hotelId');
      }
      const store = repository();
      await validateProjectAssets(
        store,
        request.actorUserId,
        request.params.hotelId,
        projectDocument,
      );
      const result = await store.createVideoProject(request.actorUserId, request.params.hotelId, {
        ...request.body,
        projectDocument,
        schemaVersion: projectDocument.schemaVersion,
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    '/v1/video-projects/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: videoProjectDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Load the current editable project revision',
        tags: ['video-projects'],
      },
    },
    async (request) => repository().getVideoProject(request.actorUserId, request.params.id),
  );

  app.get(
    '/v1/video-projects/:id/revisions',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: z.array(projectRevisionSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List immutable revisions for a project',
        tags: ['video-projects'],
      },
    },
    async (request) => repository().listProjectRevisions(request.actorUserId, request.params.id),
  );

  app.post(
    '/v1/video-projects/:id/revisions',
    {
      schema: {
        body: saveProjectRevisionSchema,
        params: idParamsSchema,
        response: {
          201: videoProjectDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Autosave a validated immutable project revision',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      const projectDocument = validateProjectDocument(request.body.projectDocument);
      if (projectDocument.id !== request.params.id) {
        throw new ProjectRequestError('Project document id must match the route project id');
      }
      const store = repository();
      const currentProject = await store.getVideoProject(request.actorUserId, request.params.id);
      if (projectDocument.hotelId !== currentProject.project.hotelId) {
        throw new ProjectRequestError(
          'Project document hotelId must match the persisted project hotelId',
        );
      }
      await validateProjectAssets(
        store,
        request.actorUserId,
        currentProject.project.hotelId,
        projectDocument,
      );
      const result = await store.saveProjectRevision(request.actorUserId, request.params.id, {
        ...request.body,
        projectDocument,
        schemaVersion: projectDocument.schemaVersion,
      });
      return reply.code(201).send(result);
    },
  );

  app.delete(
    '/v1/video-projects/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Delete a video project, its revisions and render history',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      const project = await repository().getVideoProject(request.actorUserId, request.params.id);
      await repository().deleteVideoProjects(request.actorUserId, project.project.hotelId, [
        request.params.id,
      ]);
      return reply.code(204).send();
    },
  );

  app.post(
    '/v1/hotels/:hotelId/video-projects/batch-delete',
    {
      schema: {
        body: videoProjectBatchDeleteSchema,
        params: hotelIdParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Batch-delete video projects',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      await repository().deleteVideoProjects(
        request.actorUserId,
        request.params.hotelId,
        request.body.projectIds,
      );
      return reply.code(204).send();
    },
  );
};
