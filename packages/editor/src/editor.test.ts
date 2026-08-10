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

  it('moves and resizes visual clips without permitting collisions', async () => {
    const project = await fixtureProject();
    const scene = getEditorScenes(project)[0];
    if (!scene) throw new Error('Fixture must include a scene');

    const moved = applyEditorCommand(project, {
      type: 'move-clip',
      clipId: scene.clipId,
      startFrame: scene.startFrame,
    });
    const resized = applyEditorCommand(moved, {
      type: 'resize-clip',
      clipId: scene.clipId,
      durationFrames: scene.durationFrames,
    });
    const clip = resized.tracks
      .flatMap((track) => track.clips)
      .find((candidate) => candidate.id === scene.clipId);
    expect(clip).toMatchObject({
      startFrame: scene.startFrame,
      durationFrames: scene.durationFrames,
    });
    expect(() =>
      applyEditorCommand(project, { type: 'move-clip', clipId: scene.clipId, startFrame: 1 }),
    ).toThrow(EditorCommandError);
  });

  it('updates video and music volume through a validated command', async () => {
    const project = await fixtureProject();
    const video = project.tracks
      .flatMap((track) => track.clips)
      .find((clip): clip is VideoClip => clip.kind === 'video');
    const music = project.tracks
      .flatMap((track) => track.clips)
      .find((clip): clip is AudioClip => clip.kind === 'audio');
    if (!video || !music) throw new Error('Fixture must include video and audio clips');

    const quieterVideo = applyEditorCommand(project, {
      type: 'update-clip-volume',
      clipId: video.id,
      volume: 0.35,
      muted: true,
    });
    const quieterMusic = applyEditorCommand(quieterVideo, {
      type: 'update-clip-volume',
      clipId: music.id,
      volume: 0.2,
    });
    const clips = quieterMusic.tracks.flatMap((track) => track.clips);
    expect(clips.find((clip) => clip.id === video.id)).toMatchObject({ volume: 0.35, muted: true });
    expect(clips.find((clip) => clip.id === music.id)).toMatchObject({ volume: 0.2 });
  });

  it('edits visual effects and keyframes through validated project commands', async () => {
    const project = await fixtureProject();
    const visual = project.tracks
      .flatMap((track) => track.clips)
      .find((clip): clip is VideoClip => clip.kind === 'video');
    if (!visual) throw new Error('Fixture must include a video clip');

    const graded = applyEditorCommand(project, {
      type: 'update-visual-effects',
      clipId: visual.id,
      colorAdjustments: {
        brightness: 0.12,
        contrast: 1.2,
        saturation: 0.9,
        hueRotateDegrees: 6,
        blurPx: 0,
      },
    });
    const transitioned = applyEditorCommand(graded, {
      type: 'update-clip-transition',
      clipId: visual.id,
      edge: 'out',
      transition: { type: 'wipe', durationFrames: 8, easing: 'ease-in-out' },
    });
    const animated = applyEditorCommand(transitioned, {
      type: 'upsert-transform-keyframe',
      clipId: visual.id,
      keyframe: {
        frame: 1,
        x: 0.55,
        y: 0.45,
        scaleX: 1.1,
        scaleY: 1.1,
        rotationDegrees: 2,
        opacity: 0.9,
      },
    });
    const edited = animated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === visual.id);
    expect(edited).toMatchObject({
      colorAdjustments: { brightness: 0.12, contrast: 1.2 },
      transitionOut: { type: 'wipe', durationFrames: 8 },
      keyframes: [{ frame: 1, scaleX: 1.1 }],
    });
  });

  it('splits and deletes visual clips while preserving a valid timeline', async () => {
    const project = await fixtureProject();
    const visual = project.tracks
      .flatMap((track) => track.clips)
      .find((clip): clip is VideoClip => clip.kind === 'video');
    if (!visual) throw new Error('Fixture must include a video clip');
    const splitAt = visual.startFrame + Math.floor(visual.durationFrames / 2);
    const split = applyEditorCommand(project, {
      type: 'split-visual-clip',
      clipId: visual.id,
      atFrame: splitAt,
      newClipId: '50000000-0000-4000-8000-000000000001',
    });
    const clips = split.tracks.flatMap((track) => track.clips);
    expect(clips.find((clip) => clip.id === visual.id)?.durationFrames).toBe(
      splitAt - visual.startFrame,
    );
    expect(clips.find((clip) => clip.id === '50000000-0000-4000-8000-000000000001')).toMatchObject({
      startFrame: splitAt,
    });
    const deleted = applyEditorCommand(split, {
      type: 'delete-clip',
      clipId: '50000000-0000-4000-8000-000000000001',
    });
    expect(
      deleted.tracks
        .flatMap((track) => track.clips)
        .some((clip) => clip.id === '50000000-0000-4000-8000-000000000001'),
    ).toBe(false);
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
