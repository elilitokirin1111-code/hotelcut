import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AiTemplate, ProjectTemplate } from '@hotelcut/schemas';

import { AiTemplateCenter } from './ai-template-center';
import type { WorkspaceApi } from './workspace-api';

const hotelId = '30000000-0000-4000-8000-000000000001';

const fixedTemplates: ProjectTemplate[] = [
  {
    key: 'hotel.promotion',
    version: '1.0.0',
    name: '酒店促销',
    description: '外景、客房、服务与优惠',
    minDurationSeconds: 15,
    maxDurationSeconds: 25,
    requiredTags: ['exterior', 'room', 'service', 'promotion'],
  },
];

const generatedTemplate: AiTemplate = {
  id: '50000000-0000-4000-8000-000000000001',
  hotelId,
  name: '湖景周末礼遇',
  description: '以湖景开场，突出客房与服务。',
  durationSeconds: 20,
  spec: {
    durationSeconds: 20,
    globalRules: ['CTA_EMPHASIS'],
    beats: [
      {
        sequence: 1,
        startMs: 0,
        endMs: 20_000,
        purpose: '开场抓注意力',
        visual: '湖景大远景',
        requiredTags: ['exterior'],
        preferredTags: ['wide'],
        preferredShotTypes: [],
        preferredMotionTypes: [],
        maximumShotDurationMs: 5_000,
        maximumAssetReuse: 1,
        audioPolicy: 'ambient',
        caption: '周末住进湖景房',
        transitionOut: 'dissolve',
      },
    ],
  },
  createdByUserId: '20000000-0000-4000-8000-000000000001',
  createdAt: '2026-08-05T08:00:00.000Z',
  updatedAt: '2026-08-05T08:00:00.000Z',
};

describe('AiTemplateCenter', () => {
  it('generates and deletes an AI template from analyzed assets', async () => {
    const listAiTemplates = vi
      .fn<WorkspaceApi['listAiTemplates']>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([generatedTemplate]);
    const generateAiTemplate = vi
      .fn<WorkspaceApi['generateAiTemplate']>()
      .mockResolvedValue(generatedTemplate);
    const deleteAiTemplate = vi.fn<WorkspaceApi['deleteAiTemplate']>().mockResolvedValue();
    const api = {
      deleteAiTemplate,
      generateAiTemplate,
      listAiTemplates,
      listProjectTemplates: vi
        .fn<WorkspaceApi['listProjectTemplates']>()
        .mockResolvedValue(fixedTemplates),
    } as unknown as WorkspaceApi;

    render(<AiTemplateCenter api={api} hotelId={hotelId} />);

    expect(await screen.findByRole('heading', { name: '模板中心' })).toBeInTheDocument();
    expect(
      await screen.findByText(
        '还没有 AI 模板。先确保素材库有已分析完成的素材，再点击上方按钮生成。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('酒店促销')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '用 AI 分析生成模板' }));
    await waitFor(() =>
      expect(generateAiTemplate).toHaveBeenCalledWith(hotelId, { durationSeconds: 20 }),
    );
    expect(
      await screen.findByText('已生成模板「湖景周末礼遇」，可直接在视频项目中使用。'),
    ).toBeInTheDocument();
    expect(await screen.findByText('湖景周末礼遇')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(deleteAiTemplate).toHaveBeenCalledWith(hotelId, generatedTemplate.id),
    );
  });
});
