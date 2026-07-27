import { describe, expect, it } from 'vitest';

import {
  compilerMediaCandidateSchema,
  findDuplicateAssets,
  paginateCaptionLines,
  splitARollRange,
  splitCaptionLines,
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
});
