import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  Asset,
  CreativeBriefRevision,
  CreativeProject,
  CreativeVideoVersion,
  ReferenceVideoProfile,
  ScriptPackage,
} from '@hotelcut/schemas';

import { AiDirectorWorkspace } from './ai-director-workspace';
import type { WorkspaceApi } from './workspace-api';

const hotelId = '30000000-0000-4000-8000-000000000001';
const projectId = '91000000-0000-4000-8000-000000000001';
const videoProjectId = '94000000-0000-4000-8000-000000000001';

function project(input: Partial<CreativeProject> = {}): CreativeProject {
  return {
    createdAt: '2026-08-05T02:00:00.000Z',
    createdByUserId: '20000000-0000-4000-8000-000000000001',
    deletedAt: null,
    hotelId,
    id: projectId,
    metadata: {},
    mode: 'idea',
    selectedBlueprintId: null,
    selectedBriefRevisionId: null,
    selectedScriptRevisionId: null,
    selectedVideoProjectId: null,
    status: 'draft',
    title: '前台反差短片',
    updatedAt: '2026-08-05T02:00:00.000Z',
    ...input,
  };
}

const brief = {
  id: '95000000-0000-4000-8000-000000000001',
  creativeProjectId: projectId,
  revision: 1,
  direction: null,
  rawIdea: '前台反差视频',
  objective: '突出服务反差',
  platform: 'douyin',
  durationSeconds: 16,
  targetAudience: null,
  tone: ['专业'],
  hotelSellingPoints: ['服务'],
  hardConstraints: [],
  userPrompt: null,
  createdBy: 'user',
  modelName: null,
  promptVersion: null,
  generationParameters: {},
  inputSummary: null,
  createdAt: '2026-08-05T03:00:00.000Z',
} as CreativeBriefRevision;

const direction = {
  ...brief,
  id: '95000000-0000-4000-8000-000000000002',
  revision: 2,
  direction: '强钩子爆点版',
  createdBy: 'ai',
} as CreativeBriefRevision;

const script = {
  id: '96000000-0000-4000-8000-000000000001',
  creativeProjectId: projectId,
  revision: 1,
  modelName: 'qwen-plus',
  promptVersion: 'script-v1',
  generationParameters: {},
  inputSummary: '前台反差视频',
  createdAt: '2026-08-05T03:10:00.000Z',
  title: '十六秒酒店前台反差',
  hook: '前台也能带来惊喜',
  storySummary: '从普通接待到超预期服务',
  narrativePattern: '反差叙事',
  voiceoverScript: null,
  dialogue: [],
  captions: [],
  callToAction: '立即预订',
  filmingTips: [],
  requiredAssets: ['前台'],
  totalDurationMs: 16_000,
  scenes: [],
  shotList: [],
} as ScriptPackage;

const version = {
  id: '92000000-0000-4000-8000-000000000001',
  creativeProjectId: projectId,
  editBlueprintId: '93000000-0000-4000-8000-000000000001',
  videoProjectId,
  variant: 'B',
  seed: 202,
  scoreBasisPoints: 8_400,
  hookScoreBasisPoints: 8_800,
  sellingPointCoverageBasisPoints: 8_100,
  paceScoreBasisPoints: 8_600,
  usedAssetIds: [],
  repeatedAssetCount: 0,
  recommendationReason: '强化前三秒和快切节奏。',
  createdAt: '2026-08-05T03:30:00.000Z',
} as CreativeVideoVersion;

const referenceAsset = {
  id: '99000000-0000-4000-8000-000000000001',
  hotelId,
  kind: 'video',
  originalFilename: '参考短片.mp4',
  purpose: 'reference_video',
  status: 'ready',
} as Asset;

const profile = {
  id: '99100000-0000-4000-8000-000000000001',
  creativeProjectId: projectId,
  assetId: referenceAsset.id,
  revision: 1,
  durationMs: 16_000,
  averageShotDurationMs: 2_000,
  shotCount: 8,
  narrativePattern: '反差叙事',
  hookDurationMs: 2_000,
  paceCurve: [],
  shotTypeDistribution: {},
  transitionProfile: {},
  captionProfile: {},
  audioProfile: {},
  emotionalCurve: [],
  reusableStyleRules: ['前三秒强钩子'],
  analysisSummary: '先建立期待，再用服务细节制造反差。',
  modelName: 'qwen-vl-max',
  promptVersion: 'reference-v1',
  generationParameters: {},
  inputSummary: '参考短片.mp4',
  seed: 1,
  createdAt: '2026-08-05T03:20:00.000Z',
} as ReferenceVideoProfile;

