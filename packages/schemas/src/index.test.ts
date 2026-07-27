import { describe, expect, it } from 'vitest';

import {
  assetSegmentSchema,
  createHotelSchema,
  createVideoBriefSchema,
  upsertBrandKitSchema,
} from './index.js';

describe('M1 input schemas', () => {
  it('normalizes a minimal hotel input', () => {
    expect(
      createHotelSchema.parse({
        organizationId: '11111111-1111-4111-8111-111111111111',
        name: '  云栖酒店  ',
        city: '杭州',
      }),
    ).toMatchObject({
      name: '云栖酒店',
      timezone: 'Asia/Shanghai',
    });
  });

  it('rejects unsafe brand colors', () => {
    expect(() =>
      upsertBrandKitSchema.parse({
        primaryColor: 'red',
        secondaryColor: '#FFFFFF',
        accentColor: '#CC9900',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '欢迎入住',
      }),
    ).toThrow();
  });

  it('defaults a vertical Chinese brief', () => {
    const brief = createVideoBriefSchema.parse({
      title: '周末度假推广',
      platform: 'douyin',
      durationSeconds: 30,
      tone: '温暖',
    });

    expect(brief).toMatchObject({ aspectRatio: '9:16', language: 'zh-CN' });
  });

  it('rejects a media segment whose end precedes its start', () => {
    expect(() =>
      assetSegmentSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        assetId: '22222222-2222-4222-8222-222222222222',
        startMs: 2_000,
        endMs: 1_000,
        label: null,
        scoreBasisPoints: null,
        metadata: {},
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }),
    ).toThrow('Segment end must be after its start');
  });
});
