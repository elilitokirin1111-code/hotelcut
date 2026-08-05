import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Asset, AuthSession } from '@hotelcut/schemas';

import { demoProject } from '../editor/demo-data';
import { WorkspaceApiError, type WorkspaceApi } from './workspace-api';
import { WorkspaceApp } from './workspace-app';

const organization = {
  id: '10000000-0000-4000-8000-000000000001',
  name: '云栖酒店集团（演示）',
  slug: 'cloud-rest-demo',
  createdAt: '2026-07-28T08:00:00.000Z',
  updatedAt: '2026-07-28T08:00:00.000Z',
};
const hotels = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    organizationId: organization.id,
    name: '云栖湖畔酒店（虚构）',
    city: '杭州',
    address: '示例路 88 号',
    timezone: 'Asia/Shanghai',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    organizationId: organization.id,
    name: '云栖山居酒店（虚构）',
    city: '黄山',
    address: null,
    timezone: 'Asia/Shanghai',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
];
const session: AuthSession = {
  user: {
    id: '20000000-0000-4000-8000-000000000001',
    email: 'owner@hotelcut.example',
    displayName: '演示管理员',
    status: 'active',
  },
  expiresAt: '2026-08-04T08:00:00.000Z',
};
const brandKit = {
  id: '40000000-0000-4000-8000-000000000001',
  hotelId: hotels[0]!.id,
  primaryColor: '#17324D',
  secondaryColor: '#F5EFE6',
  accentColor: '#C99A5B',
  fontFamily: 'Noto Sans SC',
  subtitleStyle: 'clean',
  endingText: '在湖畔，住进一段慢时光',
  contactText: '400-000-0000（演示）',
  logoAssetId: null,
  createdAt: '2026-07-28T08:00:00.000Z',
  updatedAt: '2026-07-28T08:00:00.000Z',
};
const assets = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    hotelId: hotels[0]!.id,
    kind: 'video' as const,
    status: 'ready' as const,
    originalFilename: '湖景房介绍.mp4',
    contentType: 'video/mp4',
    byteSize: 8_388_608,
    storageBucket: 'hotelcut-local',
    storageKey: 'hotels/demo/assets/ready/original',
    checksumSha256: 'a'.repeat(64),
    metadata: {
      durationMs: 30_000,
      frameRate: 30,
      height: 1920,
      vision: {
        model: 'gpt-5.6-terra-2026-07-01',
        qualityScore: 89,
        sellingPoints: ['自然采光', '湖景客房'],
        status: 'succeeded',
        summary: '明亮整洁的湖景客房，适合展示空间与窗景。',
        tags: ['room', 'bright', 'window', 'clean'],
      },
      width: 1080,
    },
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:05:00.000Z',
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    hotelId: hotels[0]!.id,
    kind: 'video' as const,
    status: 'failed' as const,
    originalFilename: '大堂口播.mp4',
    contentType: 'video/mp4',
    byteSize: 4_194_304,
    storageBucket: 'hotelcut-local',
    storageKey: 'hotels/demo/assets/failed/original',
    checksumSha256: 'b'.repeat(64),
    metadata: {},
    createdAt: '2026-07-28T08:10:00.000Z',
    updatedAt: '2026-07-28T08:15:00.000Z',
  },
];
const projectTemplates = [
  {
    key: 'hotel.host-broll',
    version: '1.0.0',
    name: '真人口播与环境穿插',
    description: '真人讲解为主线，自动穿插大堂、客房和服务画面。',
    minDurationSeconds: 30,
    maxDurationSeconds: 60,
    requiredTags: ['booking', 'lobby', 'room', 'welcome'],
  },
  {
    key: 'hotel.promotion',
    version: '1.0.0',
    name: '酒店活动推广',
    description: '聚焦酒店、服务和活动权益。',
    minDurationSeconds: 15,
    maxDurationSeconds: 25,
    requiredTags: ['exterior', 'promotion', 'room', 'service'],
  },
];
const videoBrief = {
  id: '50000000-0000-4000-8000-000000000001',
  hotelId: hotels[0]!.id,
  title: '湖畔周末礼遇',
  platform: 'douyin' as const,
  durationSeconds: 30,
  aspectRatio: '9:16' as const,
  tone: '温暖高级',
  language: 'zh-CN',
  objective: '提升周末咨询',
  targetAudience: '周末度假客群',
  callToAction: '联系酒店',
  createdAt: '2026-07-30T02:00:00.000Z',
  updatedAt: '2026-07-30T02:00:00.000Z',
};
const videoProject = {
  id: '60000000-0000-4000-8000-000000000001',
  hotelId: hotels[0]!.id,
  videoBriefId: videoBrief.id,
  name: videoBrief.title,
  templateKey: 'hotel.host-broll',
  status: 'draft' as const,
  currentRevision: 1,
  createdAt: '2026-07-30T02:00:00.000Z',
  updatedAt: '2026-07-30T02:00:00.000Z',
};
const generatedProjectDocument = {
  ...demoProject,
  hotelId: hotels[0]!.id,
  id: videoProject.id,
  name: videoProject.name,
};
const videoProjectDetail = {
  project: videoProject,
  currentRevision: {
    id: '61000000-0000-4000-8000-000000000001',
    videoProjectId: videoProject.id,
    revision: 1,
    schemaVersion: '1.0.0',
    projectDocument: generatedProjectDocument,
    createdByUserId: session.user.id,
    createdAt: '2026-07-30T02:00:00.000Z',
  },
};

