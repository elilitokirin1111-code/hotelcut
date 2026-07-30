import type { AssetDetail, BrandKit, VideoBrief } from '@hotelcut/schemas';
import { describe, expect, it } from 'vitest';

import {
  assetDetailToCompilerMedia,
  buildCompilerInput,
  projectTemplates,
  resolveProjectTemplate,
} from './project-generation.js';

const now = '2026-07-30T02:00:00.000Z';
const hotelId = '30000000-0000-4000-8000-000000000001';
const assetId = '70000000-0000-4000-8000-000000000001';

const assetDetail: AssetDetail = {
  analysisJobs: [],
  byteSize: 8_388_608,
  checksumSha256: 'a'.repeat(64),
  contentType: 'video/mp4',
  createdAt: now,
  derivatives: [],
  hotelId,
  id: assetId,
  kind: 'video',
  metadata: {
    probe: {
      audioChannels: 2,
      audioCodec: 'aac',
      durationMs: 30_000,
      frameRate: 29.97,
      height: 1_920,
      rotation: 0,
      videoCodec: 'h264',
      width: 1_080,
    },
  },
  originalFilename: '湖景客房窗景.mp4',
  segments: [
    {
      assetId,
      createdAt: now,
      createdByUserId: null,
      endMs: 4_000,
      id: '71000000-0000-4000-8000-000000000001',
      kind: 'speech',
      label: '欢迎口播',
      metadata: {
        text: '欢迎来到湖畔酒店',
        words: [{ endMs: 1_000, probability: 1, startMs: 0, text: '欢迎' }],
      },
      scoreBasisPoints: 9_000,
      source: 'automatic',
      startMs: 0,
      updatedAt: now,
    },
    {
      assetId,
      createdAt: now,
      createdByUserId: '20000000-0000-4000-8000-000000000001',
      endMs: 12_000,
      id: '71000000-0000-4000-8000-000000000002',
      kind: 'manual',
      label: '客房窗景',
      metadata: {},
      scoreBasisPoints: null,
      source: 'manual',
      startMs: 4_000,
      updatedAt: now,
    },
  ],
  status: 'ready',
  storageBucket: 'hotelcut-local',
  storageKey: `hotels/${hotelId}/assets/${assetId}/original.mp4`,
  updatedAt: now,
};

const brandKit: BrandKit = {
  accentColor: '#C99A5B',
  contactText: '400-000-0000（演示）',
  createdAt: now,
  endingText: '住进一段慢时光',
  fontFamily: 'Noto Sans SC',
  hotelId,
  id: '40000000-0000-4000-8000-000000000001',
  logoAssetId: null,
  primaryColor: '#17324D',
  secondaryColor: '#F5EFE6',
  subtitleStyle: 'clean',
  updatedAt: now,
};

const brief: VideoBrief = {
  aspectRatio: '9:16',
  callToAction: '联系酒店',
  createdAt: now,
  durationSeconds: 25,
  hotelId,
  id: '50000000-0000-4000-8000-000000000001',
  language: 'zh-CN',
  objective: '展示客房卖点',
  platform: 'douyin',
  targetAudience: '周末度假客群',
  title: '湖畔客房体验',
  tone: '温暖高级',
  updatedAt: now,
};

describe('production project generation', () => {
  it('maps analyzed timing, transcripts and Chinese manual labels into compiler media', () => {
    const media = assetDetailToCompilerMedia(assetDetail);

    expect(media).toMatchObject({
      analysis: {
        frameRate: 29.97,
        hasAudio: true,
        height: 1_920,
        qualityBasisPoints: 9_000,
        width: 1_080,
      },
      durationFrames: 900,
    });
    expect(media.tags).toEqual(expect.arrayContaining(['room', 'window']));
    expect(media.segments[0]).toMatchObject({
      durationFrames: 120,
      transcript: '欢迎来到湖畔酒店',
    });
    expect(media.segments[0]?.tags).toEqual(
      expect.arrayContaining(['host', 'presenter', 'speech', 'welcome']),
    );
  });

  it('builds a validated vertical input from a persisted brief and BrandKit', () => {
    const template = resolveProjectTemplate('hotel.room-montage');
    const input = buildCompilerInput({
      assetDetails: [assetDetail],
      brandKit,
      brief,
      projectId: '60000000-0000-4000-8000-000000000001',
      seed: 20260730,
      template,
    });

    expect(input.output).toMatchObject({
      durationFrames: 750,
      frameRate: 30,
      height: 1_920,
      width: 1_080,
    });
    expect(input.cta).toMatchObject({ action: 'contact', text: '联系酒店' });
    expect(input.brandTokens.map((token) => token.key)).toEqual(
      expect.arrayContaining([
        'brand.primary',
        'brand.onPrimary',
        'brand.captionBackground',
        'brand.headingFont',
        'brand.bodyFont',
      ]),
    );
  });

  it('publishes the three supported templates with duration and tag guidance', () => {
    expect(projectTemplates).toHaveLength(3);
    expect(projectTemplates.find((template) => template.key === 'hotel.promotion')).toMatchObject({
      maxDurationSeconds: 25,
      minDurationSeconds: 15,
      requiredTags: ['exterior', 'promotion', 'room', 'service'],
    });
  });
});
