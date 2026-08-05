import type { FastifyPluginCallback } from 'fastify';
import { randomUUID } from 'node:crypto';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  buildDynamicCompilationTemplate,
  COMPILER_VERSION,
  compileVideo,
  validateEditBlueprint,
} from '@hotelcut/compiler';
import {
  DomainNotFoundError,
  type HotelCutRepository,
  type PersistCreativeVideoVersionInput,
  type StoredModelProviderSettings,
} from '@hotelcut/domain';
import {
  aiDirectorFeatureFlagsSchema,
  assignAssetRequirementSchema,
  compileBlueprintSchema,
  creativeVideoVersionBatchSchema,
  creativeVideoVersionSchema,
  createCreativeBriefRevisionSchema,
  createReferenceProfileSchema,
  createCreativeProjectSchema,
  creativeBriefRevisionSchema,
  creativeProjectIdParamsSchema,
  creativeProjectSchema,
  errorResponseSchema,
  expandIdeaOutputSchema,
  hotelIdParamsSchema,
  generateAssetRequirementsSchema,
  generateBlueprintSchema,
  generateVideoVersionsSchema,
  generatedVideoProjectSchema,
  reviseScriptSchema,
  referenceVideoProfileGenerationSchema,
  referenceVideoProfileSchema,
  assetRequirementSchema,
  editBlueprintGenerationSchema,
  editBlueprintSchema,
  scriptGenerationSchema,
  scriptPackageSchema,
  selectRevisionSchema,
  updateCreativeProjectSchema,
  type AiDirectorFeatureFlags,
  type EditBlueprint,
  type ScriptPackage,
  type VideoVersionVariant,
} from '@hotelcut/schemas';

import {
  callProvider,
  decryptModelApiKey,
  providerErrorMessage,
  responseOutputText,
  type ProviderFetch,
} from './model-provider-routes.js';
import { matchShotRequirement } from './asset-matching.js';
import {
  buildCompilerInput,
  missingRequiredSlotLabels,
  summarizeGeneration,
} from './project-generation.js';

interface CreativeProjectRouteOptions {
  configSecret: string;
  featureFlags: AiDirectorFeatureFlags;
  fetchProvider?: ProviderFetch | undefined;
  repository?: HotelCutRepository;
}

const promptVersion = 'ai-director-v1';
const generationParameters = { temperature: 0.2, topP: 0.9 };
const scriptParamsSchema = z.object({ projectId: z.uuid(), scriptId: z.uuid() });
const blueprintParamsSchema = creativeProjectIdParamsSchema.extend({ blueprintId: z.uuid() });

function deriveVersionBlueprint(
  blueprint: EditBlueprint,
  variant: VideoVersionVariant,
  seed: number,
) {
  const speedMultiplier = variant === 'B' ? 0.65 : 1;
  return {
    durationSeconds: blueprint.durationSeconds,
    frameRate: blueprint.frameRate,
    aspectRatio: blueprint.aspectRatio,
    music: blueprint.music,
    captionStyle: blueprint.captionStyle,
    compilerVersion: blueprint.compilerVersion,
    sourceAssetIds: blueprint.sourceAssetIds,
    referenceProfileIds: blueprint.referenceProfileIds,
    modelName: blueprint.modelName,
    promptVersion: blueprint.promptVersion,
    generationParameters: blueprint.generationParameters,
    inputSummary: blueprint.inputSummary,
    seed,
    style: {
      ...blueprint.style,
      pace: variant === 'B' ? 'very_fast' : blueprint.style.pace,
      transitionDensity: variant === 'B' ? 'high' : blueprint.style.transitionDensity,
    },
    globalRules: [
      ...blueprint.globalRules.filter(
        (rule) => rule !== 'CTA_EMPHASIS' && rule !== 'MUSIC_ENABLED',
      ),
      ...(variant === 'C' ? ['CTA_EMPHASIS'] : []),
      'MUSIC_ENABLED',
    ],
    beats: blueprint.beats.map((sourceBeat) => {
      const { id: ignoredBeatId, ...beat } = sourceBeat;
      void ignoredBeatId;
      return {
        ...beat,
        maximumShotDurationMs:
          variant === 'B'
            ? Math.max(
                beat.minimumShotDurationMs,
                Math.floor(beat.maximumShotDurationMs * speedMultiplier),
              )
            : beat.maximumShotDurationMs,
      };
    }),
  };
}

function versionScores(
  variant: VideoVersionVariant,
  generation: { selectedSlots: number; totalSlots: number; usedAssetIds: string[] },
  rawProject: Record<string, unknown>,
): Omit<
  PersistCreativeVideoVersionInput,
  'editBlueprintId' | 'videoProjectId' | 'variant' | 'seed' | 'recommendationReason'