function detailFor(asset: Asset) {
  return {
    ...asset,
    derivatives:
      asset.status === 'ready'
        ? [
            {
              id: '71000000-0000-4000-8000-000000000001',
              assetId: asset.id,
              kind: 'proxy' as const,
              storageBucket: 'hotelcut-local',
              storageKey: `${asset.storageKey}/proxy`,
              contentType: 'video/mp4',
              byteSize: 1_048_576,
              checksumSha256: 'c'.repeat(64),
              createdAt: asset.createdAt,
              updatedAt: asset.updatedAt,
            },
          ]
        : [],
    segments: [],
    analysisJobs: [
      {
        id:
          asset.status === 'ready'
            ? '72000000-0000-4000-8000-000000000001'
            : '72000000-0000-4000-8000-000000000002',
        assetId: asset.id,
        status:
          asset.status === 'ready'
            ? ('succeeded' as const)
            : asset.status === 'failed'
              ? ('failed' as const)
              : ('queued' as const),
        attempt: 1,
        maxAttempts: 3,
        logs: [
          {
            at: '2026-07-28T08:05:00.000Z',
            level: asset.status === 'failed' ? ('error' as const) : ('info' as const),
            message:
              asset.status === 'ready'
                ? '分析完成'
                : asset.status === 'failed'
                  ? '无法读取视频'
                  : '等待分析',
          },
        ],
        errorCode: asset.status === 'failed' ? 'PROBE_FAILED' : null,
        errorMessage: asset.status === 'failed' ? '无法读取视频' : null,
        startedAt: '2026-07-28T08:01:00.000Z',
        finishedAt: '2026-07-28T08:05:00.000Z',
        createdAt: '2026-07-28T08:00:30.000Z',
        updatedAt: '2026-07-28T08:05:00.000Z',
      },
    ],
  };
}

