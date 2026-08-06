import {
  DomainNotFoundError,
  type HotelCutRepository,
  type StoredModelProviderSettings,
} from '@hotelcut/domain';
import {
  aiTemplateGenerationOutputSchema,
  aiTemplateIdParamsSchema,
  aiTemplateBatchDeleteSchema,
  aiTemplateSchema,
  errorResponseSchema,
  generateAiTemplateSchema,
  hotelIdParamsSchema,
} from '@hotelcut/schemas';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  callProvider,
  decryptModelApiKey,
  providerErrorMessage,
  responseOutputText,
} from './model-provider-routes.js';

interface AiTemplateRouteOptions {
  configSecret?: string | undefined;
  featureFlags?: { aiDirectorEnabled: boolean } | undefined;
  fetchProvider?: typeof fetch | undefined;
  repository?: HotelCutRepository | undefined;
}

class AiTemplateRequestError extends Error {
  readonly validation: readonly { message: string }[];

  constructor(message: string) {
    super(message);
    this.name = 'AiTemplateRequestError';
    this.validation = [{ message }];
  }
}

function templateModelBody(
  settings: StoredModelProviderSettings,
  outputSchema: z.ZodType,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(outputSchema, { target: 'draft-7' });
  const instructions =
    '你是酒店竖屏短视频的模板设计师。根据给定素材生成可直接用于自动剪辑的模板：' +
    'beats 必须按时间轴从 0 覆盖到 durationSeconds；requiredTags 只能使用素材中出现过的标签；' +
    'purpose、visual、caption 使用简体中文；transitionOut 只能是 cut/dissolve/fade；' +
    'globalRules 只能包含 CTA_EMPHASIS 或 MUSIC_ENABLED。严格返回符合 JSON Schema 的 JSON。';
  if (settings.apiMode === 'responses') {
    return {
      model: settings.model,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: 8_000,
      reasoning: { effort: settings.reasoningEffort },
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'hotelcut_ai_template',
          strict: true,
          schema: jsonSchema,
        },
      },
    };
  }
  return {
    model: settings.model,
    messages: [
      {
        role: 'system',
        content: `${instructions}\nJSON Schema: ${JSON.stringify(jsonSchema)}`,
      },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0.2,
    enable_thinking: settings.provider === 'aliyun-bailian' ? false : undefined,
    response_format:
      settings.provider === 'aliyun-bailian'
        ? { type: 'json_object' }
        : {
            type: 'json_schema',
            json_schema: { name: 'hotelcut_ai_template', strict: true, schema: jsonSchema },
          },
  };
}

