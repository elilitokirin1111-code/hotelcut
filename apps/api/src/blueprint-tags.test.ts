import { describe, expect, it } from 'vitest';

import type { Asset } from '@hotelcut/schemas';

import { collectAllowedAssetTags, sanitizeBeatTags } from './blueprint-tags.js';

function makeAsset(metadata: Record<string, unknown>): Asset {
  return {
    id: '70000000-0000-4000-8000-000000000001',
    hotelId: '30000000-0000-4000-8000-000000000001',
    kind: 'video',
    status: 'ready',
    originalFilename: 'room.mp4',
    contentType: 'video/mp4',
    byteSize: 1_024,
    storageBucket: 'hotelcut-local',
    storageKey: 'hotels/demo/room.mp4',
    checksumSha256: null,
    metadata,
    createdAt: '2026-08-05T08:00:00.000Z',
    updatedAt: '2026-08-05T08:00:00.000Z',
  };
}

describe('blueprint tag sanitization', () => {
  it('collects the canonical vocabulary plus asset-specific tags', () => {
    const allowed = collectAllowedAssetTags([
      makeAsset({
        tags: ['lobby', 'front-desk'],
        vision: { tags: ['service', 'day'] },
      }),
    ]);
    expect(allowed.has('lobby')).toBe(true);
    expect(allowed.has('service')).toBe(true);
    expect(allowed.has('front-desk')).toBe(true);
    expect(allowed.has('computer')).toBe(false);
  });

  it('moves unknown required tags into preferred tags', () => {
    const allowed = collectAllowedAssetTags([makeAsset({})]);
    const beat = sanitizeBeatTags(
      {
        requiredTags: ['ROOM', 'computer', 'phone'],
        preferredTags: ['bright'],
      },
      allowed,
    );
    expect(beat.requiredTags).toEqual(['room']);
    expect(beat.preferredTags).toEqual(['bright', 'computer', 'phone']);
  });

  it('keeps beats without any known tag viable', () => {
    const allowed = collectAllowedAssetTags([makeAsset({})]);
    const beat = sanitizeBeatTags({ requiredTags: ['map', 'folder'], preferredTags: [] }, allowed);
    expect(beat.requiredTags).toEqual([]);
    expect(beat.preferredTags).toEqual(['map', 'folder']);
  });
});
