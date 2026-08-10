import { describe, expect, it } from 'vitest';

import type { Asset } from '@hotelcut/schemas';

import { normalizeSearchQuery, scoreAssetSearch, searchAssets } from './asset-search';

const hotelId = '30000000-0000-4000-8000-000000000001';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: '70000000-0000-4000-8000-000000000001',
    hotelId,
    kind: 'video',
    status: 'ready',
    originalFilename: 'room-tour.mp4',
    contentType: 'video/mp4',
    byteSize: 8_388_608,
    storageBucket: 'hotelcut-local',
    storageKey: 'hotels/demo/assets/room/original',
    checksumSha256: 'a'.repeat(64),
    metadata: {},
    createdAt: '2026-08-05T08:00:00.000Z',
    updatedAt: '2026-08-05T08:00:00.000Z',
    ...overrides,
  };
}

describe('asset semantic search', () => {
  it('normalizes the query', () => {
    expect(normalizeSearchQuery('  湖景  ')).toBe('湖景');
  });

  it('matches the original filename', () => {
    const asset = makeAsset({ originalFilename: '湖景房介绍.mp4' });
    expect(scoreAssetSearch(asset, '湖景房')).toBeGreaterThan(0);
  });

  it('matches the AI short name', () => {
    const asset = makeAsset({
      metadata: { vision: { shortName: '湖景大床房' } },
    });
    expect(scoreAssetSearch(asset, '大床房')).toBeGreaterThan(0);
  });

  it('matches canonical tags through their Chinese labels', () => {
    const asset = makeAsset({
      metadata: { vision: { tags: ['room', 'view'] } },
    });
    expect(scoreAssetSearch(asset, '客房')).toBeGreaterThan(0);
    expect(scoreAssetSearch(asset, '景观')).toBeGreaterThan(0);
  });

  it('matches selling points and scene descriptions', () => {
    const asset = makeAsset({
      metadata: {
        vision: {
          sellingPoints: ['亲子友好'],
          scenes: [{ description: '推窗即见整片湖景' }],
        },
      },
    });
    expect(scoreAssetSearch(asset, '亲子')).toBeGreaterThan(0);
    expect(scoreAssetSearch(asset, '湖景')).toBeGreaterThan(0);
  });

  it('requires every term to match', () => {
    const asset = makeAsset({
      originalFilename: '湖景房.mp4',
      metadata: { vision: { tags: ['room'] } },
    });
    expect(scoreAssetSearch(asset, '湖景 泳池')).toBe(0);
  });

  it('ranks exact filename matches above summary-only matches', () => {
    const filename = makeAsset({ originalFilename: '早餐自助.mp4' });
    const summary = makeAsset({
      originalFilename: 'hotel-roll-003.mp4',
      metadata: { vision: { summary: '酒店早餐自助区明亮整洁' } },
    });
    expect(scoreAssetSearch(filename, '早餐')).toBeGreaterThan(scoreAssetSearch(summary, '早餐'));
  });

  it('returns every asset for an empty query in original order', () => {
    const first = makeAsset({ id: '70000000-0000-4000-8000-000000000001' });
    const second = makeAsset({ id: '70000000-0000-4000-8000-000000000002' });
    expect(searchAssets([first, second], '')).toEqual([first, second]);
  });

  it('filters and ranks search results', () => {
    const room = makeAsset({
      id: '70000000-0000-4000-8000-000000000001',
      originalFilename: '客房细节.mp4',
    });
    const summary = makeAsset({
      id: '70000000-0000-4000-8000-000000000002',
      originalFilename: 'hotel-roll.mp4',
      metadata: { vision: { summary: '客房整洁明亮' } },
    });
    const pool = makeAsset({
      id: '70000000-0000-4000-8000-000000000003',
      originalFilename: '泳池航拍.mp4',
    });
    expect(searchAssets([pool, summary, room], '客房')).toEqual([room, summary]);
  });
});