function visionString(metadata: Record<string, unknown>, key: string): string | null {
  const vision = metadata['vision'];
  if (!vision || typeof vision !== 'object') {
    return null;
  }
  const value = (vision as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function visionTags(metadata: Record<string, unknown>): string[] {
  const vision = metadata['vision'];
  if (!vision || typeof vision !== 'object') {
    return [];
  }
  const tags = (vision as Record<string, unknown>)['tags'];
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
}

function visionSellingPoints(metadata: Record<string, unknown>): unknown {
  const vision = metadata['vision'];
  if (!vision || typeof vision !== 'object') {
    return [];
  }
  const points = (vision as Record<string, unknown>)['sellingPoints'];
  return Array.isArray(points) ? points : [];
}

function metadataDuration(metadata: Record<string, unknown>): number | null {
  const direct = metadata['durationMs'];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }
  const probe = metadata['probe'];
  if (probe && typeof probe === 'object') {
    const value = (probe as Record<string, unknown>)['durationMs'];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export const aiTemplateRoutes: FastifyPluginCallback<AiTemplateRouteOptions> = (
  fastify,
  options,
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };
  const requireAiDirector = (): void => {
    if (!options.featureFlags?.aiDirectorEnabled) {
      throw new DomainNotFoundError('AI Director is disabled');
    }
  };

  app.get(
    '/v1/hotels/:hotelId/ai-templates',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: {
          200: z.array(aiTemplateSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List AI-generated templates for a hotel',
        tags: ['ai-templates'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listAiTemplates(request.actorUserId, request.params.hotelId);
    },
  );

  app.post(
    '/v1/hotels/:hotelId/ai-templates/generate',
    {
      schema: {
        body: generateAiTemplateSchema,
        params: hotelIdParamsSchema,
        response: {
          201: aiTemplateSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate an AI template from analyzed hotel assets',
        tags: ['ai-templates'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      const store = repository();
      const hotelId = request.params.hotelId;
      const assets = await store.listAssets(request.actorUserId, hotelId);
      const readyAssets = assets.filter(
        (asset) => asset.status === 'ready' && (asset.kind === 'video' || asset.kind === 'image'),
      );
      if (readyAssets.length === 0) {
        throw new AiTemplateRequestError('AI 模板生成至少需要一个已分析完成的素材');
      }
      const settings = await store.getModelProviderSettings(request.actorUserId, hotelId);
      if (!settings?.enabled || !settings.encryptedApiKey) {
        throw new Error('MODEL_PROVIDER_NOT_CONFIGURED');
      }
      const details = await Promise.all(
        readyAssets.map((asset) => store.getAssetDetail(request.actorUserId, asset.id)),
      );
      const assetsInput = details.map((detail) => ({
        filename: detail.originalFilename,
        kind: detail.kind,
        durationMs: metadataDuration(detail.metadata),
        shortName: visionString(detail.metadata, 'shortName'),
        summary: visionString(detail.metadata, 'summary'),
        tags: visionTags(detail.metadata),
        sellingPoints: visionSellingPoints(detail.metadata),
      }));
      const input: Record<string, unknown> = {
        objective: request.body.objective ?? '制作一条酒店竖屏短视频',
        durationSeconds: request.body.durationSeconds ?? 20,
        assets: assetsInput,
      };
      const apiKey = decryptModelApiKey(
        settings.encryptedApiKey,
        options.configSecret ?? 'hotelcut-local-model-secret',
      );
      let output: z.infer<typeof aiTemplateGenerationOutputSchema>;
      try {
        const result = await callProvider(
          settings,
          apiKey,
          templateModelBody(settings, aiTemplateGenerationOutputSchema, input),
          options.fetchProvider ?? fetch,
        );
        output = aiTemplateGenerationOutputSchema.parse(
          JSON.parse(responseOutputText(result.payload, settings.apiMode)),
        );
      } catch (error) {
        throw new AiTemplateRequestError(`AI 模板生成失败：${providerErrorMessage(error, apiKey)}`);
      }
      const template = await store.createAiTemplate(request.actorUserId, hotelId, {
        name: request.body.name?.trim() || output.name,
        description: output.description,
        durationSeconds: output.durationSeconds,
        spec: output.spec,
      });
      return reply.code(201).send(template);
    },
  );

  app.delete(
    '/v1/hotels/:hotelId/ai-templates/:aiTemplateId',
    {
      schema: {
        params: aiTemplateIdParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Delete an AI-generated template',
        tags: ['ai-templates'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      await repository().deleteAiTemplate(
        request.actorUserId,
        request.params.hotelId,
        request.params.aiTemplateId,
      );
      return reply.code(204).send();
    },
  );

  app.post(
    '/v1/hotels/:hotelId/ai-templates/batch-delete',
    {
      schema: {
        body: aiTemplateBatchDeleteSchema,
        params: hotelIdParamsSchema,
        response: {
          204: z.void(),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Batch-delete AI-generated templates',
        tags: ['ai-templates'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      await repository().deleteAiTemplates(
        request.actorUserId,
        request.params.hotelId,
        request.body.aiTemplateIds,
      );
      return reply.code(204).send();
    },
  );
};