> {
  const project = rawProject as {
    output: { durationFrames: number };
    tracks: Array<{ clips: Array<{ startFrame: number; durationFrames: number; kind: string }> }>;
  };
  const visualClips = project.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.kind === 'video' || clip.kind === 'image');
  const averageShotFrames = visualClips.length
    ? Math.round(
        visualClips.reduce((sum, clip) => sum + clip.durationFrames, 0) / visualClips.length,
      )
    : project.output.durationFrames;
  const repeatedAssetCount = generation.usedAssetIds.length - new Set(generation.usedAssetIds).size;
  const coverage = generation.totalSlots
    ? Math.round((generation.selectedSlots * 10_000) / generation.totalSlots)
    : 0;
  const hookCoverage = visualClips.some((clip) => clip.startFrame < 90) ? 10_000 : 0;
  const pace = Math.max(0, Math.min(10_000, 10_000 - Math.max(0, averageShotFrames - 36) * 80));
  return {
    scoreBasisPoints: Math.round((coverage * 5 + hookCoverage * 3 + pace * 2) / 10),
    hookScoreBasisPoints: hookCoverage,
    sellingPointCoverageBasisPoints: coverage,
    paceScoreBasisPoints: variant === 'B' ? Math.max(pace, 8_000) : pace,
    usedAssetIds: generation.usedAssetIds,
    repeatedAssetCount,
  };
}

function metadataDuration(metadata: Record<string, unknown>): number {
  const probe = metadata['probe'];
  if (!probe || typeof probe !== 'object') return 0;
  const durationMs = (probe as Record<string, unknown>)['durationMs'];
  return typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : 0;
}

