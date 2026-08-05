import { describe, expect, it } from 'vitest';

import {
  compilerMediaCandidateSchema,
  buildDynamicCompilationTemplate,
  findDuplicateAssets,
  paginateCaptionLines,
  rankSlotCandidates,
  splitARollRange,
  splitCaptionLines,
  templateSlotSchema,
  validateEditBlueprint,
} from './index.js';

const blueprint = {
  id: '11111111-1111-4111-8111-111111111111',
  creativeProjectId: '22222222-2222-4222-8222-222222222222',
  revision: 1,
  durationSeconds: 8,
  frameRate: 30,
  aspectRatio: '9:16' as const,
  style: {
    pace: 'fast' as const,
    visualTone: 'warm',
    transitionDensity: 'low' as const,
    captionDensity: 'medium' as const,
    beatSyncStrength: 50,
    referenceStrength: 0,
    aiFreedom: 50,
  },
  beats: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      sequence: 1,
      startMs: 0,
      endMs: 4_000,
      purpose: 'hook',
      narration: '欢迎',
      dialogue: null,
      requiredTags: ['lobby'],
      preferredTags: [],
      forbiddenTags: [],
      preferredShotTypes: ['medium'],
      preferredMotionTypes: ['push_in'],
      minimumShotDurationMs: 800,
      maximumShotDurationMs: 1_200,
      maximumAssetReuse: 1,
      audioPolicy: 'dialogue' as const,
      caption: '欢迎',
      transitionIn: null,
      transitionOut: 'cut' as const,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      sequence: 2,
      startMs: 4_000,
      endMs: 8_000,
      purpose: 'cta',
      narration: null,
      dialogue: null,
      requiredTags: ['room'],
      preferredTags: [],
      forbiddenTags: [],
      preferredShotTypes: ['wide'],
      preferredMotionTypes: ['static'],
      minimumShotDurationMs: 800,
      maximumShotDurationMs: 2_000,
      maximumAssetReuse: 1,
      audioPolicy: 'music' as const,
      caption: null,
      transitionIn: 'cut' as const,
      transitionOut: null,
    },
  ],
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
  createdAt: '2026-08-05T08:00:00.000Z',
};

describe('compiler primitives', () => {
  it('validates a contiguous blueprint and converts it into dynamic slots', () => {
    const validated = validateEditBlueprint(blueprint);
    expect(validated.valid).toBe(true);
    const template = buildDynamicCompilationTemplate(validated.normalizedBlueprint!);
    expect(template.slots).toHaveLength(6);
    expect(template.slots[0]!.startBasisPoints).toBe(0);
    expect(template.slots.at(-1)!.endBasisPoints).toBe(10_000);
  });
  it('splits long A-roll ranges without gaps or overlap', () => {
    expect(splitARollRange(90, 650, 240)).toEqual([
      { startFrame: 90, durationFrames: 240 },
      { startFrame: 330, durationFrames: 240 },
      { startFrame: 570, durationFrames: 170 },
    ]);
  });

  it('wraps Chinese captions and paginates line groups', () => {
    const lines = splitCaptionLines('欢迎来到云栖酒店，这里让每一次周末停留都更从容。', 16);
    const pages = paginateCaptionLines(lines, 2);

    expect(lines.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.split('\n').length <= 2)).toBe(true);
    expect(pages.join('').replaceAll('\n', '')).toBe(
      '欢迎来到云栖酒店，这里让每一次周末停留都更从容。',
    );
  });

  it('deduplicates matching fingerprints in favor of quality', () => {
    const common = {
      kind: 'video' as const,
      durationFrames: 900,
      tags: ['room'],
      metadata: {},
      availability: 'ready' as const,
      contentFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      analysis: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        hasAudio: true,
        silenceRatioBasisPoints: 0,
        qualityBasisPoints: 8_000,
      },
      segments: [],
    };
    const lower = compilerMediaCandidateSchema.parse({
      ...common,
      assetId: '10000000-0000-4000-8000-000000000001',
      scoreBasisPoints: 6_000,
    });
    const higher = compilerMediaCandidateSchema.parse({
      ...common,
      assetId: '10000000-0000-4000-8000-000000000002',
      scoreBasisPoints: 9_000,
    });

    expect(findDuplicateAssets([lower, higher])).toEqual(
      new Map([[lower.assetId, higher.assetId]]),
    );
  });

  it('never selects a scene that visual analysis marked unusable', () => {
    const media = compilerMediaCandidateSchema.parse({
      assetId: '10000000-0000-4000-8000-000000000003',
      kind: 'video',
      durationFrames: 300,
      tags: [],
      scoreBasisPoints: 8_000,
      metadata: {},
      availability: 'ready',
      contentFingerprint: null,
      analysis: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        hasAudio: false,
        silenceRatioBasisPoints: 10_000,
        qualityBasisPoints: 9_000,
      },
      segments: [
        {
          id: '11000000-0000-4000-8000-000000000001',
          kind: 'scene',
          startFrame: 0,
          durationFrames: 300,
          label: '严重模糊的客房画面',
          tags: ['room'],
          scoreBasisPoints: 0,
          transcript: null,
          words: [],
        },
      ],
    });
    const slot = {
      ...templateSlotSchema.parse({
        id: 'room.hero',
        track: 'main',
        role: 'montage',
        startBasisPoints: 0,
        endBasisPoints: 5_000,
        acceptedKinds: ['video'],
        requiredTags: ['room'],
        preferredTags: [],
        required: true,
        allowAssetReuse: false,
        audioPolicy: 'mute',
        transition: 'cut',
      }),
      startFrame: 0,
      durationFrames: 150,
    };

    const ranking = rankSlotCandidates(
      [media],
      slot,
      { assetIds: new Set(), candidateIds: new Set() },
      20260804,
    );

    expect(ranking.selected).toBeNull();
    expect(ranking.records[0]?.reasons).toContain('Analyzed scene was marked unusable');
  });
});
