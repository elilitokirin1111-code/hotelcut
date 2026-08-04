import { describe, expect, it } from 'vitest';

import {
  compilerMediaCandidateSchema,
  findDuplicateAssets,
  paginateCaptionLines,
  rankSlotCandidates,
  splitARollRange,
  splitCaptionLines,
  templateSlotSchema,
} from './index.js';

describe('compiler primitives', () => {
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
