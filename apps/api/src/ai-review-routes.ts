import type { FastifyPluginCallback } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { applyAiReviewCommand } from '@hotelcut/editor';
import type { HotelCutRepository, StoredModelProviderSettings } from '@hotelcut/domain';
import {
  aiReviewGenerationSchema,
  aiReviewSchema,
  applyAiReviewSchema,
  errorResponseSchema,
  idParamsSchema,
  videoProjectDetailSchema,
} from '@hotelcut/schemas';
import { parseHotelVideoProject } from '@hotelcut/timeline';

import {
  callProvider,
  decryptModelApiKey,
  responseOutputText,
  type ProviderFetch,
} from './model-provider-routes.js';

interface AiReviewRouteOptions {
  configSecret: string;
  featureFlags: { aiReviewEnabled: boolean };
  fetchProvider?: ProviderFetch;
  repository?: HotelCutRepository;
}

const reviewPromptVersion = 'ai-review-v1';
const reviewParameters = { temperature: 0.1 };

function reviewBody(settings: StoredModelProviderSettings, input: string): Record<string, unknown> {
  const instructions =
    '你是酒店竖屏短视频审片师。只评价给定时间线，不编造素材事实。返回严格 JSON；每项问题必须给出毫秒时间区间。命令只能使用指定字段，且不得输出完整时间线。';
  const schema = z.toJSONSchema(aiReviewGenerationSchema);
  if (settings.apiMode === 'responses') {
    return {
      model: settings.model,
      instructions,
      input,
      max_output_tokens: 4_000,
      reasoning: { effort: settings.reasoningEffort },
      store: false,
      text: { format: { type: 'json_schema', name: 'hotelcut_ai_review', strict: true, schema } },
    };
  }
  return {
    model: settings.model,
    messages: [
      { role: 'system', content: `${instructions}\nSchema:${JSON.stringify(schema)}` },
      { role: 'user', content: input },
    ],
    temperature: 0.1,
    ...(settings.provider === 'aliyun-bailian' ? { enable_thinking: false } : {}),
    response_format: { type: 'json_object' },
  };
}

export const aiReviewRoutes: FastifyPluginCallback<AiReviewRouteOptions> = (fastify, options) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) throw new Error('HotelCut repository is not configured');
    return options.repository;
  };
  const requireReview = () => {
    if (!options.featureFlags.aiReviewEnabled) throw new Error('AI_REVIEW_DISABLED');
  };

  app.get(
    '/v1/video-projects/:id/ai-reviews',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: z.array(aiReviewSchema), 404: errorResponseSchema },
      },
    },
    async (request) => {
      requireReview();
      return repository().listAiReviews(request.actorUserId, request.params.id);
    },
  );

  app.post(
    '/v1/video-projects/:id/ai-review',
    {
      schema: {
        params: idParamsSchema,
        response: { 201: aiReviewSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      requireReview();
      const store = repository();
      const detail = await store.getVideoProject(request.actorUserId, request.params.id);
      const settings = await store.getModelProviderSettings(
        request.actorUserId,
        detail.project.hotelId,
      );
      if (!settings?.enabled || !settings.encryptedApiKey)
        throw new Error('MODEL_PROVIDER_NOT_CONFIGURED');
      const input = JSON.stringify({
        project: detail.currentRevision.projectDocument,
        revision: detail.currentRevision.revision,
      }).slice(0, 80_000);
      const result = await callProvider(
        settings,
        decryptModelApiKey(settings.encryptedApiKey, options.configSecret),
        reviewBody(settings, input),
        options.fetchProvider ?? fetch,
      );
      const generated = aiReviewGenerationSchema.parse(
        JSON.parse(responseOutputText(result.payload, settings.apiMode)),
      );
      const review = await store.createAiReview(request.actorUserId, detail.project.id, {
        ...generated,
        baseRevision: detail.currentRevision.revision,
        modelName: settings.model,
        promptVersion: reviewPromptVersion,
        generationParameters: reviewParameters,
        inputSummary: input.slice(0, 4_000),
      });
      return reply.code(201).send(review);
    },
  );

  app.post(
    '/v1/ai-reviews/:id/apply',
    {
      schema: {
        body: applyAiReviewSchema,
        params: idParamsSchema,
        response: {
          201: videoProjectDetailSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      requireReview();
      const store = repository();
      const review = await store.getAiReview(request.actorUserId, request.params.id);
      if (review.status !== 'open')
        return reply
          .code(409)
          .send({ code: 'AI_REVIEW_CLOSED', message: '该审片建议已处理。', requestId: request.id });
      const finding = review.findings.find((item) => item.id === request.body.findingId);
      const command = finding?.commands[request.body.commandIndex];
      if (!command)
        return reply.code(409).send({
          code: 'AI_REVIEW_COMMAND_NOT_FOUND',
          message: '未找到指定审片命令。',
          requestId: request.id,
        });
      const detail = await store.getVideoProject(request.actorUserId, review.videoProjectId);
      if (detail.currentRevision.revision !== review.baseRevision)
        return reply.code(409).send({
          code: 'AI_REVIEW_REVISION_STALE',
          message: '项目已被修改，请重新审片。',
          requestId: request.id,
        });
      const applied = applyAiReviewCommand(
        parseHotelVideoProject(detail.currentRevision.projectDocument),
        command,
      );
      const saved = await store.saveProjectRevision(request.actorUserId, review.videoProjectId, {
        baseRevision: review.baseRevision,
        projectDocument: applied.project,
        schemaVersion: applied.project.schemaVersion,
      });
      await store.updateAiReviewStatus(request.actorUserId, review.id, {
        status: 'applied',
        appliedRevision: saved.currentRevision.revision,
      });
      return reply.code(201).send(saved);
    },
  );

  app.post(
    '/v1/ai-reviews/:id/dismiss',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: aiReviewSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      requireReview();
      return repository().updateAiReviewStatus(request.actorUserId, request.params.id, {
        status: 'dismissed',
      });
    },
  );
};