function createApi(initialSession: AuthSession | null): {
  api: WorkspaceApi;
  cancelRenderJob: ReturnType<typeof vi.fn<WorkspaceApi['cancelRenderJob']>>;
  createRenderJob: ReturnType<typeof vi.fn<WorkspaceApi['createRenderJob']>>;
  createVideoBrief: ReturnType<typeof vi.fn<WorkspaceApi['createVideoBrief']>>;
  createManualSegment: ReturnType<typeof vi.fn<WorkspaceApi['createManualSegment']>>;
  generateAiEditPlan: ReturnType<typeof vi.fn<WorkspaceApi['generateAiEditPlan']>>;
  generateVideoProject: ReturnType<typeof vi.fn<WorkspaceApi['generateVideoProject']>>;
  getModelProviderSettings: ReturnType<typeof vi.fn<WorkspaceApi['getModelProviderSettings']>>;
  getSession: ReturnType<typeof vi.fn<WorkspaceApi['getSession']>>;
  getAssetDerivativeDownload: ReturnType<typeof vi.fn<WorkspaceApi['getAssetDerivativeDownload']>>;
  getAssetDetail: ReturnType<typeof vi.fn<WorkspaceApi['getAssetDetail']>>;
  getRenderArtifactDownload: ReturnType<typeof vi.fn<WorkspaceApi['getRenderArtifactDownload']>>;
  getRenderJob: ReturnType<typeof vi.fn<WorkspaceApi['getRenderJob']>>;
  getVideoProject: ReturnType<typeof vi.fn<WorkspaceApi['getVideoProject']>>;
  listAssets: ReturnType<typeof vi.fn<WorkspaceApi['listAssets']>>;
  listProjectTemplates: ReturnType<typeof vi.fn<WorkspaceApi['listProjectTemplates']>>;
  listRenderJobs: ReturnType<typeof vi.fn<WorkspaceApi['listRenderJobs']>>;
  listVideoProjects: ReturnType<typeof vi.fn<WorkspaceApi['listVideoProjects']>>;
  loadHotelConfiguration: ReturnType<typeof vi.fn<WorkspaceApi['loadHotelConfiguration']>>;
  loadWorkspace: ReturnType<typeof vi.fn<WorkspaceApi['loadWorkspace']>>;
  login: ReturnType<typeof vi.fn<WorkspaceApi['login']>>;
  logout: ReturnType<typeof vi.fn<WorkspaceApi['logout']>>;
  retryAssetAnalysis: ReturnType<typeof vi.fn<WorkspaceApi['retryAssetAnalysis']>>;
  retryRenderJob: ReturnType<typeof vi.fn<WorkspaceApi['retryRenderJob']>>;
  saveBrandKit: ReturnType<typeof vi.fn<WorkspaceApi['saveBrandKit']>>;
  saveModelProviderSettings: ReturnType<typeof vi.fn<WorkspaceApi['saveModelProviderSettings']>>;
  saveProjectRevision: ReturnType<typeof vi.fn<WorkspaceApi['saveProjectRevision']>>;
  testModelProvider: ReturnType<typeof vi.fn<WorkspaceApi['testModelProvider']>>;
  updateHotel: ReturnType<typeof vi.fn<WorkspaceApi['updateHotel']>>;
  uploadVideo: ReturnType<typeof vi.fn<WorkspaceApi['uploadVideo']>>;
} {
  const getSession = vi.fn<WorkspaceApi['getSession']>().mockResolvedValue(initialSession);
  const getAiDirectorFeatures = vi.fn<WorkspaceApi['getAiDirectorFeatures']>().mockResolvedValue({
    aiDirectorEnabled: true,
    aiReviewEnabled: true,
    dynamicBlueprintEnabled: true,
    referenceAnalysisEnabled: true,
  });
  const listCreativeProjects = vi.fn<WorkspaceApi['listCreativeProjects']>().mockResolvedValue([]);
  const createCreativeProject = vi
    .fn<WorkspaceApi['createCreativeProject']>()
    .mockRejectedValue(new Error('Creative project creation is not configured in this test'));
  const getCreativeProject = vi
    .fn<WorkspaceApi['getCreativeProject']>()
    .mockRejectedValue(new Error('Creative project lookup is not configured in this test'));
  const updateCreativeProject = vi
    .fn<WorkspaceApi['updateCreativeProject']>()
    .mockRejectedValue(new Error('Creative project updates are not configured in this test'));
  const loadHotelConfiguration = vi
    .fn<WorkspaceApi['loadHotelConfiguration']>()
    .mockImplementation((hotelId) => {
      const hotel = hotels.find((candidate) => candidate.id === hotelId);
      if (!hotel) {
        return Promise.reject(new Error('Hotel not found'));
      }
      return Promise.resolve({ brandKit: { ...brandKit, hotelId }, hotel });
    });
  const loadWorkspace = vi
    .fn<WorkspaceApi['loadWorkspace']>()
    .mockResolvedValue({ hotels, organizations: [organization] });
  const login = vi.fn<WorkspaceApi['login']>().mockResolvedValue(session);
  const logout = vi.fn<WorkspaceApi['logout']>().mockResolvedValue();
  const listAssets = vi.fn<WorkspaceApi['listAssets']>().mockResolvedValue(assets);
  const getAssetDetail = vi.fn<WorkspaceApi['getAssetDetail']>().mockImplementation((assetId) => {
    const asset = assets.find((candidate) => candidate.id === assetId);
    return asset ? Promise.resolve(detailFor(asset)) : Promise.reject(new Error('Asset not found'));
  });
  const getAssetDerivativeDownload = vi
    .fn<WorkspaceApi['getAssetDerivativeDownload']>()
    .mockResolvedValue({ expiresInSeconds: 900, url: 'https://media.test/proxy.mp4' });
  const uploadVideo = vi
    .fn<WorkspaceApi['uploadVideo']>()
    .mockImplementation((_, __, onProgress) => {
      onProgress?.({
        completedBytes: 100,
        percent: 100,
        phase: 'finalizing',
        totalBytes: 100,
      });
      return Promise.resolve({
        analysisJobId: '72000000-0000-4000-8000-000000000003',
        assetId: assets[0]!.id,
        status: 'queued',
      });
    });
  const retryAssetAnalysis = vi.fn<WorkspaceApi['retryAssetAnalysis']>().mockResolvedValue({
    analysisJobId: '72000000-0000-4000-8000-000000000004',
    assetId: assets[1]!.id,
    status: 'queued',
  });
  const createManualSegment = vi
    .fn<WorkspaceApi['createManualSegment']>()
    .mockImplementation((assetId, input) =>
      Promise.resolve({
        id: '73000000-0000-4000-8000-000000000001',
        assetId,
        startMs: input.startMs,
        endMs: input.endMs,
        label: input.label,
        kind: 'manual',
        source: 'manual',
        scoreBasisPoints: input.scoreBasisPoints ?? null,
        createdByUserId: session.user.id,
        metadata: input.metadata,
        createdAt: '2026-07-29T08:00:00.000Z',
        updatedAt: '2026-07-29T08:00:00.000Z',
      }),
    );
  const listProjectTemplates = vi
    .fn<WorkspaceApi['listProjectTemplates']>()
    .mockResolvedValue(projectTemplates);
  const listVideoProjects = vi.fn<WorkspaceApi['listVideoProjects']>().mockResolvedValue([]);
  const listRenderJobs = vi.fn<WorkspaceApi['listRenderJobs']>().mockResolvedValue([]);
  const createRenderJob = vi
    .fn<WorkspaceApi['createRenderJob']>()
    .mockRejectedValue(new Error('Render not configured in this workspace test'));
  const getRenderJob = vi
    .fn<WorkspaceApi['getRenderJob']>()
    .mockRejectedValue(new Error('Render not configured in this workspace test'));
  const cancelRenderJob = vi
    .fn<WorkspaceApi['cancelRenderJob']>()
    .mockRejectedValue(new Error('Render not configured in this workspace test'));
  const retryRenderJob = vi
    .fn<WorkspaceApi['retryRenderJob']>()
    .mockRejectedValue(new Error('Render not configured in this workspace test'));
  const getRenderArtifactDownload = vi
    .fn<WorkspaceApi['getRenderArtifactDownload']>()
    .mockRejectedValue(new Error('Render not configured in this workspace test'));
  const getVideoProject = vi
    .fn<WorkspaceApi['getVideoProject']>()
    .mockResolvedValue(videoProjectDetail);
  const createVideoBrief = vi
    .fn<WorkspaceApi['createVideoBrief']>()
    .mockImplementation((hotelId, input) =>
      Promise.resolve({
        ...videoBrief,
        ...input,
        callToAction: input.callToAction ?? null,
        hotelId,
        objective: input.objective ?? null,
        targetAudience: input.targetAudience ?? null,
      }),
    );
  const generateVideoProject = vi.fn<WorkspaceApi['generateVideoProject']>().mockResolvedValue({
    detail: videoProjectDetail,
    generation: {
      seed: 20260730,
      selectedSlots: 6,
      templateKey: videoProject.templateKey,
      templateVersion: '1.0.0',
      totalSlots: 6,
      usedAssetIds: [assets[0]!.id],
      warnings: [],
    },
  });
  const saveProjectRevision = vi
    .fn<WorkspaceApi['saveProjectRevision']>()
    .mockImplementation((projectId, input) =>
      Promise.resolve({
        project: {
          ...videoProject,
          currentRevision: input.baseRevision + 1,
          id: projectId,
          updatedAt: '2026-07-30T02:05:00.000Z',
        },
        currentRevision: {
          ...videoProjectDetail.currentRevision,
          id: '61000000-0000-4000-8000-000000000002',
          projectDocument: input.projectDocument,
          revision: input.baseRevision + 1,
          videoProjectId: projectId,
          createdAt: '2026-07-30T02:05:00.000Z',
        },
      }),
    );
  const saveBrandKit = vi.fn<WorkspaceApi['saveBrandKit']>().mockImplementation((hotelId, input) =>
    Promise.resolve({
      ...brandKit,
      ...input,
      contactText: input.contactText ?? null,
      hotelId,
      logoAssetId: input.logoAssetId ?? null,
      updatedAt: '2026-07-29T08:00:00.000Z',
    }),
  );
  const updateHotel = vi.fn<WorkspaceApi['updateHotel']>().mockImplementation((hotelId, input) => {
    const hotel = hotels.find((candidate) => candidate.id === hotelId)!;
    return Promise.resolve({
      ...hotel,
      address: input.address === undefined ? hotel.address : input.address,
      city: input.city ?? hotel.city,
      name: input.name ?? hotel.name,
      timezone: input.timezone ?? hotel.timezone,
      updatedAt: '2026-07-29T08:00:00.000Z',
    });
  });
  const modelProviderSettings = {
    apiKeyConfigured: false,
    apiKeyHint: null,
    apiMode: 'responses' as const,
    baseUrl: 'https://api.openai.com/v1',
    createdAt: null,
    enabled: true,
    hotelId: hotels[0]!.id,
    model: 'gpt-5.6',
    provider: 'openai' as const,
    reasoningEffort: 'medium' as const,
    updatedAt: null,
  };
  const getModelProviderSettings = vi
    .fn<WorkspaceApi['getModelProviderSettings']>()
    .mockImplementation((hotelId) => Promise.resolve({ ...modelProviderSettings, hotelId }));
  const saveModelProviderSettings = vi
    .fn<WorkspaceApi['saveModelProviderSettings']>()
    .mockImplementation((hotelId, input) =>
      Promise.resolve({
        ...modelProviderSettings,
        ...input,
        apiKeyConfigured: Boolean(input.apiKey),
        apiKeyHint: input.apiKey ? `…${input.apiKey.slice(-4)}` : null,
        createdAt: '2026-08-04T08:00:00.000Z',
        hotelId,
        updatedAt: '2026-08-04T08:00:00.000Z',
      }),
    );
  const testModelProvider = vi.fn<WorkspaceApi['testModelProvider']>().mockResolvedValue({
    latencyMs: 120,
    message: '模型连接成功',
    model: 'gpt-5.6',
    ok: true,
  });
  const generateAiEditPlan = vi.fn<WorkspaceApi['generateAiEditPlan']>().mockResolvedValue({
    cta: '立即预订',
    hook: '住进西湖边，把风景留在窗前。',
    narrative: '用真实客房、窗景和服务镜头建立可信的入住体验。',
    recommendedTemplateKey: projectTemplates[0]!.key,
    risks: [],
    shotStrategy: [
      { purpose: '抓住注意力', seconds: 3, sequence: 1, visual: '窗景开场' },
      { purpose: '建立信任', seconds: 8, sequence: 2, visual: '客房与服务细节' },
    ],
    subtitleStyle: '高对比白字，关键词使用品牌强调色',
  });
  return {
    api: {
      cancelRenderJob,
      createCreativeProject,
      createRenderJob,
      createManualSegment,
      createVideoBrief,
      generateAiEditPlan,
      generateVideoProject,
      getAssetDerivativeDownload,
      getAssetDetail,
      getAiDirectorFeatures,
      getCreativeProject,
      getRenderArtifactDownload,
      getRenderJob,
      getSession,
      getModelProviderSettings,
      getVideoProject,
      listAssets,
      listCreativeProjects,
      listProjectTemplates,
      listRenderJobs,
      listVideoProjects,
      loadHotelConfiguration,
      loadWorkspace,
      login,
      logout,
      retryAssetAnalysis,
      retryRenderJob,
      saveBrandKit,
      saveModelProviderSettings,
      saveProjectRevision,
      testModelProvider,
      updateCreativeProject,
      updateHotel,
      uploadVideo,
    },
    cancelRenderJob,
    createRenderJob,
    createManualSegment,
    createVideoBrief,
    generateAiEditPlan,
    generateVideoProject,
    getAssetDerivativeDownload,
    getAssetDetail,
    getRenderArtifactDownload,
    getRenderJob,
    getVideoProject,
    getSession,
    getModelProviderSettings,
    listAssets,
    listProjectTemplates,
    listRenderJobs,
    listVideoProjects,
    loadHotelConfiguration,
    loadWorkspace,
    login,
    logout,
    retryAssetAnalysis,
    retryRenderJob,
    saveBrandKit,
    saveModelProviderSettings,
    saveProjectRevision,
    testModelProvider,
    updateHotel,
    uploadVideo,
  };
}

