import { readFile } from 'node:fs/promises';

import {
  parseHotelVideoProject,
  type AudioClip,
  type CaptionClip,
  type TextClip,
  type VideoClip,
} from '@hotelcut/timeline';
import { describe, expect, it } from 'vitest';

import {
  applyEditorCommand,
  applyAiReviewCommand,
  applyHistoryCommand,
  createEditorHistory,
  EditorCommandError,
  getActiveClips,
  getEditorScenes,
  redoHistory,
  undoHistory,
} from './index.js';

async function fixtureProject() {
  const result = JSON.parse(
    await readFile(
      new URL('../../templates/fixtures/golden/host-broll.json', import.meta.url),
      'utf8',
    ),
  ) as { project: unknown };
  return parseHotelVideoProject(result.project);
}

describe('M5 editor commands', () => {
  it('accepts review commands only through the strict editor-command adapter', async () => {
    const project = await fixtureProject();
    const scene = getEditorScenes(project)[0];
    if (!scene) throw new Error('Fixture must include a scene');

    const applied = applyAiReviewCommand(project, {
      assetId: '10000000-0000-4000-8000-000000000013',
      clipId: scene.clipId,
      reason: '首镜头需要更强的人物反应。',
      type: 'replace-clip-asset',
    });

    expect(applied.reason).toContain('人物反应');
    expect(applied.project).not.toBe(project);
    expect(() => applyAiReviewCommand(project, { type: 'replace-clip-asset' })).toThrow(
      EditorCommandError,
    );
  });

  it('replaces and trims one shot while preserving its identity and project duration', async () => {
    const project = await fixtureProject();
    const scene = getEditorScenes(project)[0];
    if (!scene) {
      throw new Error('Fixture must include a scene');
    }
    const replacementAssetId = '10000000-0000-4000-8000-000000000013';
    const replaced = applyEditorCommand(project, {
      type: 'replace-clip-asset',
      clipId: scene.clipId,
      assetId: replacementAssetId,
    });
    const trimmed = applyEditorCommand(replaced, {
      type: 'trim-video',
      clipId: scene.clipId,
      sourceStartFrame: 42,
      sourceDurationFrames: 180,
    });
    const clip = getActiveClips(trimmed, scene.startFrame).find(
      (candidate): candidate is VideoClip =>
        candidate.id === scene.clipId && candidate.kind === 'video',
    );

    expect(clip).toMatchObject({
      id: scene.clipId,
      assetId: replacementAssetId,
      sourceStartFrame: 42,
      sourceDurationFrames: 180,
    });
    expect(clip?.playbackRate).toBe(180 / scene.durationFrames);
    expect(trimmed.output.durationFrames).toBe(project.output.durationFrames);
  });

  it('edits captions, title, CTA and every music loop', async () => {
    const project = await fixtureProject();
    const clips = project.tracks.flatMap((track) => track.clips);
    const caption = clips.find((clip): clip is CaptionClip => clip.kind === 'caption');
    const title = clips.find(
      (clip): clip is TextClip =>
        clip.kind === 'text' && clip.metadata['generatedFrom'] === 'brief.title',
    );
    if (!caption || !title || !project.cta) {
      throw new Error('Fixture must include caption, title and CTA content');
    }
    const captionEdited = applyEditorCommand(project, {
      type: 'update-caption',
      clipId: caption.id,
      text: '修改后的字幕',
    });
    const titleEdited = applyEditorCommand(captionEdited, {
      type: 'update-title',
      clipId: title.id,
      text: '湖畔慢生活',
    });
    const ctaEdited = applyEditorCommand(titleEdited, {
      type: 'update-cta',
      text: '收藏并预约周末入住',
      action: 'booking',
      destination: 'https://hotel.example/booking',
    });
    const musicAssetId = '10000000-0000-4000-8000-000000000016';
    const musicEdited = applyEditorCommand(ctaEdited, {
      type: 'replace-music',
      assetId: musicAssetId,
    });
    const editedClips = musicEdited.tracks.flatMap((track) => track.clips);
    const editedCaption = editedClips.find(
      (clip): clip is CaptionClip => clip.id === caption.id && clip.kind === 'caption',
    );
    const editedTitle = editedClips.find(
      (clip): clip is TextClip => clip.id === title.id && clip.kind === 'text',
    );
    const musicClips = editedClips.filter(
      (clip): clip is AudioClip => clip.kind === 'audio' && clip.metadata['slotId'] === 'music',
    );

    expect(editedCaption).toMatchObject({ text: '修改后的字幕', words: [] });
    expect(editedTitle?.text).toBe('湖畔慢生活');
    expect(musicEdited.cta).toMatchObject({
      text: '收藏并预约周末入住',
      destination: 'https://hotel.example/booking',
    });
    expect(musicClips.length).toBeGreaterThan(1);
    expect(musicClips.every((clip) => clip.assetId === musicAssetId)).toBe(true);
  });

  it('supports bounded undo, redo and branch replacement', async () => {
    const project = await fixtureProject();
    const caption = project.tracks
      .flatMap((track) => track.clips)
      .find((clip): clip is CaptionClip => clip.kind === 'caption');
    if (!caption) {
      throw new Error('Fixture must include a caption');
    }
    const initial = createEditorHistory(project, 2);
    const first = applyHistoryCommand(initial, {
      type: 'update-caption',
      clipId: caption.id,
      text: '第一次修改',
    });
    const second = applyHistoryCommand(first, {
      type: 'update-caption',
      clipId: caption.id,
      text: '第二次修改',
    });
    const undone = undoHistory(second);
    const redone = redoHistory(undone);
    const branched = applyHistoryCommand(undone, {
      type: 'update-caption',
      clipId: caption.id,
      text: '新的修改分支',
    });

    expect(second.past).toHaveLength(2);
    expect(
      undone.present.tracks.flatMap((track) => track.clips).find((clip) => clip.id === caption.id),
    ).toMatchObject({ text: '第一次修改' });
    expect(
      redone.present.tracks.flatMap((track) => track.clips).find((clip) => clip.id === caption.id),
    ).toMatchObject({ text: '第二次修改' });
    expect(branched.future).toEqual([]);
  });

  it('rejects edits that target the wrong clip type', async () => {
    const project = await fixtureProject();
    const caption = project.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.kind === 'caption');
    if (!caption) {
      throw new Error('Fixture must include a caption');
    }

    expect(() =>
      applyEditorCommand(project, {
        type: 'trim-video',
        clipId: caption.id,
        sourceStartFrame: 0,
        sourceDurationFrames: 30,
      }),
    ).toThrow(EditorCommandError);
  });
});
