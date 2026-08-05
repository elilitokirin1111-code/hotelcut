import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HotelCutRepository, PersistCreativeBriefRevisionInput } from '@hotelcut/domain';
import type { CreativeProject } from '@hotelcut/schemas';

import { buildApp } from './app.js';
import { encryptModelApiKey } from './model-provider-routes.js';

const actorUserId = '20000000-0000-4000-8000-000000000001';
const hotelId = '30000000-0000-4000-8000-000000000001';
const projectId = '91000000-0000-4000-8000-000000000001';
const now = '2026-08-05T08:00:00.000Z';
const apps: FastifyInstance[] = [];
const baseBrief = {
  id: '92000000-0000-4000-8000-000000000001',
  creativeProjectId: projectId,
  revision: 1,
  direction: null,
  rawIdea: '制作一条 16 秒酒店前台反差视频',
  objective: null,
  platform: 'douyin' as const,
  durationSeconds: 16,
  targetAudience: null,
  tone: ['轻喜剧'],
  hotelSellingPoints: ['英语接待'],
  hardConstraints: [],
  userPrompt: null,
  createdBy: 'user' as const,
  modelName: null,
  promptVersion: null,
  generationParameters: {},
  inputSummary: null,
  createdAt: now,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createRepository() {
  const projects: CreativeProject[] = [];
  const createCreativeProject = vi.fn<HotelCutRepository['createCreativeProject']>(
    (_actor, requestedHotelId, input) => {
      const project: CreativeProject = {
        id: projectId,
        hotelId: requestedHotelId,
        title: input.title,
        mode: input.mode,
        status: 'draft',
        selectedBriefRevisionId: null,
        selectedScriptRevisionId: null,
        selectedBlueprintId: null,
        selectedVideoProjectId: null,
        createdByUserId: actorUserId,
        metadata: {},
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      projects.push(project);
      return Promise.resolve(project);
    },
  );
  const getCreativeProject = vi.fn<HotelCutRepository['getCreativeProject']>(() =>
    Promise.resolve(projects[0]!),
  );
  const listCreativeProjects = vi.fn<HotelCutRepository['listCreativeProjects']>(() =>
    Promise.resolve(projects),
  );
  const updateCreativeProject = vi.fn<HotelCutRepository['updateCreativeProject']>(
    (_actor, _projectId, input) => {
      const updated: CreativeProject = {
        ...projects[0]!,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ...(input.selectedBlueprintId === undefined
          ? {}
          : { selectedBlueprintId: input.selectedBlueprintId }),
        ...(input.selectedBriefRevisionId === undefined
          ? {}
          : { selectedBriefRevisionId: input.selectedBriefRevisionId }),
        ...(input.selectedScriptRevisionId === undefined
          ? {}
          : { selectedScriptRevisionId: input.selectedScriptRevisionId }),
        ...(input.selectedVideoProjectId === undefined
          ? {}
          : { selectedVideoProjectId: input.selectedVideoProjectId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.title === undefined ? {} : { title: input.title }),
        updatedAt: now,
      };
      projects[0] = updated;
      return Promise.resolve(updated);
    },
  );
  const repository = {
    createCreativeProject,
    getCreativeProject,
    listCreativeProjects,
    updateCreativeProject,
  } as unknown as HotelCutRepository;
  return { createCreativeProject, projects, repository };
}

const enabledFlags = {
  aiDirectorEnabled: true,
  referenceAnalysisEnabled: true,
  dynamicBlueprintEnabled: true,
  aiReviewEnabled: true,
};

describe('AI Director creative project routes', () => {
  it('creates, lists, reads and updates a tenant-scoped creative project', async () => {
    const { createCreativeProject, repository } = createRepository();
    const app = await buildApp({ aiDirectorFeatureFlags: enabledFlags, repository });
    apps.push(app);
    const headers = { 'x-user-id': actorUserId };

    const created = await app.inject({
      headers,
      method: 'POST',
      payload: { mode: 'idea', title: '16 秒酒店前台反差视频' },
      url: `/v1/hotels/${hotelId}/creative-projects`,
    });
    const listed = await app.inject({
      headers,
      method: 'GET',
      url: `/v1/hotels/${hotelId}/creative-projects`,
    });
    const loaded = await app.inject({
      headers,
      method: 'GET',
      url: `/v1/creative-projects/${projectId}`,
    });
    const updated = await app.inject({
      headers,
      method: 'PATCH',
      payload: { status: 'planning' },
      url: `/v1/creative-projects/${projectId}`,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ hotelId, mode: 'idea', status: 'draft' });
    expect(listed.json()).toHaveLength(1);
    expect(loaded.json()).toMatchObject({ id: projectId });
    expect(updated.json()).toMatchObject({ id: projectId, status: 'planning' });
    expect(createCreativeProject).toHaveBeenCalledWith(
      actorUserId,
      hotelId,
      expect.objectContaining({ mode: 'idea' }),
    );
  });

  it('keeps creative project writes unavailable when the feature is disabled', async () => {
    const { createCreativeProject, repository } = createRepository();
    const app = await buildApp({ repository });
    apps.push(app);

    const response = await app.inject({
      headers: { 'x-user-id': actorUserId },
      method: 'POST',
      payload: { mode: 'idea', title: '不应创建' },
      url: `/v1/hotels/${hotelId}/creative-projects`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(createCreativeProject).not.toHaveBeenCalled();
  });

  it('calls the configured Bailian-compatible provider and persists only Zod-validated directions', async () => {
    const generatedDirections = ['稳妥转化版', '强钩子爆点版', '高级品牌版'].map((direction) => ({
      direction,
      title: `${direction}前台反差`,
      objective: '展示前台服务能力',
      hook: '她只是普通前台吗？',
      storyStructure: ['误解', '反转', 'CTA'],
      tone: ['轻喜剧', '快速'],
      hotelSellingPoints: ['英语接待', '投诉处理'],
      hardConstraints: ['CTA 为查看酒店团购'],
      callToAction: '查看酒店团购',
    }));
    const createCreativeBriefRevision = vi.fn(
      (_actor: string, _project: string, input: PersistCreativeBriefRevisionInput) =>
        Promise.resolve({
          ...baseBrief,
          ...input,
          id: `92000000-0000-4000-8000-00000000000${input.direction?.length ?? 2}`,
          revision: 2,
          direction: input.direction ?? null,
          modelName: input.modelName ?? null,
          promptVersion: input.promptVersion ?? null,
          inputSummary: input.inputSummary ?? null,
          generationParameters: input.generationParameters ?? {},
        }),
    );
    const createAiGenerationRun = vi.fn(() =>
      Promise.resolve('93000000-0000-4000-8000-000000000001'),
    );
    const finishAiGenerationRun = vi.fn(() => Promise.resolve());
    const repository = {
      createAiGenerationRun,
      createCreativeBriefRevision,
      finishAiGenerationRun,
      getCreativeProject: vi.fn(() =>
        Promise.resolve({
          id: projectId,
          hotelId,
          title: '前台反差视频',
          mode: 'idea' as const,
          status: 'draft' as const,
          selectedBriefRevisionId: baseBrief.id,
          selectedScriptRevisionId: null,
          selectedBlueprintId: null,
          selectedVideoProjectId: null,
          createdByUserId: actorUserId,
          metadata: {},
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      getModelProviderSettings: vi.fn(() =>
        Promise.resolve({
          id: '94000000-0000-4000-8000-000000000001',
          hotelId,
          provider: 'aliyun-bailian' as const,
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          apiMode: 'chat_completions' as const,
          model: 'qwen3.7-plus',
          reasoningEffort: 'none' as const,
          encryptedApiKey: encryptModelApiKey('bailian-test-key', 'test-secret'),
          apiKeyHint: 'bai••••-key',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      listCreativeBriefRevisions: vi.fn(() => Promise.resolve([baseBrief])),
    } as unknown as HotelCutRepository;
    const fetchProvider = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ directions: generatedDirections }) } },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const app = await buildApp({
      aiDirectorFeatureFlags: enabledFlags,
      modelApiConfigSecret: 'test-secret',
      modelProviderFetch: fetchProvider,
      repository,
    });
    apps.push(app);

    const response = await app.inject({
      headers: { 'x-user-id': actorUserId },
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/expand-idea`,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toHaveLength(3);
    expect(createAiGenerationRun).toHaveBeenCalledWith(
      actorUserId,
      projectId,
      expect.objectContaining({ modelName: 'qwen3.7-plus', operation: 'expand_idea' }),
    );
    expect(finishAiGenerationRun).toHaveBeenCalledTimes(1);
  });

  it('creates a versioned profile from a ready analyzed reference video', async () => {
    const assetId = '95000000-0000-4000-8000-000000000001';
    const generatedProfile = {
      narrativePattern: '前三秒快速钩子，中段用服务细节完成反转，结尾行动号召。',
      hookDurationMs: 3_000,
      paceCurve: [
        { label: 'hook', startMs: 0, endMs: 3_000 },
        { label: 'proof', startMs: 3_000, endMs: 12_000 },
      ],
      shotTypeDistribution: { wide: 2, close: 3 },
      transitionProfile: { dominant: 'hard_cut' },
      captionProfile: { placement: 'lower_third' },
      audioProfile: { speechCoverageBasisPoints: 4_000 },
      emotionalCurve: [{ label: 'surprise', startMs: 0, endMs: 12_000 }],
      reusableStyleRules: ['开场三秒内给出冲突', '服务细节使用近景'],
      analysisSummary: '适合迁移快节奏服务反转结构，不迁移具体话术。',
    };
    const createReferenceVideoProfile = vi.fn((_actor: string, _project: string, input: object) =>
      Promise.resolve({
        ...generatedProfile,
        ...input,
        id: '96000000-0000-4000-8000-000000000001',
        creativeProjectId: projectId,
        assetId,
        revision: 1,
        durationMs: 12_000,
        averageShotDurationMs: 6_000,
        shotCount: 2,
        modelName: 'qwen3.7-plus',
        promptVersion: 'ai-director-v1',
        generationParameters: { temperature: 0.2, topP: 0.9 },
        inputSummary: `Reference asset ${assetId}; 2 detected scenes`,
        createdAt: now,
      }),
    );
    const repository = {
      createAiGenerationRun: vi.fn(() => Promise.resolve('93000000-0000-4000-8000-000000000001')),
      createReferenceVideoProfile,
      finishAiGenerationRun: vi.fn(() => Promise.resolve()),
      getAssetDetail: vi.fn(() =>
        Promise.resolve({
          id: assetId,
          kind: 'video',
          status: 'ready',
          originalFilename: 'reference.mp4',
          metadata: {
            probe: { durationMs: 12_000 },
            transcript: { text: '欢迎入住' },
            referenceFeatures: { sceneCount: 2 },
          },
          segments: [
            { id: 'segment-1', startMs: 0, endMs: 6_000 },
            { id: 'segment-2', startMs: 6_000, endMs: 12_000 },
          ],
        }),
      ),
      getCreativeProject: vi.fn(() =>
        Promise.resolve({
          id: projectId,
          hotelId,
          title: '前台反差视频',
          mode: 'reference',
          status: 'draft',
          selectedBriefRevisionId: null,
          selectedScriptRevisionId: null,
          selectedBlueprintId: null,
          selectedVideoProjectId: null,
          createdByUserId: actorUserId,
          metadata: {},
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      getModelProviderSettings: vi.fn(() =>
        Promise.resolve({
          id: '94000000-0000-4000-8000-000000000001',
          hotelId,
          provider: 'aliyun-bailian' as const,
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          apiMode: 'chat_completions' as const,
          model: 'qwen3.7-plus',
          reasoningEffort: 'none' as const,
          encryptedApiKey: encryptModelApiKey('bailian-test-key', 'test-secret'),
          apiKeyHint: 'bai••••-key',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    } as unknown as HotelCutRepository;
    const fetchProvider = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(generatedProfile) } }] }),
          { status: 200 },
        ),
      ),
    );
    const app = await buildApp({
      aiDirectorFeatureFlags: enabledFlags,
      modelApiConfigSecret: 'test-secret',
      modelProviderFetch: fetchProvider,
      repository,
    });
    apps.push(app);

    const response = await app.inject({
      headers: { 'x-user-id': actorUserId },
      method: 'POST',
      payload: { assetId },
      url: `/v1/creative-projects/${projectId}/reference-profiles`,
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ assetId, revision: 1, shotCount: 2 });
    expect(createReferenceVideoProfile).toHaveBeenCalledWith(
      actorUserId,
      projectId,
      expect.objectContaining({ assetId, averageShotDurationMs: 6_000, shotCount: 2 }),
    );
  });
});