describe('M7 email-authenticated hotel workspace', () => {
  it('opens the first hotel workbench without login and configures a real model connection', async () => {
    const {
      api,
      getModelProviderSettings,
      getSession,
      loadWorkspace,
      saveModelProviderSettings,
      testModelProvider,
    } = createApi(null);
    render(<WorkspaceApp api={api} />);

    expect(
      await screen.findByRole('heading', { name: '下午好，今天继续产出好内容。' }),
    ).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
    expect(loadWorkspace).toHaveBeenCalledWith(expect.any(AbortSignal));

    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(await screen.findByRole('heading', { name: '大模型 API 配置' })).toBeInTheDocument();
    expect(getModelProviderSettings).toHaveBeenCalledWith(hotels[0]!.id, expect.any(AbortSignal));

    fireEvent.change(screen.getByLabelText('服务类型'), {
      target: { value: 'aliyun-bailian' },
    });
    expect(screen.getByLabelText('API Base URL')).toHaveValue(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
    expect(screen.getByLabelText('模型')).toHaveValue('qwen3.7-plus');
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-hotelcut-ui-test-key-123456789' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并测试真实连接' }));

    await waitFor(() =>
      expect(saveModelProviderSettings).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          apiKey: 'sk-hotelcut-ui-test-key-123456789',
          apiMode: 'chat_completions',
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: 'qwen3.7-plus',
          provider: 'aliyun-bailian',
          reasoningEffort: 'none',
        }),
      ),
    );
    await waitFor(() => expect(testModelProvider).toHaveBeenCalledWith(hotels[0]!.id));
    expect(await screen.findByText('连接成功')).toBeInTheDocument();
  });

  it('creates a server session before loading tenant-visible hotels', async () => {
    const { api, loadWorkspace, login } = createApi(null);
    render(<WorkspaceApp api={api} guestMode={false} />);

    expect(await screen.findByRole('heading', { name: '酒店短视频工作空间' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '登录工作空间' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('owner@hotelcut.example', 'hotelcut-local'),
    );
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledWith(expect.any(AbortSignal)));
    expect(screen.getByRole('heading', { name: '选择酒店' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('酒店列表')).getAllByRole('article')).toHaveLength(2);
  });

  it('restores a valid session, searches hotels and enters the selected workspace', async () => {
    render(<WorkspaceApp api={createApi(session).api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索酒店' }), {
      target: { value: '黄山' },
    });
    expect(screen.queryByText('云栖湖畔酒店（虚构）')).not.toBeInTheDocument();
    expect(screen.getByText('云栖山居酒店（虚构）')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '进入 云栖山居酒店（虚构）' }));
    expect(screen.getByRole('heading', { name: '云栖山居酒店（虚构）' })).toBeInTheDocument();
    expect(screen.getByLabelText('酒店工作空间模块')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回酒店列表' }));
    expect(screen.getByRole('heading', { name: '选择酒店' })).toBeInTheDocument();
  });

  it('opens the tenant-scoped render center module', async () => {
    const { api, listVideoProjects } = createApi(session);
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开渲染中心' }));

    expect(await screen.findByRole('heading', { name: '渲染中心', level: 2 })).toBeInTheDocument();
    await waitFor(() =>
      expect(listVideoProjects).toHaveBeenCalledWith(hotels[0]!.id, expect.any(AbortSignal)),
    );
    expect(screen.getByText('还没有可渲染的视频项目')).toBeInTheDocument();
  });

  it('loads, edits and saves hotel and BrandKit configuration', async () => {
    const { api, loadHotelConfiguration, saveBrandKit, updateHotel } = createApi(session);
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开酒店配置' }));
    await screen.findByRole('heading', { name: '酒店资料与品牌配置' });
    await waitFor(() =>
      expect(loadHotelConfiguration).toHaveBeenCalledWith(hotels[0]!.id, expect.any(AbortSignal)),
    );

    fireEvent.change(screen.getByLabelText('酒店名称'), {
      target: { value: '云栖湖畔度假酒店（虚构）' },
    });
    fireEvent.change(screen.getByLabelText('城市'), {
      target: { value: '苏州' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存酒店资料' }));

    await waitFor(() =>
      expect(updateHotel).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          city: '苏州',
          name: '云栖湖畔度假酒店（虚构）',
        }),
      ),
    );
    expect(await screen.findByText('酒店资料已保存')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '云栖湖畔度假酒店（虚构）' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('强调色'), {
      target: { value: '#b87333' },
    });
    fireEvent.change(screen.getByLabelText('默认片尾文案'), {
      target: { value: '今晚，住进湖畔慢时光' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存品牌配置' }));

    await waitFor(() =>
      expect(saveBrandKit).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          accentColor: '#b87333',
          endingText: '今晚，住进湖畔慢时光',
          logoAssetId: null,
        }),
      ),
    );
    expect(await screen.findByText('品牌配置已保存')).toBeInTheDocument();
  });

  it('operates the production asset library through tenant-scoped APIs', async () => {
    const {
      api,
      createManualSegment,
      getAssetDetail,
      listAssets,
      retryAssetAnalysis,
      uploadVideo,
    } = createApi(session);
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开素材库' }));
    expect(await screen.findByRole('heading', { name: '生产素材库' })).toBeInTheDocument();
    await waitFor(() =>
      expect(listAssets).toHaveBeenCalledWith(hotels[0]!.id, expect.any(AbortSignal)),
    );
    expect(
      await within(screen.getByLabelText('素材列表')).findByText('湖景房介绍.mp4'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getAssetDetail).toHaveBeenCalledWith(assets[0]!.id, expect.anything()),
    );
    expect(await screen.findByRole('region', { name: 'AI 素材理解结果' })).toHaveTextContent(
      '已进入自动选片',
    );
    expect(screen.getByText('明亮整洁的湖景客房，适合展示空间与窗景。')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索素材文件名' }), {
      target: { value: '大堂' },
    });
    expect(
      within(screen.getByLabelText('素材列表')).queryByText('湖景房介绍.mp4'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /大堂口播\.mp4/ }));
    fireEvent.click(await screen.findByRole('button', { name: '重新分析' }));
    await waitFor(() => expect(retryAssetAnalysis).toHaveBeenCalledWith(assets[1]!.id));

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索素材文件名' }), {
      target: { value: '湖景' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /湖景房介绍\.mp4/ }));
    await screen.findByLabelText('素材代理视频预览');
    fireEvent.change(screen.getByLabelText('标签'), { target: { value: '湖景房' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));
    await waitFor(() =>
      expect(createManualSegment).toHaveBeenCalledWith(
        assets[0]!.id,
        expect.objectContaining({ endMs: 30_000, label: '湖景房', startMs: 0 }),
      ),
    );

    const file = new File(['hotelcut-video'], '新客房素材.mp4', { type: 'video/mp4' });
    const music = new File(['hotelcut-audio'], '度假背景音乐.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('选择视频或音频文件'), {
      target: { files: [file, music] },
    });
    fireEvent.click(screen.getByRole('button', { name: '批量上传并自动分析' }));
    await waitFor(() =>
      expect(uploadVideo).toHaveBeenCalledWith(hotels[0]!.id, file, expect.any(Function)),
    );
    await waitFor(() =>
      expect(uploadVideo).toHaveBeenCalledWith(hotels[0]!.id, music, expect.any(Function)),
    );
    expect(await screen.findByText('2 个素材上传完成，已进入自动分析队列')).toBeInTheDocument();
  });

  it('refreshes selected asset detail when analysis changes the list status', async () => {
    const { api, getAssetDetail, listAssets } = createApi(session);
    const uploadedAsset: Asset = {
      ...assets[0]!,
      status: 'uploaded',
      updatedAt: '2026-07-29T08:00:00.000Z',
    };
    const readyAsset: Asset = {
      ...assets[0]!,
      status: 'ready',
      updatedAt: '2026-07-29T08:01:00.000Z',
    };
    listAssets
      .mockResolvedValueOnce([uploadedAsset])
      .mockResolvedValueOnce([uploadedAsset])
      .mockResolvedValue([readyAsset]);
    getAssetDetail
      .mockResolvedValueOnce(detailFor(uploadedAsset))
      .mockResolvedValue(detailFor(readyAsset));
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开素材库' }));
    expect(await screen.findByRole('button', { name: /等待分析/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));

    expect(await screen.findByRole('button', { name: /可用于剪辑/ })).toBeInTheDocument();
    await waitFor(() => expect(getAssetDetail).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('素材代理视频预览')).toBeInTheDocument();
  });

  it('creates a brief, selects a template and saves an automatic edit project', async () => {
    const {
      api,
      createVideoBrief,
      generateAiEditPlan,
      generateVideoProject,
      listProjectTemplates,
    } = createApi(session);
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开视频项目' }));
    expect(await screen.findByRole('heading', { name: '创建自动剪辑项目' })).toBeInTheDocument();
    await waitFor(() => expect(listProjectTemplates).toHaveBeenCalledWith(expect.any(AbortSignal)));

    fireEvent.click(screen.getByLabelText(/酒店活动推广/));
    fireEvent.change(screen.getByLabelText('项目标题'), {
      target: { value: '湖畔周末礼遇' },
    });
    fireEvent.change(screen.getByLabelText('传播目标'), {
      target: { value: '提升周末咨询' },
    });
    fireEvent.change(screen.getByLabelText('行动引导（仅使用已确认文案）'), {
      target: { value: '联系酒店' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成真实方案' }));
    await waitFor(() =>
      expect(generateAiEditPlan).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({ callToAction: '联系酒店', title: '湖畔周末礼遇' }),
      ),
    );
    expect(await screen.findByText('住进西湖边，把风景留在窗前。')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/酒店活动推广/));
    fireEvent.click(screen.getByRole('button', { name: '生成并保存剪辑项目' }));

    await waitFor(() =>
      expect(createVideoBrief).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          callToAction: '联系酒店',
          durationSeconds: 20,
          objective: '提升周末咨询',
          title: '湖畔周末礼遇',
        }),
      ),
    );
    await waitFor(() =>
      expect(generateVideoProject).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          templateKey: 'hotel.promotion',
          videoBriefId: videoBrief.id,
        }),
      ),
    );
    expect(await screen.findByText(/自动剪辑已保存为项目修订 1/)).toBeInTheDocument();
    expect(screen.getByText('已匹配 6/6 个画面槽位')).toBeInTheDocument();
    expect(screen.getByText('编排无警告')).toBeInTheDocument();
  });

  it('turns automatic edit warnings into actionable production guidance', async () => {
    const { api, generateVideoProject } = createApi(session);
    generateVideoProject.mockResolvedValueOnce({
      detail: videoProjectDetail,
      generation: {
        seed: 20260730,
        selectedSlots: 3,
        templateKey: 'hotel.promotion',
        templateVersion: '1.1.0',
        totalSlots: 4,
        usedAssetIds: [assets[0]!.id],
        warnings: [
          {
            code: 'BACKGROUND_MUSIC_MISSING',
            message:
              'No eligible background music was available; source ambience fallback is active',
            severity: 'info',
            path: 'media',
          },
          {
            code: 'SLOT_REQUIREMENT_UNMET',
            message: 'No eligible media for promo.offer',
            severity: 'warning',
            path: 'slots.promo.offer',
          },
        ],
      },
    });
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开视频项目' }));
    await screen.findByRole('heading', { name: '创建自动剪辑项目' });
    fireEvent.click(screen.getByLabelText(/酒店活动推广/));
    fireEvent.change(screen.getByLabelText('项目标题'), {
      target: { value: '湖畔周末礼遇' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成并保存剪辑项目' }));

    expect(await screen.findByText('已启用原视频环境声')).toBeInTheDocument();
    expect(
      screen.getByText('系统会用低音量环境声铺满成片；请在渲染中心核对音频质检结果。'),
    ).toBeInTheDocument();
    expect(screen.getByText('缺少活动优惠素材')).toBeInTheDocument();
    expect(
      screen.getByText('请在素材库为一段可用视频添加“活动优惠”标签后重新生成。'),
    ).toBeInTheDocument();
  });

  it('opens a generated project in Studio and autosaves an immutable revision', async () => {
    const { api, saveProjectRevision } = createApi(session);
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开视频项目' }));
    await screen.findByRole('heading', { name: '创建自动剪辑项目' });
    fireEvent.change(screen.getByLabelText('项目标题'), {
      target: { value: '湖畔周末礼遇' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成并保存剪辑项目' }));
    await screen.findByText(/自动剪辑已保存为项目修订 1/);
    fireEvent.click(screen.getByRole('button', { name: '进入 Studio 编辑' }));

    expect(await screen.findByRole('heading', { name: 'HotelCut Studio' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '文案' }));
    fireEvent.change(screen.getByLabelText('字幕文本'), {
      target: { value: '湖畔周末，慢下来住一晚' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用字幕' }));

    await waitFor(() => expect(saveProjectRevision).toHaveBeenCalled(), { timeout: 2_500 });
    const savedRevision = saveProjectRevision.mock.calls[0];
    expect(savedRevision?.[0]).toBe(videoProject.id);
    expect(savedRevision?.[1].baseRevision).toBe(1);
    expect(savedRevision?.[1].projectDocument).toMatchObject({ id: videoProject.id });
    expect(await screen.findByText('修订 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回项目列表' }));
    expect(await screen.findByRole('heading', { name: '创建自动剪辑项目' })).toBeInTheDocument();
  });

  it('reloads the server revision after an autosave conflict', async () => {
    const { api, getVideoProject, saveProjectRevision } = createApi(session);
    saveProjectRevision.mockRejectedValue(
      new WorkspaceApiError(409, 'CONFLICT', '项目修订已变化，请重新加载'),
    );
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开视频项目' }));
    await screen.findByRole('heading', { name: '创建自动剪辑项目' });
    fireEvent.change(screen.getByLabelText('项目标题'), {
      target: { value: '冲突恢复验收' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成并保存剪辑项目' }));
    await screen.findByText(/自动剪辑已保存为项目修订 1/);
    fireEvent.click(screen.getByRole('button', { name: '进入 Studio 编辑' }));

    fireEvent.click(await screen.findByRole('button', { name: '文案' }));
    fireEvent.change(screen.getByLabelText('字幕文本'), {
      target: { value: '这是一条产生版本冲突的修改' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用字幕' }));

    expect(
      await screen.findByText('项目修订已变化，请重新加载', {}, { timeout: 2_500 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载服务器最新修订' }));
    await waitFor(() => expect(getVideoProject).toHaveBeenCalledWith(videoProject.id));
    expect(await screen.findByText('所有修改已保存')).toBeInTheDocument();
    expect(screen.getByText('修订 1')).toBeInTheDocument();
  });

  it('shows a stable login error without entering the workspace', async () => {
    const { api, login } = createApi(null);
    login.mockRejectedValue(new Error('邮箱或密码错误'));
    render(<WorkspaceApp api={api} guestMode={false} />);
    await screen.findByRole('heading', { name: '酒店短视频工作空间' });

    fireEvent.click(screen.getByRole('button', { name: '登录工作空间' }));

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '选择酒店' })).not.toBeInTheDocument();
  });
});
