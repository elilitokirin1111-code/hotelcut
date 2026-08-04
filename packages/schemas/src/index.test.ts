import { describe, expect, it } from 'vitest';

import {
  assetSegmentSchema,
  createAssetUploadSchema,
  createHotelSchema,
  createVideoProjectSchema,
  createVideoBriefSchema,
  dateTimeSchema,
  generateVideoProjectSchema,
  projectTemplateSchema,
  renderJobSchema,
  saveProjectRevisionSchema,
  upsertBrandKitSchema,
} from './index.js';

describe('shared input schemas', () => {
  it('accepts standard UTC offsets from cross-language workers', () => {
    expect(dateTimeSchema.parse('2026-07-27T04:21:23.789314+00:00')).toBe(
      '2026-07-27T04:21:23.789314+00:00',
    );
  });

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

  it('accepts video and audio production uploads while rejecting mismatched media types', () => {
    const base = {
      byteSize: 1_024,
      checksumSha256: 'a'.repeat(64),
      originalFilename: 'hotel-media',
      partSize: 8 * 1024 * 1024,
    };
    expect(
      createAssetUploadSchema.parse({ ...base, contentType: 'video/mp4', kind: 'video' }),
    ).toMatchObject({ kind: 'video' });
    expect(
      createAssetUploadSchema.parse({ ...base, contentType: 'audio/mpeg', kind: 'audio' }),
    ).toMatchObject({ kind: 'audio' });
    expect(() =>
      createAssetUploadSchema.parse({ ...base, contentType: 'video/mp4', kind: 'audio' }),
    ).toThrow('Content type must match asset kind audio');
  });

  it('validates the automatic-edit template contract and optional deterministic seed', () => {
    expect(
      projectTemplateSchema.parse({
        key: 'hotel.room-montage',
        version: '1.0.0',
        name: '客房卖点混剪',
        description: '适合客房与设施展示',
        minDurationSeconds: 15,
        maxDurationSeconds: 35,
        requiredTags: ['exterior', 'room'],
      }),
    ).toMatchObject({ key: 'hotel.room-montage', minDurationSeconds: 15 });
    expect(
      generateVideoProjectSchema.parse({
        videoBriefId: '50000000-0000-4000-8000-000000000001',
        templateKey: 'hotel.room-montage',
        seed: 20260730,
      }),
    ).toMatchObject({ seed: 20260730 });
  });

  it('rejects a media segment whose end precedes its start', () => {
    expect(() =>
      assetSegmentSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        assetId: '22222222-2222-4222-8222-222222222222',
        startMs: 2_000,
        endMs: 1_000,
        label: null,
        kind: 'scene',
        source: 'automatic',
        scoreBasisPoints: null,
        createdByUserId: null,
        metadata: {},
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }),
    ).toThrow('Segment end must be after its start');
  });

  it('requires optimistic concurrency data for project revisions', () => {
    const projectDocument = {
      schemaVersion: '1.0.0',
      id: '70000000-0000-4000-8000-000000000001',
    };
    expect(
      createVideoProjectSchema.parse({
        id: projectDocument.id,
        videoBriefId: '50000000-0000-4000-8000-000000000001',
        name: '  湖畔周末短片  ',
        templateKey: 'hotel.host-broll',
        projectDocument,
      }),
    ).toMatchObject({ name: '湖畔周末短片' });
    expect(() =>
      saveProjectRevisionSchema.parse({
        baseRevision: 0,
        projectDocument,
      }),
    ).toThrow();
  });

  it('validates durable render progress and structured logs', () => {
    const now = '2026-07-28T07:00:00.000Z';
    expect(
      renderJobSchema.parse({
        id: '80000000-0000-4000-8000-000000000001',
        videoProjectId: '70000000-0000-4000-8000-000000000001',
        projectRevisionId: '71000000-0000-4000-8000-000000000001',
        requestedByUserId: '20000000-0000-4000-8000-000000000001',
        status: 'rendering',
        attempt: 1,
        maxAttempts: 3,
        progressBasisPoints: 5_000,
        inputHash: 'a'.repeat(64),
        logs: [
          {
            timestamp: now,
            level: 'info',
            stage: 'rendering',
            message: 'Rendering frames 50%',
            details: { renderer: 'remotion' },
          },
        ],
        cancelRequestedAt: null,
        errorCode: null,
        errorMessage: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ status: 'rendering', progressBasisPoints: 5_000 });
  });
});
