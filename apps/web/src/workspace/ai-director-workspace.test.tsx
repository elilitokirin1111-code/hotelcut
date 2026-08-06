import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CreativeProject, CreativeVideoVersion } from '@hotelcut/schemas';

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
});
