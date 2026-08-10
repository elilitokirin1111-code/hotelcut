import '@testing-library/jest-dom/vitest';
import type { HotelVideoProjectV1 } from '@hotelcut/timeline';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { demoProject, editorAssets } from './editor/demo-data';

const appProps = {
  assets: editorAssets,
  initialProject: demoProject,
  initialRevision: 1,
  onSaveRevision: (_project: HotelVideoProjectV1, baseRevision: number) =>
    Promise.resolve(baseRevision + 1),
};

afterEach(() => {
  vi.useRealTimers();
});

describe('M5 editor workspace', () => {
  it('shows preview, scene list, simplified timeline and revision state', () => {
    render(<App {...appProps} />);

    expect(screen.getByRole('heading', { name: 'HotelCut Studio' })).toBeInTheDocument();
    expect(screen.getByLabelText('视频预览')).toBeInTheDocument();
    expect(screen.getByLabelText('场景列表')).toBeInTheDocument();
    expect(screen.getByLabelText('简化时间线')).toBeInTheDocument();
    expect(screen.getByText('所有修改已保存')).toBeInTheDocument();
    expect(screen.getByText('修订 1')).toBeInTheDocument();
  });

  it('supports desktop playback and edit keyboard shortcuts', () => {
    render(<App {...appProps} />);

    expect(screen.getByLabelText('剪辑快捷工具')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getAllByRole('button', { name: '暂停预览' })).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();
    fireEvent.keyDown(window, { ctrlKey: true, key: 'z' });
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  });

  it('replaces a selected shot without editing JSON', () => {
    render(<App {...appProps} />);

    fireEvent.click(screen.getByRole('button', { name: '替换为 大堂 · 黄昏灯光' }));

    expect(screen.getByText('镜头已替换')).toBeInTheDocument();
    expect(screen.getAllByText('大堂 · 黄昏灯光').length).toBeGreaterThan(1);
  });

  it('edits a caption and autosaves a new revision', async () => {
    vi.useFakeTimers();
    const saveRevision = vi.fn((_project, baseRevision: number) =>
      Promise.resolve(baseRevision + 1),
    );
    render(<App {...appProps} autosaveDelayMs={20} onSaveRevision={saveRevision} />);

    fireEvent.click(screen.getByRole('button', { name: '文案' }));
    fireEvent.change(screen.getByLabelText('字幕文本'), {
      target: { value: '在湖畔，住进一段慢时光' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用字幕' }));

    expect(
      within(screen.getByLabelText('视频预览')).getByText('在湖畔，住进一段慢时光'),
    ).toBeInTheDocument();
    expect(screen.getByText('等待自动保存')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(25);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveRevision).toHaveBeenCalledTimes(1);
    expect(screen.getByText('所有修改已保存')).toBeInTheDocument();
    expect(screen.getByText('修订 2')).toBeInTheDocument();
  });

  it('batches trim and CTA edits into one autosave revision', async () => {
    vi.useFakeTimers();
    const saveRevision = vi.fn((_project: HotelVideoProjectV1, baseRevision: number) =>
      Promise.resolve(baseRevision + 1),
    );
    render(<App {...appProps} autosaveDelayMs={20} onSaveRevision={saveRevision} />);

    fireEvent.change(screen.getByLabelText('素材入点'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('素材出点'), { target: { value: '310' } });
    fireEvent.click(screen.getByRole('button', { name: '应用裁切' }));
    fireEvent.click(screen.getByRole('button', { name: 'CTA' }));
    fireEvent.change(screen.getByLabelText('CTA 文案'), {
      target: { value: '收藏这份湖畔周末指南' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用 CTA' }));

    await act(async () => {
      vi.advanceTimersByTime(25);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveRevision).toHaveBeenCalledTimes(1);
    const savedProject = saveRevision.mock.calls[0]?.[0];
    expect(savedProject?.cta?.text).toBe('收藏这份湖畔周末指南');
    expect(
      savedProject?.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === '72000000-0000-4000-8000-000000000001'),
    ).toMatchObject({ sourceStartFrame: 40, sourceDurationFrames: 270 });
  });
});
