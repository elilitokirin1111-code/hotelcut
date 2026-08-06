import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  AssetRequirement,
  CreativeBriefRevision,
  CreativeProject,
  CreativeVideoVersion,
  EditBlueprint,
  ScriptPackage,
} from '@hotelcut/schemas';

import { AiDirectorWorkspace } from './ai-director-workspace';
import type { WorkspaceApi } from './workspace-api';

const hotelId = '30000000-0000-4000-8000-000000000001';
const creativeProject: CreativeProject = {
  createdAt: '2026-08-05T02:00:00.000Z',
  createdByUserId: '20000000-0000-4000-8000-000000000001',
  deletedAt: null,
  hotelId,
  id: '91000000-0000-4000-8000-000000000001',
  metadata: {},
  mode: 'script',
  selectedBlueprintId: null,
  selectedBriefRevisionId: null,
  selectedScriptRevisionId: null,
  selectedVideoProjectId: null,
  status: 'draft',
  title: '前台反差短片',
  updatedAt: '2026-08-05T02:00:00.000Z',
};

function createApi(aiDirectorEnabled = true) {
  const createCreativeProject = vi
    .fn<WorkspaceApi['createCreativeProject']>()
    .mockResolvedValue(creativeProject);
  const api = {
    createCreativeProject,
    getAiDirectorFeatures: vi.fn<WorkspaceApi['getAiDirectorFeatures']>().mockResolvedValue({
      aiDirectorEnabled,
      aiReviewEnabled: false,
      dynamicBlueprintEnabled: false,
      referenceAnalysisEnabled: false,
    }),
    listCreativeProjects: vi.fn<WorkspaceApi['listCreativeProjects']>().mockResolvedValue([]),
    listAssets: vi.fn<WorkspaceApi['listAssets']>().mockResolvedValue([]),
    listAssetRequirements: vi.fn<WorkspaceApi['listAssetRequirements']>().mockResolvedValue([]),
    listCreativeVideoVersions: vi
      .fn<WorkspaceApi['listCreativeVideoVersions']>()
      .mockResolvedValue([]),
    listEditBlueprints: vi.fn<WorkspaceApi['listEditBlueprints']>().mockResolvedValue([]),
    listReferenceVideoProfiles: vi
      .fn<WorkspaceApi['listReferenceVideoProfiles']>()
      .mockResolvedValue([]),
  } as unknown as WorkspaceApi;
  return { api, createCreativeProject };
}

