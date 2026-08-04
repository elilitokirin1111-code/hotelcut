import { readFile } from 'node:fs/promises';

import {
  compileVideo,
  compilerInputSchema,
  replaceVideoClip,
  type CompilationTemplate,
  type CompilerInput,
} from '@hotelcut/compiler';
import {
  stableStringify,
  type AudioClip,
  type HotelVideoProjectV1,
  type ImageClip,
  type VideoClip,
} from '@hotelcut/timeline';
import { describe, expect, it } from 'vitest';

import { hostBrollTemplate, promotionTemplate, roomMontageTemplate } from './index.js';

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')) as unknown;
}

async function readBaseInput(): Promise<CompilerInput> {
  return compilerInputSchema.parse(await readJson('../fixtures/m4-compiler-input.json'));
}

function createFixtureCases(
  baseInput: CompilerInput,
): Array<{ name: string; input: CompilerInput; template: CompilationTemplate }> {
  return [
    {
      name: 'host-broll',
      input: baseInput,
      template: hostBrollTemplate,
    },
    {
      name: 'room-montage',
      input: {
        ...baseInput,
        projectId: '21111111-1111-4111-8111-111111111111',
        template: {
          id: roomMontageTemplate.id,
          version: roomMontageTemplate.version,
        },
        brief: {
          ...baseInput.brief,
          id: '25151515-1515-4515-8515-151515151515',
          title: '云栖酒店客房卖点',
          durationFrames: 750,
        },
        output: {
          ...baseInput.output,
          durationFrames: 750,
        },
        cta: baseInput.cta
          ? {
              ...baseInput.cta,
              startFrame: 600,
              durationFrames: 150,
            }
          : null,
      },
      template: roomMontageTemplate,
    },
    {
      name: 'promotion',
      input: {
        ...baseInput,
        projectId: '31111111-1111-4111-8111-111111111111',
        template: {
          id: promotionTemplate.id,
          version: promotionTemplate.version,
        },
        brief: {
          ...baseInput.brief,
          id: '35151515-1515-4515-8515-151515151515',
          title: '云栖酒店周末礼遇',
          durationFrames: 600,
        },
        output: {
          ...baseInput.output,
          durationFrames: 600,
        },
        cta: baseInput.cta
          ? {
              ...baseInput.cta,
              startFrame: 480,
              durationFrames: 120,
            }
          : null,
      },
      template: promotionTemplate,
    },
  ];
}

function visualClips(project: HotelVideoProjectV1): Array<VideoClip | ImageClip> {
  return project.tracks
    .flatMap((track) => track.clips)
    .filter(
      (clip): clip is VideoClip | ImageClip => clip.kind === 'video' || clip.kind === 'image',
    );
}