function createApi(initialProjects: CreativeProject[] = []) {
  let storedProjects = [...initialProjects];
  const createCreativeProject = vi
    .fn<WorkspaceApi['createCreativeProject']>()
    .mockImplementation((_hotelId, input) => {
      const created = project({ mode: input.mode, title: input.title });
      storedProjects = [created, ...storedProjects];
      return Promise.resolve(created);
    });
  const getCreativeProject = vi
    .fn<WorkspaceApi['getCreativeProject']>()
    .mockImplementation((id) => Promise.resolve(storedProjects.find((item) => item.id === id)!));
  const updateCreativeProject = vi
    .fn<WorkspaceApi['updateCreativeProject']>()
    .mockImplementation((id, input) => {
      const current = storedProjects.find((item) => item.id === id)!;
      const updated = project({ ...current, status: input.status ?? current.status });
      storedProjects = storedProjects.map((item) => (item.id === id ? updated : item));
      return Promise.resolve(updated);
    });
  const selectCreativeVideoVersion = vi
    .fn<WorkspaceApi['selectCreativeVideoVersion']>()
    .mockImplementation((id) => {
      const current = storedProjects.find((item) => item.id === id)!;
      const updated = project({
        ...current,
        selectedBlueprintId: version.editBlueprintId,
        selectedVideoProjectId: videoProjectId,
        status: 'generated',
      });
      storedProjects = storedProjects.map((item) => (item.id === id ? updated : item));
      return Promise.resolve(updated);
    });
  const generateScript = vi.fn<WorkspaceApi['generateScript']>().mockResolvedValue(script);

  const api = {
    createCreativeProject,
    createCreativeBriefRevision: vi
      .fn<WorkspaceApi['createCreativeBriefRevision']>()
      .mockResolvedValue(brief),
    expandIdea: vi.fn<WorkspaceApi['expandIdea']>().mockResolvedValue([direction]),
    generateScript,
    getAiDirectorFeatures: vi.fn<WorkspaceApi['getAiDirectorFeatures']>().mockResolvedValue({
      aiDirectorEnabled: true,
      aiReviewEnabled: true,
      dynamicBlueprintEnabled: true,
      referenceAnalysisEnabled: true,
    }),
    getCreativeProject,
    listAssets: vi.fn<WorkspaceApi['listAssets']>().mockResolvedValue([]),
    listAssetRequirements: vi.fn<WorkspaceApi['listAssetRequirements']>().mockResolvedValue([]),
    listCreativeBriefRevisions: vi
      .fn<WorkspaceApi['listCreativeBriefRevisions']>()
      .mockResolvedValue([]),
    listCreativeProjects: vi
      .fn<WorkspaceApi['listCreativeProjects']>()
      .mockImplementation(() => Promise.resolve(storedProjects)),
    listCreativeVideoVersions: vi
      .fn<WorkspaceApi['listCreativeVideoVersions']>()
      .mockResolvedValue([]),
    listEditBlueprints: vi.fn<WorkspaceApi['listEditBlueprints']>().mockResolvedValue([]),
    listReferenceVideoProfiles: vi
      .fn<WorkspaceApi['listReferenceVideoProfiles']>()
      .mockResolvedValue([]),
    listScriptPackages: vi.fn<WorkspaceApi['listScriptPackages']>().mockResolvedValue([]),
    selectCreativeVideoVersion,
    updateCreativeProject,
  } as unknown as WorkspaceApi;

  return {
    api,
    createCreativeProject,
    generateScript,
    selectCreativeVideoVersion,
    updateCreativeProject,
  };
}