function modelBody(
  settings: StoredModelProviderSettings,
  name: string,
  outputSchema: z.ZodType,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(outputSchema, { target: 'draft-7' });
  const instructions =
    '你是酒店短视频 AI 导演。只使用输入中确认的事实；不得编造价格、地址、权益、人物或品牌。严格返回给定 JSON Schema 的 JSON，不输出 Markdown。';
  if (settings.apiMode === 'responses') {
    return {
      model: settings.model,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: 8_000,
      reasoning: { effort: settings.reasoningEffort },
      store: false,
      text: { format: { type: 'json_schema', name, strict: true, schema: jsonSchema } },
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
    temperature: generationParameters.temperature,
    top_p: generationParameters.topP,
    enable_thinking: settings.provider === 'aliyun-bailian' ? false : undefined,
    response_format:
      settings.provider === 'aliyun-bailian'
        ? { type: 'json_object' }
        : { type: 'json_schema', json_schema: { name, strict: true, schema: jsonSchema } },
  };
}

export const creativeProjectRoutes: FastifyPluginCallback<CreativeProjectRouteOptions> = (
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
    if (!options.featureFlags.aiDirectorEnabled) {
      throw new DomainNotFoundError('AI Director is disabled');
    }
  };
  const requireReferenceAnalysis = (): void => {
    requireAiDirector();
    if (!options.featureFlags.referenceAnalysisEnabled) {
      throw new DomainNotFoundError('Reference-video analysis is disabled');
    }
  };
  const generate = async (
    actorUserId: string,
    projectId: string,
    operation: string,
    outputSchema: z.ZodType,
    input: Record<string, unknown>,
  ): Promise<unknown> => {
    const store = repository();
    const project = await store.getCreativeProject(actorUserId, projectId);
    const settings = await store.getModelProviderSettings(actorUserId, project.hotelId);
    if (!settings?.enabled || !settings.encryptedApiKey) {
      throw new Error('MODEL_PROVIDER_NOT_CONFIGURED');
    }
    const inputSummary = JSON.stringify(input).slice(0, 4_000);
    const runId = await store.createAiGenerationRun(actorUserId, projectId, {
      operation,
      modelName: settings.model,
      promptVersion,
      generationParameters,
      inputSummary,
    });
    const apiKey = decryptModelApiKey(settings.encryptedApiKey, options.configSecret);
    try {
      const result = await callProvider(
        settings,
        apiKey,
        modelBody(settings, operation, outputSchema, input),
        options.fetchProvider ?? fetch,
      );
      const parsed = outputSchema.parse(
        JSON.parse(responseOutputText(result.payload, settings.apiMode)),
      );
      await store.finishAiGenerationRun(runId, {
        outputSummary: JSON.stringify(parsed).slice(0, 4_000),
      });
      return parsed;
    } catch (error) {
      await store.finishAiGenerationRun(runId, {
        failureReason: providerErrorMessage(error, apiKey),
      });
      throw error;
    }
  };

  app.get(
    '/v1/ai-director/features',
    {
      schema: {
        response: { 200: aiDirectorFeatureFlagsSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Read AI Director feature availability',
        tags: ['ai-director'],
      },
    },
    () => options.featureFlags,
  );

  app.post(
    '/v1/hotels/:hotelId/creative-projects',
    {
      schema: {
        body: createCreativeProjectSchema,
        params: hotelIdParamsSchema,
        response: {
          201: creativeProjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create an immutable-history AI creative project',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      const project = await repository().createCreativeProject(
        request.actorUserId,
        request.params.hotelId,
        request.body,
      );
      return reply.code(201).send(project);
    },
  );

  app.get(
    '/v1/hotels/:hotelId/creative-projects',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: {
          200: z.array(creativeProjectSchema),
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List active AI creative projects for a hotel',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listCreativeProjects(request.actorUserId, request.params.hotelId);
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/blueprints/:blueprintId/compile',
    {
      schema: {
        body: compileBlueprintSchema,
        params: blueprintParamsSchema,
        response: {
          201: generatedVideoProjectSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Compile a validated EditBlueprint into an editable video project',
        tags: ['ai-director', 'video-projects'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      if (!options.featureFlags.dynamicBlueprintEnabled) {
        throw new DomainNotFoundError('Dynamic Blueprint is disabled');
      }
      const store = repository();
      const project = await store.getCreativeProject(request.actorUserId, request.params.projectId);
      const blueprint = (await store.listEditBlueprints(request.actorUserId, project.id)).find(
        (candidate) => candidate.id === request.params.blueprintId,
      );
      if (!blueprint) throw new DomainNotFoundError('Edit blueprint not found');
      const validation = validateEditBlueprint(blueprint);
      if (!validation.valid || !validation.normalizedBlueprint) {
        return reply.code(409).send({
          code: 'BLUEPRINT_INVALID',
          message: '剪辑蓝图未通过时长、镜头或边界校验，无法生成项目。',
          requestId: request.id,
        });
      }

      const [briefRevisions, scripts, brandKit, assets] = await Promise.all([
        store.listCreativeBriefRevisions(request.actorUserId, project.id),
        store.listScriptPackages(request.actorUserId, project.id),
        store.getBrandKit(request.actorUserId, project.hotelId),
        store.listAssets(request.actorUserId, project.hotelId),
      ]);
      const creativeBrief =
        briefRevisions.find((brief) => brief.id === project.selectedBriefRevisionId) ??
        briefRevisions[0];
      const script =
        scripts.find((candidate) => candidate.id === project.selectedScriptRevisionId) ??
        scripts[0];
      const readyAssets = assets.filter(
        (asset) =>
          asset.kind === 'video' &&
          asset.status === 'ready' &&
          (blueprint.sourceAssetIds.length === 0 || blueprint.sourceAssetIds.includes(asset.id)),
      );
      if (readyAssets.length === 0) {
        return reply.code(409).send({
          code: 'BLUEPRINT_SOURCE_ASSETS_UNAVAILABLE',
          message: '蓝图没有可用的已分析视频素材。请确认素材匹配后重试。',
          requestId: request.id,
        });
      }
      const assetDetails = await Promise.all(
        readyAssets.map((asset) => store.getAssetDetail(request.actorUserId, asset.id)),
      );
      const projectId = randomUUID();
      const transientBrief = {
        id: randomUUID(),
        hotelId: project.hotelId,
        title: script?.title ?? project.title,
        platform: creativeBrief?.platform ?? ('douyin' as const),
        durationSeconds: blueprint.durationSeconds,
        aspectRatio: '9:16' as const,
        tone: creativeBrief?.tone.join('、') || blueprint.style.visualTone,
        language: 'zh-CN',
        objective: creativeBrief?.objective ?? null,
        targetAudience: creativeBrief?.targetAudience ?? null,
        callToAction: script?.callToAction ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const template = buildDynamicCompilationTemplate(validation.normalizedBlueprint);
      let compilation: ReturnType<typeof compileVideo>;
      try {
        compilation = compileVideo(
          buildCompilerInput({
            assetDetails,
            brandKit,
            brief: transientBrief,
            frameRate: blueprint.frameRate,
            projectId,
            seed: request.body.seed ?? blueprint.seed,
            template,
          }),
          template,
        );
      } catch (error) {
        return reply.code(409).send({
          code: 'BLUEPRINT_COMPILATION_FAILED',
          message: error instanceof Error ? error.message : '动态剪辑编译失败。',
          requestId: request.id,
        });
      }
      const generation = summarizeGeneration(compilation);
      const missingRequiredSlots = missingRequiredSlotLabels(generation);
      if (missingRequiredSlots.length > 0 || generation.selectedSlots === 0) {
        return reply.code(409).send({
          code: 'BLUEPRINT_REQUIRED_ASSETS_MISSING',
          message:
            missingRequiredSlots.length > 0
              ? `缺少蓝图必需画面：${missingRequiredSlots.join('、')}。请补充素材后重试。`
              : '没有素材满足蓝图要求。请补充或重新匹配素材后重试。',
          requestId: request.id,
        });
      }
      const persistedBrief = await store.createVideoBrief(request.actorUserId, project.hotelId, {
        title: transientBrief.title,
        platform: transientBrief.platform,
        durationSeconds: transientBrief.durationSeconds,
        aspectRatio: transientBrief.aspectRatio,
        tone: transientBrief.tone,
        language: transientBrief.language,
        objective: transientBrief.objective,
        targetAudience: transientBrief.targetAudience,
        callToAction: transientBrief.callToAction,
      });
      const detail = await store.createVideoProject(request.actorUserId, project.hotelId, {
        id: projectId,
        name: transientBrief.title,
        projectDocument: compilation.project,
        schemaVersion: compilation.project.schemaVersion,
        templateKey: template.id,
        videoBriefId: persistedBrief.id,
      });
      await store.updateCreativeProject(request.actorUserId, project.id, {
        selectedBlueprintId: blueprint.id,
        selectedVideoProjectId: projectId,
        status: 'generated',
      });
      return reply.code(201).send({ detail, generation });
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/generate-video-versions',
    {
      schema: {
        body: generateVideoVersionsSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          201: creativeVideoVersionBatchSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate and score strict-script, fast-hook and conversion video versions',
        tags: ['ai-director', 'video-projects'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      if (!options.featureFlags.dynamicBlueprintEnabled) {
        throw new DomainNotFoundError('Dynamic Blueprint is disabled');
      }
      const store = repository();
      const project = await store.getCreativeProject(request.actorUserId, request.params.projectId);
      const existing = await store.listCreativeVideoVersions(request.actorUserId, project.id);
      if (existing.length > 0) {
        return reply.code(409).send({
          code: 'VIDEO_VERSIONS_ALREADY_GENERATED',
          message: '该创作项目已生成 A/B/C 版本；请从版本列表选择进入 Studio。',
          requestId: request.id,
        });
      }
      const source = (await store.listEditBlueprints(request.actorUserId, project.id)).find(
        (blueprint) => blueprint.id === (request.body.blueprintId ?? project.selectedBlueprintId),
      );
      if (!source) {
        return reply.code(409).send({
          code: 'BLUEPRINT_NOT_SELECTED',
          message: '请先生成并选择一个已校验剪辑蓝图。',
          requestId: request.id,
        });
      }
      const seed = request.body.seed ?? source.seed;
      const plans: Array<{ variant: VideoVersionVariant; seed: number; reason: string }> = [
        { variant: 'A', seed: seed + 101, reason: '严格遵循脚本段落与原始镜头节奏。' },
        { variant: 'B', seed: seed + 202, reason: '强化前三秒和快切节奏，优先提升 Hook。' },
        { variant: 'C', seed: seed + 303, reason: '强化卖点呈现、背景音乐与结尾 CTA。' },
      ];
      const versions = [];
      for (const plan of plans) {
        const derived = await store.createEditBlueprint(
          request.actorUserId,
          project.id,
          deriveVersionBlueprint(source, plan.variant, plan.seed),
        );
        const compiled = await app.inject({
          headers: { 'content-type': 'application/json', 'x-user-id': request.actorUserId },
          method: 'POST',
          payload: JSON.stringify({ seed: plan.seed }),
          url: `/v1/creative-projects/${project.id}/blueprints/${derived.id}/compile`,
        });
        if (compiled.statusCode !== 201) {
          const compilationError = errorResponseSchema.parse(compiled.json());
          return reply.code(409).send({
            code: 'VIDEO_VERSION_COMPILATION_FAILED',
            message: `版本 ${plan.variant} 编译失败：${compilationError.message ?? '未知错误'}`,
            requestId: request.id,
          });
        }
        const result = generatedVideoProjectSchema.parse(compiled.json());
        const scores = versionScores(
          plan.variant,
          result.generation,
          result.detail.currentRevision.projectDocument,
        );
        versions.push(
          await store.createCreativeVideoVersion(request.actorUserId, project.id, {
            ...scores,
            editBlueprintId: derived.id,
            videoProjectId: result.detail.project.id,
            variant: plan.variant,
            seed: plan.seed,
            recommendationReason: plan.reason,
          }),
        );
      }
      const recommended = [...versions].sort(
        (left, right) =>
          right.scoreBasisPoints - left.scoreBasisPoints ||
          left.variant.localeCompare(right.variant),
      )[0]!;
      return reply.code(201).send({ versions, recommendedVariant: recommended.variant });
    },
  );

  app.get(
    '/v1/creative-projects/:projectId/video-versions',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: z.array(creativeVideoVersionSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List generated, scored A/B/C video versions for a creative project',
        tags: ['ai-director', 'video-projects'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listCreativeVideoVersions(request.actorUserId, request.params.projectId);
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/select-video-version',
    {
      schema: {
        body: selectRevisionSchema,
        params: creativeProjectIdParamsSchema,
        response: { 200: creativeProjectSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Select the AI video version used for Studio and final rendering',
        tags: ['ai-director', 'feedback'],
      },
    },
    async (request) => {
      requireAiDirector();
      const store = repository();
      const project = await store.getCreativeProject(request.actorUserId, request.params.projectId);
      const version = (await store.listCreativeVideoVersions(request.actorUserId, project.id)).find(
        (candidate) => candidate.id === request.body.id,
      );
      if (!version) throw new DomainNotFoundError('Creative video version not found');
      const updated = await store.updateCreativeProject(request.actorUserId, project.id, {
        selectedBlueprintId: version.editBlueprintId,
        selectedVideoProjectId: version.videoProjectId,
        status: 'generated',
      });
      await store.createCreativeFeedbackEvent(request.actorUserId, project.hotelId, {
        eventType: 'video_version_selected',
        creativeProjectId: project.id,
        videoProjectId: version.videoProjectId,
        subjectId: version.id,
        metadata: { variant: version.variant, scoreBasisPoints: version.scoreBasisPoints },
      });
      return updated;
    },
  );

  app.get(
    '/v1/creative-projects/:projectId',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: creativeProjectSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Load one tenant-scoped AI creative project',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().getCreativeProject(request.actorUserId, request.params.projectId);
    },
  );

  app.patch(
    '/v1/creative-projects/:projectId',
    {
      schema: {
        body: updateCreativeProjectSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          200: creativeProjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Update the selected pointers or lifecycle of an AI creative project',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().updateCreativeProject(
        request.actorUserId,
        request.params.projectId,
        request.body,
      );
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/brief-revisions',
    {
      schema: {
        body: createCreativeBriefRevisionSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          201: creativeBriefRevisionSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Save a user-authored creative brief revision',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      const brief = await repository().createCreativeBriefRevision(
        request.actorUserId,
        request.params.projectId,
        { ...request.body, createdBy: 'user' },
      );
      return reply.code(201).send(brief);
    },
  );

  app.get(
    '/v1/creative-projects/:projectId/brief-revisions',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: z.array(creativeBriefRevisionSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List immutable creative brief revisions',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listCreativeBriefRevisions(request.actorUserId, request.params.projectId);
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/expand-idea',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: {
          200: z.array(creativeBriefRevisionSchema),
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate three structured creative directions from the latest brief',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      const store = repository();
      const [brief] = await store.listCreativeBriefRevisions(
        request.actorUserId,
        request.params.projectId,
      );
      if (!brief) {
        return reply.code(409).send({
          code: 'CREATIVE_BRIEF_REQUIRED',
          message: '请先保存创意输入。',
          requestId: request.id,
        });
      }
      try {
        const result = expandIdeaOutputSchema.parse(
          await generate(
            request.actorUserId,
            request.params.projectId,
            'expand_idea',
            expandIdeaOutputSchema,
            {
              brief,
            },
          ),
        );
        const project = await store.getCreativeProject(
          request.actorUserId,
          request.params.projectId,
        );
        const settings = await store.getModelProviderSettings(request.actorUserId, project.hotelId);
        const rows = await Promise.all(
          result.directions.map((direction) =>
            store.createCreativeBriefRevision(request.actorUserId, request.params.projectId, {
              createdBy: 'ai',
              direction: direction.direction,
              rawIdea: brief.rawIdea,
              objective: direction.objective,
              platform: brief.platform,
              durationSeconds: brief.durationSeconds,
              targetAudience: brief.targetAudience,
              tone: direction.tone,
              hotelSellingPoints: direction.hotelSellingPoints,
              hardConstraints: direction.hardConstraints,
              userPrompt: JSON.stringify({
                callToAction: direction.callToAction,
                hook: direction.hook,
                storyStructure: direction.storyStructure,
                title: direction.title,
              }),
              modelName: settings?.model ?? null,
              promptVersion,
              generationParameters,
              inputSummary: `Expanded brief ${brief.id}`,
            }),
          ),
        );
        return rows;
      } catch (error) {
        const configured =
          error instanceof Error && error.message === 'MODEL_PROVIDER_NOT_CONFIGURED';
        return reply.code(configured ? 409 : 502).send({
          code: configured ? 'MODEL_PROVIDER_NOT_CONFIGURED' : 'MODEL_PROVIDER_REQUEST_FAILED',
          message: configured ? '请先配置并启用百炼模型服务。' : '创意方向生成失败。',
          requestId: request.id,
        });
      }
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/select-brief',
    {
      schema: {
        body: selectRevisionSchema,
        params: creativeProjectIdParamsSchema,
        response: { 200: creativeProjectSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Select one immutable brief revision for downstream generation',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      const store = repository();
      const project = await store.updateCreativeProject(
        request.actorUserId,
        request.params.projectId,
        {
          selectedBriefRevisionId: request.body.id,
          status: 'planning',
        },
      );
      await store.createCreativeFeedbackEvent(request.actorUserId, project.hotelId, {
        eventType: 'creative_direction_selected',
        creativeProjectId: project.id,
        subjectId: request.body.id,
        metadata: {},
      });
      return project;
    },
  );

  app.get(
    '/v1/creative-projects/:projectId/scripts',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: z.array(scriptPackageSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List generated script, storyboard and shot-list revisions',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listScriptPackages(request.actorUserId, request.params.projectId);
    },
  );

  const generateScript = async (
    actorUserId: string,
    projectId: string,
    briefId: string | undefined,
    instruction: string | undefined,
  ): Promise<ScriptPackage> => {
    const store = repository();
    const project = await store.getCreativeProject(actorUserId, projectId);
    const briefs = await store.listCreativeBriefRevisions(actorUserId, projectId);
    const brief =
      briefs.find((candidate) => candidate.id === (briefId ?? project.selectedBriefRevisionId)) ??
      briefs[0];
    if (!brief) throw new Error('CREATIVE_BRIEF_REQUIRED');
    const result = scriptGenerationSchema.parse(
      await generate(
        actorUserId,
        projectId,
        instruction ? 'revise_script' : 'generate_script',
        scriptGenerationSchema,
        {
          brief,
          instruction: instruction ?? null,
          targetDurationMs: brief.durationSeconds * 1_000,
        },
      ),
    );
    const target = brief.durationSeconds * 1_000;
    if (Math.abs(result.totalDurationMs - target) > target * 0.1) {
      throw new Error('SCRIPT_DURATION_OUT_OF_RANGE');
    }
    const settings = await store.getModelProviderSettings(actorUserId, project.hotelId);
    return store.createScriptPackage(actorUserId, projectId, {
      ...result,
      modelName: settings?.model ?? null,
      promptVersion,
      generationParameters,
      inputSummary: `Brief ${brief.id}${instruction ? `; revise: ${instruction}` : ''}`,
    });
  };

  app.post(
    '/v1/creative-projects/:projectId/generate-script',
    {
      schema: {
        body: z.object({ briefRevisionId: z.uuid().optional() }).strict(),
        params: creativeProjectIdParamsSchema,
        response: {
          201: scriptPackageSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate a schema-validated script, storyboard and shot list',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      try {
        const script = await generateScript(
          request.actorUserId,
          request.params.projectId,
          request.body.briefRevisionId,
          undefined,
        );
        return reply.code(201).send(script);
      } catch (error) {
        const reason = error instanceof Error ? error.message : '';
        return reply
          .code(
            reason === 'CREATIVE_BRIEF_REQUIRED' || reason === 'MODEL_PROVIDER_NOT_CONFIGURED'
              ? 409
              : 502,
          )
          .send({
            code: reason || 'MODEL_PROVIDER_REQUEST_FAILED',
            message: '脚本生成失败，请检查创意输入和模型配置。',
            requestId: request.id,
          });
      }
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/scripts/:scriptId/revise',
    {
      schema: {
        body: reviseScriptSchema,
        params: scriptParamsSchema,
        response: {
          201: scriptPackageSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Apply a natural-language edit instruction as a new script revision',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      try {
        const source = await repository().getScriptPackage(
          request.actorUserId,
          request.params.scriptId,
        );
        if (source.creativeProjectId !== request.params.projectId) throw new DomainNotFoundError();
        const script = await generateScript(
          request.actorUserId,
          request.params.projectId,
          undefined,
          `${request.body.instruction}\n原脚本：${JSON.stringify(source)}`,
        );
        const project = await repository().getCreativeProject(
          request.actorUserId,
          request.params.projectId,
        );
        await repository().createCreativeFeedbackEvent(request.actorUserId, project.hotelId, {
          eventType: 'script_revised',
          creativeProjectId: project.id,
          subjectId: script.id,
          metadata: {
            sourceScriptId: source.id,
            sourceRevision: source.revision,
            resultRevision: script.revision,
            instruction: request.body.instruction,
          },
        });
        return reply.code(201).send(script);
      } catch (error) {
        if (error instanceof DomainNotFoundError) throw error;
        return reply.code(502).send({
          code: 'MODEL_PROVIDER_REQUEST_FAILED',
          message: '脚本修改生成失败。',
          requestId: request.id,
        });
      }
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/blueprints/generate',
    {
      schema: {
        body: generateBlueprintSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          201: editBlueprintSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate a validated versioned dynamic EditBlueprint',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      if (!options.featureFlags.dynamicBlueprintEnabled)
        throw new DomainNotFoundError('Dynamic Blueprint is disabled');
      const store = repository();
      const project = await store.getCreativeProject(request.actorUserId, request.params.projectId);
      const scriptId = request.body.scriptId ?? project.selectedScriptRevisionId;
      if (!scriptId)
        return reply
          .code(409)
          .send({ code: 'SCRIPT_NOT_SELECTED', message: '请先选择脚本。', requestId: request.id });
      const [script, requirements, profiles] = await Promise.all([
        store.getScriptPackage(request.actorUserId, scriptId),
        store.listAssetRequirements(request.actorUserId, project.id),
        store.listReferenceVideoProfiles(request.actorUserId, project.id),
      ]);
      if (script.creativeProjectId !== project.id) throw new DomainNotFoundError();
      try {
        const generated = editBlueprintGenerationSchema.parse(
          await generate(
            request.actorUserId,
            project.id,
            'generate_edit_blueprint',
            editBlueprintGenerationSchema,
            {
              script,
              assetRequirements: requirements,
              referenceProfiles: profiles,
              constraints:
                '仅使用已确认或候选素材 ID；beats 必须连续覆盖全片；禁止生成不可实现的转场或音频策略。',
            },
          ),
        );
        const seed = request.body.seed ?? 1;
        const validation = validateEditBlueprint({
          ...generated,
          id: randomUUID(),
          creativeProjectId: project.id,
          revision: 1,
          seed,
          compilerVersion: COMPILER_VERSION,
          sourceAssetIds: requirements.flatMap((item) => item.matchedAssetIds),
          referenceProfileIds: profiles.map((profile) => profile.id),
          modelName: null,
          promptVersion: null,
          generationParameters: {},
          inputSummary: null,
          createdAt: new Date().toISOString(),
          beats: generated.beats.map((beat) => ({ ...beat, id: randomUUID() })),
        });
        if (!validation.valid)
          throw new Error(
            `BLUEPRINT_INVALID:${validation.errors.map((issue) => issue.code).join(',')}`,
          );
        const current = await store.getModelProviderSettings(request.actorUserId, project.hotelId);
        const blueprint = await store.createEditBlueprint(request.actorUserId, project.id, {
          ...generated,
          seed,
          compilerVersion: COMPILER_VERSION,
          sourceAssetIds: requirements.flatMap((item) => item.matchedAssetIds),
          referenceProfileIds: profiles.map((profile) => profile.id),
          modelName: current?.model ?? null,
          promptVersion,
          generationParameters,
          inputSummary: `Script ${script.id}; ${requirements.length} asset requirements; ${profiles.length} references`,
        });
        return reply.code(201).send(blueprint);
      } catch {
        return reply.code(502).send({
          code: 'BLUEPRINT_GENERATION_FAILED',
          message: '剪辑蓝图生成或校验失败。',
          requestId: request.id,
        });
      }
    },
  );

  app.get(
    '/v1/creative-projects/:projectId/blueprints',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: z.array(editBlueprintSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List versioned EditBlueprints',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      if (!options.featureFlags.dynamicBlueprintEnabled)
        throw new DomainNotFoundError('Dynamic Blueprint is disabled');
      return repository().listEditBlueprints(request.actorUserId, request.params.projectId);
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/asset-requirements/generate',
    {
      schema: {
        body: generateAssetRequirementsSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          201: z.array(assetRequirementSchema),
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate and semantically match script asset requirements',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      const store = repository();
      const project = await store.getCreativeProject(request.actorUserId, request.params.projectId);
      const scriptId = request.body.scriptId ?? project.selectedScriptRevisionId;
      if (!scriptId) {
        return reply.code(409).send({
          code: 'SCRIPT_NOT_SELECTED',
          message: '请先选择脚本，再匹配素材。',
          requestId: request.id,
        });
      }
      const script = await store.getScriptPackage(request.actorUserId, scriptId);
      if (script.creativeProjectId !== project.id) throw new DomainNotFoundError();
      const assets = await store.listAssets(request.actorUserId, project.hotelId);
      const details = await Promise.all(
        assets
          .filter((asset) => asset.kind === 'video' && asset.status === 'ready')
          .map((asset) => store.getAssetDetail(request.actorUserId, asset.id)),
      );
      const requirements = await store.replaceAssetRequirements(
        request.actorUserId,
        project.id,
        script.shotList.map((shot) => {
          const match = matchShotRequirement(shot, details);
          return {
            scriptSceneId: shot.scriptSceneId,
            description: shot.description,
            requiredTags: shot.requiredTags,
            preferredShotType: shot.preferredShotType,
            preferredMotionType: shot.preferredMotionType,
            preferredDurationMs: shot.preferredDurationMs,
            required: shot.required,
            ...match,
          };
        }),
      );
      return reply.code(201).send(requirements);
    },
  );

  app.get(
    '/v1/creative-projects/:projectId/asset-requirements',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: z.array(assetRequirementSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List current asset requirements and their top three candidates',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listAssetRequirements(request.actorUserId, request.params.projectId);
    },
  );

  app.put(
    '/v1/creative-projects/:projectId/asset-requirements/:requirementId/assignment',
    {
      schema: {
        body: assignAssetRequirementSchema,
        params: creativeProjectIdParamsSchema.extend({ requirementId: z.uuid() }),
        response: { 200: assetRequirementSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Manually confirm an asset for a requirement',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().assignAssetRequirement(
        request.actorUserId,
        request.params.projectId,
        request.params.requirementId,
        request.body.assetId,
      );
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/reference-profiles',
    {
      schema: {
        body: createReferenceProfileSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          201: referenceVideoProfileSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate a versioned reference-video editing-language profile',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireReferenceAnalysis();
      const store = repository();
      const asset = await store.getAssetDetail(request.actorUserId, request.body.assetId);
      const durationMs = metadataDuration(asset.metadata);
      const scenes = Array.isArray(asset.segments) ? asset.segments : [];
      if (asset.kind !== 'video' || asset.status !== 'ready' || durationMs <= 0) {
        return reply.code(409).send({
          code: 'REFERENCE_VIDEO_NOT_READY',
          message: '参考视频必须是已完成分析的视频素材。',
          requestId: request.id,
        });
      }
      try {
        const generated = referenceVideoProfileGenerationSchema.parse(
          await generate(
            request.actorUserId,
            request.params.projectId,
            'analyze_reference_video',
            referenceVideoProfileGenerationSchema,
            {
              asset: {
                filename: asset.originalFilename,
                metadata: asset.metadata,
                transcript: asset.metadata['transcript'] ?? null,
                scenes,
              },
              constraints:
                '只学习叙事、节奏、字幕和镜头语言；禁止复用具体人物、台词、品牌或营销事实。',
            },
          ),
        );
        const project = await store.getCreativeProject(
          request.actorUserId,
          request.params.projectId,
        );
        const settings = await store.getModelProviderSettings(request.actorUserId, project.hotelId);
        const profile = await store.createReferenceVideoProfile(
          request.actorUserId,
          request.params.projectId,
          {
            ...generated,
            assetId: asset.id,
            durationMs,
            averageShotDurationMs: Math.max(1, Math.round(durationMs / Math.max(1, scenes.length))),
            shotCount: scenes.length,
            modelName: settings?.model ?? null,
            promptVersion,
            generationParameters,
            inputSummary: `Reference asset ${asset.id}; ${scenes.length} detected scenes`,
          },
        );
        return reply.code(201).send(profile);
      } catch (error) {
        const configured =
          error instanceof Error && error.message === 'MODEL_PROVIDER_NOT_CONFIGURED';
        return reply.code(configured ? 409 : 502).send({
          code: configured ? 'MODEL_PROVIDER_NOT_CONFIGURED' : 'REFERENCE_PROFILE_FAILED',
          message: configured ? '请先配置并启用百炼模型服务。' : '参考视频画像生成失败。',
          requestId: request.id,
        });
      }
    },
  );

  app.get(
    '/v1/creative-projects/:projectId/reference-profiles',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: z.array(referenceVideoProfileSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List versioned reference-video profiles',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireReferenceAnalysis();
      return repository().listReferenceVideoProfiles(request.actorUserId, request.params.projectId);
    },
  );

  app.post(
    '/v1/creative-projects/:projectId/select-script',
    {
      schema: {
        body: selectRevisionSchema,
        params: creativeProjectIdParamsSchema,
        response: { 200: creativeProjectSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Select the script revision used by downstream Blueprint generation',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      const store = repository();
      const script = await store.getScriptPackage(request.actorUserId, request.body.id);
      if (script.creativeProjectId !== request.params.projectId) throw new DomainNotFoundError();
      const project = await store.updateCreativeProject(
        request.actorUserId,
        request.params.projectId,
        {
          selectedScriptRevisionId: script.id,
          status: 'script_ready',
        },
      );
      await store.createCreativeFeedbackEvent(request.actorUserId, project.hotelId, {
        eventType: 'script_selected',
        creativeProjectId: project.id,
        subjectId: script.id,
        metadata: { revision: script.revision },
      });
      return project;
    },
  );
};
