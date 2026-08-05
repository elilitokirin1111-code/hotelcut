import { describe, expect, it } from 'vitest';

import type { AssetDetail, ShotRequirement } from '@hotelcut/schemas';

import { matchShotRequirement } from './asset-matching.js';

const requirement = {
  id: '10000000-0000-4000-8000-000000000001',
  scriptPackageId: '10000000-0000-4000-8000-000000000002',
  scriptSceneId: '10000000-0000-4000-8000-000000000003',
  sequence: 1,
  description: '前台英语接待的中景',
  requiredTags: ['front desk', 'service'],
  preferredShotType: 'medium',
  preferredMotionType: 'push_in',
  preferredDurationMs: 2_000,
  required: true,
  filmingInstruction: null,
  createdAt: '2026-08-05T08:00:00.000Z',
} as ShotRequirement;

const asset = {
  id: '20000000-0000-4000-8000-000000000001',
  hotelId: '30000000-0000-4000-8000-000000000001',
  kind: 'video',
  status: 'ready',
  originalFilename: 'front-desk-service.mp4',
  contentType: 'video/mp4',
  byteSize: 100,
  storageBucket: 'assets',
  storageKey: 'front-desk-service.mp4',
  checksumSha256: null,
  metadata: {},
  createdAt: '2026-08-05T08:00:00.000Z',
  updatedAt: '2026-08-05T08:00:00.000Z',
  derivatives: [],
  analysisJobs: [],
  segments: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      assetId: '20000000-0000-4000-8000-000000000001',
      startMs: 0,
      endMs: 3_000,
      label: 'English guest reception',
      kind: 'scene',
      source: 'automatic',
      scoreBasisPoints: 8_000,
      createdByUserId: null,
      metadata: {
        category: 'lobby',
        description: 'front desk service for international guests',
        issues: [],
        tags: ['front desk', 'service', 'medium', 'push_in'],
      },
      createdAt: '2026-08-05T08:00:00.000Z',
      updatedAt: '2026-08-05T08:00:00.000Z',
    },
  ],
} as AssetDetail;

describe('matchShotRequirement', () => {
  it('ranks analyzed semantic segments and exposes a deterministic status', () => {
    const result = matchShotRequirement(requirement, [asset]);

    expect(result.status).toBe('matched');
    expect(result.candidateMatches).toHaveLength(1);
    expect(result.candidateMatches[0]).toMatchObject({
      assetId: asset.id,
      segmentId: asset.segments[0]!.id,
    });
    expect(result.candidateMatches[0]!.reasons).toContain('语义命中“front desk”');
  });

  it('returns a concrete filming instruction when there are no candidates', () => {
    const result = matchShotRequirement(requirement, []);

    expect(result.status).toBe('missing');
    expect(result.filmingInstruction).toContain('补拍：前台英语接待的中景');
  });
});