describe('AI Director workspace foundation', () => {
  it('creates a real creative project from one of the four entry modes', async () => {
    const { api, createCreativeProject } = createApi();
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);

    expect(await screen.findByRole('heading', { name: '创建专属剪辑方案' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /从脚本开始/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '创作项目标题' }), {
      target: { value: '前台反差短片' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建 AI 创作项目' }));

    await waitFor(() =>
      expect(createCreativeProject).toHaveBeenCalledWith(hotelId, {
        mode: 'script',
        title: '前台反差短片',
      }),
    );
    expect(await screen.findByText('前台反差短片')).toBeInTheDocument();
  });

  it('keeps the workspace gated when AI Director is disabled', async () => {
    const { api } = createApi(false);
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} />);

    expect(await screen.findByRole('heading', { name: 'AI 导演功能未启用' })).toBeInTheDocument();
  });

  it('offers a quick path into the production editing workflow', async () => {
    const { api } = createApi();
    const onQuickEdit = vi.fn();
    render(<AiDirectorWorkspace api={api} hotelId={hotelId} onQuickEdit={onQuickEdit} />);

    await screen.findByRole('heading', { name: '创建专属剪辑方案' });
    fireEvent.click(screen.getByRole('button', { name: '直接开始剪辑（素材自动成片）' }));

    expect(onQuickEdit).toHaveBeenCalledTimes(1);
  });

  it('opens a generated A/B/C video version directly in Studio', async () => {
    const videoVersion: CreativeVideoVersion = {
      id: '92000000-0000-4000-8000-000000000001',
      creativeProjectId: creativeProject.id,
      editBlueprintId: '93000000-0000-4000-8000-000000000001',
      videoProjectId: '94000000-0000-4000-8000-000000000001',
      variant: 'A',
      seed: 101,
      scoreBasisPoints: 8_000,
      hookScoreBasisPoints: 7_500,
      sellingPointCoverageBasisPoints: 8_500,
      paceScoreBasisPoints: 7_000,
      usedAssetIds: [],
      repeatedAssetCount: 0,
      recommendationReason: '严格遵循脚本段落与原始镜头节奏。',
      createdAt: '2026-08-05T02:30:00.000Z',
    };
    const { api, createCreativeProject } = createApi();
    api.listCreativeVideoVersions = vi
      .fn<WorkspaceApi['listCreativeVideoVersions']>()
      .mockResolvedValue([videoVersion]);
    api.getAiDirectorFeatures = vi.fn<WorkspaceApi['getAiDirectorFeatures']>().mockResolvedValue({
      aiDirectorEnabled: true,
      aiReviewEnabled: false,
      dynamicBlueprintEnabled: true,
      referenceAnalysisEnabled: false,
    });
    const onOpenVideoProject = vi.fn();
    render(
      <AiDirectorWorkspace api={api} hotelId={hotelId} onOpenVideoProject={onOpenVideoProject} />,
    );

    await screen.findByRole('heading', { name: '创建专属剪辑方案' });
    fireEvent.click(screen.getByRole('button', { name: /从脚本开始/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '创作项目标题' }), {
      target: { value: '前台反差短片' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建 AI 创作项目' }));

    await waitFor(() => expect(createCreativeProject).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: '在 Studio 中打开成片' }));
    expect(onOpenVideoProject).toHaveBeenCalledWith(videoVersion.videoProjectId);
  });

  it('guides through the full creation flow from script to Studio', async () => {
    const brief: CreativeBriefRevision = {
      id: '95000000-0000-4000-8000-000000000001',
      creativeProjectId: creativeProject.id,
      revision: 1,
      direction: null,
      rawIdea: '前台反差视频',
      objective: null,
      platform: 'douyin',
      durationSeconds: 16,
      targetAudience: null,
      tone: [],
      hotelSellingPoints: [],
      hardConstraints: [],
      userPrompt: null,
      createdBy: 'user',
      modelName: null,
      promptVersion: null,
      generationParameters: {},
      inputSummary: null,
      createdAt: '2026-08-05T03:00:00.000Z',
    };
    const direction: CreativeBriefRevision = {
      ...brief,
      id: '95000000-0000-4000-8000-000000000002',
      revision: 2,
      direction: '稳定转化版',
      objective: '突出酒店核心服务',
      tone: ['专业'],
      createdBy: 'ai',
    };
    const script: ScriptPackage = {
      id: '96000000-0000-4000-8000-000000000001',
      creativeProjectId: creativeProject.id,
      revision: 1,
      modelName: null,
      promptVersion: null,
      generationParameters: {},
      inputSummary: null,
      createdAt: '2026-08-05T03:10:00.000Z',
      title: '十六秒酒店前台反差',
      hook: '前台也能带来惊喜',
      storySummary: '从普通前台到惊喜服务',
      narrativePattern: '反差叙事',
      voiceoverScript: null,
      dialogue: [],
      captions: [],
      callToAction: '联系酒店',
      filmingTips: [],
      requiredAssets: ['前台'],
      totalDurationMs: 16_000,
      scenes: [],
      shotList: [],
    };
    const requirement: AssetRequirement = {
      id: '97000000-0000-4000-8000-000000000001',
      creativeProjectId: creativeProject.id,
      scriptSceneId: null,
      description: '前台服务镜头',
      requiredTags: ['service'],
      preferredShotType: 'medium',
      preferredMotionType: 'static',
      preferredDurationMs: 4_000,
      required: true,
      matchedAssetIds: [],
      candidateMatches: [],
      status: 'missing',
      filmingInstruction: '补拍：前台服务',
      createdAt: '2026-08-05T03:20:00.000Z',
      updatedAt: '2026-08-05T03:20:00.000Z',
    };
    const blueprint: EditBlueprint = {
      id: '98000000-0000-4000-8000-000000000001',
      creativeProjectId: creativeProject.id,
      revision: 1,
      durationSeconds: 16,
      frameRate: 30,
      aspectRatio: '9:16',
      style: {
        pace: 'medium',
        visualTone: 'warm',
        transitionDensity: 'low',
        captionDensity: 'medium',
        beatSyncStrength: 50,
        referenceStrength: 0,
        aiFreedom: 50,
      },
      beats: [],
      music: {},
      captionStyle: {},
      globalRules: [],
      seed: 1,
      compilerVersion: '1.0.0',
      sourceAssetIds: [],
      referenceProfileIds: [],
      modelName: null,
      promptVersion: null,
      generationParameters: {},
      inputSummary: null,
      createdAt: '2026-08-05T03:30:00.000Z',
    };
    const version: CreativeVideoVersion = {
      id: '99000000-0000-4000-8000-000000000001',
      creativeProjectId: creativeProject.id,
      editBlueprintId: blueprint.id,
      videoProjectId: '9a000000-0000-4000-8000-000000000001',
      variant: 'A',
      seed: 102,
      scoreBasisPoints: 8_000,
      hookScoreBasisPoints: 7_500,
      sellingPointCoverageBasisPoints: 8_500,
      paceScoreBasisPoints: 7_000,
      usedAssetIds: [],
      repeatedAssetCount: 0,
      recommendationReason: '严格遵循脚本段落与原始镜头节奏。',
      createdAt: '2026-08-05T03:40:00.000Z',
    };

    const { api, createCreativeProject } = createApi();
    api.getAiDirectorFeatures = vi.fn<WorkspaceApi['getAiDirectorFeatures']>().mockResolvedValue({
      aiDirectorEnabled: true,
      aiReviewEnabled: false,
      dynamicBlueprintEnabled: true,
      referenceAnalysisEnabled: false,
    });
    api.createCreativeBriefRevision = vi
      .fn<WorkspaceApi['createCreativeBriefRevision']>()
      .mockResolvedValue(brief);
    const expandIdea = vi.fn<WorkspaceApi['expandIdea']>().mockResolvedValue([direction]);
    const generateScript = vi.fn<WorkspaceApi['generateScript']>().mockResolvedValue(script);
    const selectScript = vi.fn<WorkspaceApi['selectScript']>().mockResolvedValue(creativeProject);
    const generateAssetRequirements = vi
      .fn<WorkspaceApi['generateAssetRequirements']>()
      .mockResolvedValue([requirement]);
    const generateEditBlueprint = vi
      .fn<WorkspaceApi['generateEditBlueprint']>()
      .mockResolvedValue(blueprint);
    const generateVideoVersions = vi
      .fn<WorkspaceApi['generateVideoVersions']>()
      .mockResolvedValue({ versions: [version], recommendedVariant: 'A' });
    api.expandIdea = expandIdea;
    api.generateScript = generateScript;
    api.selectScript = selectScript;
    api.generateAssetRequirements = generateAssetRequirements;
    api.generateEditBlueprint = generateEditBlueprint;
    api.generateVideoVersions = generateVideoVersions;
    const onOpenVideoProject = vi.fn();
    render(
      <AiDirectorWorkspace api={api} hotelId={hotelId} onOpenVideoProject={onOpenVideoProject} />,
    );

    await screen.findByRole('heading', { name: '创建专属剪辑方案' });
    fireEvent.click(screen.getByRole('button', { name: /从脚本开始/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '创作项目标题' }), {
      target: { value: '前台反差短片' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建 AI 创作项目' }));
    await waitFor(() => expect(createCreativeProject).toHaveBeenCalled());

    expect(screen.getByText(/下一步：先在下方输入一句创意/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '创意输入' }), {
      target: { value: '前台反差视频' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成三套创意与完整脚本' }));
    await waitFor(() => expect(generateScript).toHaveBeenCalled());
    expect(await screen.findByText('选为后续蓝图脚本')).toBeInTheDocument();
    expect(screen.getByText(/下一步：在生成的脚本卡片上点击/)).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: '生成已校验 EditBlueprint' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '选为后续蓝图脚本' }));
    await waitFor(() => expect(selectScript).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: '生成已校验 EditBlueprint' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成已校验 EditBlueprint' }));
    await waitFor(() => expect(generateEditBlueprint).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: '生成 A/B/C 成片' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成 A/B/C 成片' }));
    await waitFor(() => expect(generateVideoVersions).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: '在 Studio 中打开成片' }));
    expect(onOpenVideoProject).toHaveBeenCalledWith(version.videoProjectId);
  });
});