describe('AI production workflow', () => {
  it('creates a real project from the selected entry mode', async () => {
    const { api, createCreativeProject } = createApi();
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);

    expect(await screen.findByRole('heading', { name: '创建专属剪辑方案' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /从创意开始/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '创作项目标题' }), {
      target: { value: '前台反差短片' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建 AI 创作项目' }));

    await waitFor(() =>
      expect(createCreativeProject).toHaveBeenCalledWith(hotelId, {
        mode: 'idea',
        title: '前台反差短片',
      }),
    );
    expect((await screen.findAllByText('前台反差短片')).length).toBeGreaterThan(0);
  });

  it('keeps the workspace gated when AI Director is disabled', async () => {
    const { api } = createApi();
    api.getAiDirectorFeatures = vi.fn<WorkspaceApi['getAiDirectorFeatures']>().mockResolvedValue({
      aiDirectorEnabled: false,
      aiReviewEnabled: false,
      dynamicBlueprintEnabled: false,
      referenceAnalysisEnabled: false,
    });
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);
    expect(await screen.findByRole('heading', { name: 'AI 导演功能未启用' })).toBeInTheDocument();
  });

  it('generates creative directions and restores them as the script stage', async () => {
    const current = project({ mode: 'idea' });
    const { api } = createApi([current]);
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);

    fireEvent.click(await screen.findByRole('button', { name: /前台反差短片/ }));
    fireEvent.change(await screen.findByRole('textbox', { name: '创意输入' }), {
      target: { value: '用服务反差展示酒店前台' },
    });
    fireEvent.click(screen.getByRole('button', { name: /生成三套创意方向与脚本/ }));

    expect(
      await screen.findByRole('heading', { name: '确认剪辑思路、脚本和分镜' }),
    ).toBeInTheDocument();
    expect(screen.getByText('十六秒酒店前台反差')).toBeInTheDocument();
  });

  it('turns a reference analysis into an original script', async () => {
    const current = project({ mode: 'reference', title: '参考风格成片' });
    const { api, generateScript } = createApi([current]);
    api.listAssets = vi.fn<WorkspaceApi['listAssets']>().mockResolvedValue([referenceAsset]);
    api.listReferenceVideoProfiles = vi
      .fn<WorkspaceApi['listReferenceVideoProfiles']>()
      .mockResolvedValue([profile]);
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);

    fireEvent.click(await screen.findByRole('button', { name: /参考风格成片/ }));
    fireEvent.click(await screen.findByRole('button', { name: '生成原创剪辑思路与脚本' }));

    await waitFor(() =>
      expect(generateScript).toHaveBeenCalledWith(projectId, brief.id, {
        referenceProfileId: profile.id,
      }),
    );
    expect(
      await screen.findByRole('heading', { name: '确认剪辑思路、脚本和分镜' }),
    ).toBeInTheDocument();
  });

  it('selects a real AI video project before opening Studio', async () => {
    const current = project({ status: 'blueprint_ready' });
    const { api, selectCreativeVideoVersion } = createApi([current]);
    api.listCreativeVideoVersions = vi
      .fn<WorkspaceApi['listCreativeVideoVersions']>()
      .mockResolvedValue([version]);
    const onOpenVideoProject = vi.fn();
    render(
      <AiDirectorWorkspace api={api} hotelId={hotelId} onOpenVideoProject={onOpenVideoProject} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /前台反差短片/ }));
    fireEvent.click(await screen.findByRole('button', { name: /选定并进入人工微调/ }));

    await waitFor(() =>
      expect(selectCreativeVideoVersion).toHaveBeenCalledWith(projectId, version.id),
    );
    expect(onOpenVideoProject).toHaveBeenCalledWith(videoProjectId);
  });

  it('marks the refined Studio project as completed in the editing library', async () => {
    const current = project({
      selectedVideoProjectId: videoProjectId,
      status: 'generated',
    });
    const { api, updateCreativeProject } = createApi([current]);
    api.listCreativeVideoVersions = vi
      .fn<WorkspaceApi['listCreativeVideoVersions']>()
      .mockResolvedValue([version]);
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);

    fireEvent.click(await screen.findByRole('button', { name: /前台反差短片/ }));
    fireEvent.click(await screen.findByRole('button', { name: '已完成微调，保存到剪辑库' }));

    await waitFor(() =>
      expect(updateCreativeProject).toHaveBeenCalledWith(projectId, { status: 'completed' }),
    );
    expect(await screen.findByRole('heading', { name: '项目已保存到剪辑库' })).toBeInTheDocument();
  });

  it('offers the existing quick-edit path without bypassing the new workflow', async () => {
    const { api } = createApi();
    const onQuickEdit = vi.fn();
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} onQuickEdit={onQuickEdit} />);
    fireEvent.click(await screen.findByRole('button', { name: '直接开始剪辑（素材自动成片）' }));
    expect(onQuickEdit).toHaveBeenCalledTimes(1);
  });
});