describe('M4 hotel templates', () => {
  it('is byte-equivalent for the same normalized input and seed', async () => {
    const input = await readBaseInput();

    expect(stableStringify(compileVideo(input, hostBrollTemplate))).toBe(
      stableStringify(compileVideo(structuredClone(input), hostBrollTemplate)),
    );
  });

  it('matches all three committed golden generations', async () => {
    const fixtureCases = createFixtureCases(await readBaseInput());

    for (const fixtureCase of fixtureCases) {
      const generated = compileVideo(fixtureCase.input, fixtureCase.template);
      const golden = await readJson(`../fixtures/golden/${fixtureCase.name}.json`);

      expect(stableStringify(generated)).toBe(stableStringify(golden));
      expect(generated.warnings).toEqual([]);
      expect(generated.manifest.slots.every((slot) => slot.assetId !== null)).toBe(true);
      expect(generated.manifest.explanationLog.at(-1)?.code).toBe('COMPILATION_COMPLETE');
    }
  });

  it('records filtering, scoring, B-roll muting, captions and music loops', async () => {
    const result = compileVideo(await readBaseInput(), hostBrollTemplate);
    const duplicateRecords = result.scoreRecords.filter((record) =>
      record.reasons.some((reason) => reason.startsWith('Duplicate of higher-quality asset')),
    );
    const brollClips = result.project.tracks
      .filter((track) => track.metadata['compilerTrack'] === 'broll')
      .flatMap((track) => track.clips)
      .filter((clip): clip is VideoClip => clip.kind === 'video');
    const captionClips = result.project.tracks
      .filter((track) => track.kind === 'caption')
      .flatMap((track) => track.clips);
    const musicClips = result.project.tracks
      .filter((track) => track.kind === 'audio')
      .flatMap((track) => track.clips);

    expect(duplicateRecords.length).toBeGreaterThan(0);
    expect(brollClips.every((clip) => clip.muted && clip.volume === 0)).toBe(true);
    expect(captionClips.length).toBeGreaterThan(3);
    expect(captionClips.some((clip) => clip.kind === 'caption' && clip.text.includes('\n'))).toBe(
      true,
    );
    expect(musicClips).toHaveLength(2);
    expect(result.scoreRecords.filter((record) => record.selected).length).toBe(
      hostBrollTemplate.slots.length + 1,
    );
  });

  it('records rejected and duplicate music candidates before selecting a track', async () => {
    const baseInput = await readBaseInput();
    const music = baseInput.media.find((media) => media.kind === 'audio');
    if (!music) {
      throw new Error('Fixture must include background music');
    }
    const duplicateMusicId = '10000000-0000-4000-8000-000000000014';
    const failedMusicId = '10000000-0000-4000-8000-000000000015';
    const input = compilerInputSchema.parse({
      ...baseInput,
      media: [
        ...baseInput.media,
        {
          ...music,
          assetId: duplicateMusicId,
          scoreBasisPoints: 8_000,
        },
        {
          ...music,
          assetId: failedMusicId,
          availability: 'failed',
          contentFingerprint: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          scoreBasisPoints: 9_900,
        },
      ],
    });
    const result = compileVideo(input, hostBrollTemplate);
    const musicRecords = result.scoreRecords.filter((record) => record.slotId === 'music');
    const duplicateRecord = musicRecords.find((record) => record.assetId === duplicateMusicId);
    const failedRecord = musicRecords.find((record) => record.assetId === failedMusicId);

    expect(musicRecords).toHaveLength(3);
    expect(duplicateRecord).toMatchObject({ eligible: false, selected: false });
    expect(duplicateRecord?.reasons).toContain(
      `Duplicate content fingerprint; preferred asset is ${music.assetId}`,
    );
    expect(failedRecord).toMatchObject({ eligible: false, selected: false });
    expect(failedRecord?.reasons).toContain('Media availability is failed');
    expect(musicRecords.find((record) => record.selected)?.assetId).toBe(music.assetId);
  });

  it('fills montage audio with selected source ambience when music is unavailable', async () => {
    const roomCase = createFixtureCases(await readBaseInput()).find(
      (fixtureCase) => fixtureCase.name === 'room-montage',
    );
    if (!roomCase) {
      throw new Error('Room montage fixture case is missing');
    }
    const exterior = roomCase.input.media.find(
      (media) => media.kind === 'video' && media.tags.includes('exterior'),
    );
    if (!exterior) {
      throw new Error('Fixture must include an exterior video');
    }
    const audibleBathroomId = '10000000-0000-4000-8000-000000000016';
    const input = compilerInputSchema.parse({
      ...roomCase.input,
      media: [
        ...roomCase.input.media.filter((media) => media.kind !== 'audio'),
        {
          ...exterior,
          assetId: audibleBathroomId,
          contentFingerprint: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          scoreBasisPoints: 1,
          segments: [],
          tags: ['bathroom'],
        },
      ],
    });
    const result = compileVideo(input, roomMontageTemplate);
    const audioTrack = result.project.tracks.find(
      (track) => track.metadata['compilerTrack'] === 'music',
    );
    const audioClips = (audioTrack?.clips ?? []).filter(
      (clip): clip is AudioClip => clip.kind === 'audio',
    );
    const selectedVisualAssetIds = visualClips(result.project).map((clip) => clip.assetId);

    expect(result.manifest.slots.find((slot) => slot.slotId === 'room.bathroom')?.assetId).toBe(
      audibleBathroomId,
    );
    expect(audioTrack?.name).toBe('原视频环境声');
    expect(audioClips.length).toBeGreaterThan(0);
    expect(audioClips.reduce((total, clip) => total + clip.durationFrames, 0)).toBe(
      input.output.durationFrames,
    );
    expect(audioClips.every((clip) => clip.volume === 0.18)).toBe(true);
    expect(selectedVisualAssetIds).toContain(audioClips[0]?.assetId);
    expect(
      visualClips(result.project)
        .filter((clip): clip is VideoClip => clip.kind === 'video')
        .every((clip) => clip.muted && clip.volume === 0),
    ).toBe(true);
    expect(result.warnings).toContainEqual({
      code: 'BACKGROUND_MUSIC_MISSING',
      message: 'No eligible background music was available; source ambience fallback is active',
      severity: 'info',
      path: 'media',
    });
    expect(result.manifest.explanationLog).toContainEqual(
      expect.objectContaining({ code: 'SOURCE_AMBIENCE_FALLBACK' }),
    );
  });

  it('regenerates unlocked slots while preserving locked shots', async () => {
    const input = await readBaseInput();
    const initial = compileVideo(input, hostBrollTemplate);
    const initialVisualClips = visualClips(initial.project);
    const lockedClip = initialVisualClips[0];
    if (!lockedClip) {
      throw new Error('Fixture must generate a visual clip');
    }

    const regenerated = compileVideo(
      {
        ...input,
        seed: input.seed + 1,
        previousProject: initial.project,
        lockedClipIds: [lockedClip.id],
      },
      hostBrollTemplate,
    );
    const regeneratedLocked = visualClips(regenerated.project).find(
      (clip) => clip.id === lockedClip.id,
    );
    const initialUnlocked = initialVisualClips[1];
    if (!initialUnlocked) {
      throw new Error('Fixture must generate an unlocked comparison clip');
    }

    expect(regenerated.manifest.operation).toBe('regenerate');
    expect(regeneratedLocked).toMatchObject({
      id: lockedClip.id,
      assetId: lockedClip.assetId,
    });
    expect(regenerated.manifest.slots.find((slot) => slot.clipId === lockedClip.id)?.locked).toBe(
      true,
    );
    expect(visualClips(regenerated.project).some((clip) => clip.id === initialUnlocked.id)).toBe(
      false,
    );
  });

  it('replaces one shot without changing other visual clip identities', async () => {
    const input = await readBaseInput();
    const initial = compileVideo(input, hostBrollTemplate);
    const target = visualClips(initial.project).find(
      (clip) => clip.metadata['slotId'] === 'broll.room',
    );
    if (!target) {
      throw new Error('Fixture must generate the room B-roll slot');
    }
    const replacement = replaceVideoClip(input, hostBrollTemplate, initial.project, {
      clipId: target.id,
      assetId: '10000000-0000-4000-8000-000000000013',
      segmentId: '1d000000-0000-4000-8000-000000000001',
    });
    const replacementVisualClips = visualClips(replacement.project);
    const replaced = replacementVisualClips.find((clip) => clip.id === target.id);
    const unchangedIds = visualClips(initial.project)
      .filter((clip) => clip.id !== target.id)
      .map((clip) => clip.id);

    expect(replacement.manifest.operation).toBe('replace');
    expect(replaced?.assetId).toBe('10000000-0000-4000-8000-000000000013');
    expect(replacementVisualClips.filter((clip) => unchangedIds.includes(clip.id))).toHaveLength(
      unchangedIds.length,
    );
    expect(replacement.warnings).toEqual([]);
  });

  it('emits an unmet requirement warning instead of fabricating media', async () => {
    const promotionCase = createFixtureCases(await readBaseInput()).find(
      (fixtureCase) => fixtureCase.name === 'promotion',
    );
    if (!promotionCase) {
      throw new Error('Promotion fixture case is missing');
    }
    const result = compileVideo(
      {
        ...promotionCase.input,
        media: promotionCase.input.media.filter((media) => !media.tags.includes('promotion')),
      },
      promotionTemplate,
    );

    expect(result.warnings).toContainEqual({
      code: 'SLOT_REQUIREMENT_UNMET',
      message: 'No eligible media for promo.offer',
      severity: 'warning',
      path: 'slots.promo.offer',
    });
    expect(result.manifest.slots.find((slot) => slot.slotId === 'promo.offer')?.assetId).toBeNull();
  });
});
