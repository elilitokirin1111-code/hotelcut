import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  createDatabaseClient,
  PostgresHotelCutRepository,
  type DatabaseClient,
} from '../../packages/database/src/index.js';
import {
  assets,
  assetSegments,
  memberships,
  organizations,
  users,
} from '../../packages/database/src/schema.js';
import {
  parseHotelVideoProject,
  type CaptionClip,
  type HotelVideoProjectV1,
} from '../../packages/timeline/src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

async function readFixtureProject(): Promise<HotelVideoProjectV1> {
  const fixture = JSON.parse(
    await readFile(resolve('packages/templates/fixtures/golden/host-broll.json'), 'utf8'),
  ) as { project: unknown };
  return parseHotelVideoProject(fixture.project);
}

describeWithDatabase('M5 project editing integration', () => {
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const organizationId = randomUUID();
  const outsiderOrganizationId = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }
    client = createDatabaseClient(databaseUrl);
    await client.db.insert(organizations).values([
      { id: organizationId, name: 'M5 编辑验收组织', slug: `m5-${organizationId}` },
      {
        id: outsiderOrganizationId,
        name: 'M5 隔离租户',
        slug: `m5-${outsiderOrganizationId}`,
      },
    ]);
    await client.db.insert(users).values([
      {
        id: ownerUserId,
        externalSubject: `m5-owner-${ownerUserId}`,
        displayName: 'M5 Owner',
      },
      {
        id: outsiderUserId,
        externalSubject: `m5-outsider-${outsiderUserId}`,
        displayName: 'M5 Outsider',
      },
    ]);
    await client.db.insert(memberships).values([
      {
        id: randomUUID(),
        organizationId,
        userId: ownerUserId,
        role: 'owner',
      },
      {
        id: randomUUID(),
        organizationId: outsiderOrganizationId,
        userId: outsiderUserId,
        role: 'owner',
      },
    ]);
    app = await buildApp({
      repository: new PostgresHotelCutRepository(client.db),
    });
  });

  afterAll(async () => {
    if (!databaseUrl || !client) {
      return;
    }
    await app.close();
    await client.sql`delete from organizations where id in (${organizationId}, ${outsiderOrganizationId})`;
    await client.sql`delete from users where id in (${ownerUserId}, ${outsiderUserId})`;
    await client.close();
  });

  it('creates, autosaves and reloads immutable tenant-scoped revisions', async () => {
    const hotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: {
        organizationId,
        name: 'M5 验收酒店',
        city: '杭州',
      },
    });
    expect(hotelResponse.statusCode).toBe(201);
    const hotel = hotelResponse.json<{ id: string }>();

    const briefResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-briefs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        title: '湖畔周末短片',
        platform: 'douyin',
        durationSeconds: 30,
        tone: '温暖松弛',
      },
    });
    expect(briefResponse.statusCode).toBe(201);
    const brief = briefResponse.json<{ id: string }>();

    const fixtureProject = await readFixtureProject();
    const projectId = randomUUID();
    const projectDocument = parseHotelVideoProject({
      ...fixtureProject,
      id: projectId,
      hotelId: hotel.id,
      name: 'M5 湖畔短片',
    });
    const referencedAssets = new Map<string, 'audio' | 'image' | 'video'>();
    for (const clip of projectDocument.tracks.flatMap((track) => track.clips)) {
      if (clip.kind === 'audio' || clip.kind === 'image' || clip.kind === 'video') {
        referencedAssets.set(clip.assetId, clip.kind);
      }
    }
    await client.db.insert(assets).values(
      [...referencedAssets].map(([id, kind], index) => ({
        byteSize: 1_000_000,
        checksumSha256: index.toString(16).padStart(64, '0'),
        contentType:
          kind === 'audio' ? 'audio/mpeg' : kind === 'image' ? 'image/jpeg' : 'video/mp4',
        hotelId: hotel.id,
        id,
        kind,
        metadata: { durationMs: 30_000, frameRate: 30 },
        originalFilename: `fixture-${kind}-${index}`,
        status: 'ready' as const,
        storageBucket: 'hotelcut-local',
        storageKey: `integration/m5-editor/${hotel.id}/${id}`,
      })),
    );
    const createResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-projects`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        id: projectId,
        videoBriefId: brief.id,
        name: projectDocument.name,
        templateKey: projectDocument.template.id,
        projectDocument,
      },
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    expect(createResponse.json()).toMatchObject({
      project: { id: projectId, currentRevision: 1 },
      currentRevision: { revision: 1, schemaVersion: '1.0.0' },
    });

    const caption = projectDocument.tracks
      .flatMap((track) => track.clips)
      .find((clip): clip is CaptionClip => clip.kind === 'caption');
    if (!caption) {
      throw new Error('Fixture must include a caption');
    }
    const editedDocument = parseHotelVideoProject({
      ...projectDocument,
      tracks: projectDocument.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === caption.id ? { ...clip, text: '欢迎来到湖畔慢生活', words: [] } : clip,
        ),
      })),
    });
    const saveResponse = await app.inject({
      method: 'POST',
      url: `/v1/video-projects/${projectId}/revisions`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        baseRevision: 1,
        projectDocument: editedDocument,
      },
    });
    expect(saveResponse.statusCode, saveResponse.body).toBe(201);
    expect(saveResponse.json()).toMatchObject({
      project: { currentRevision: 2 },
      currentRevision: { revision: 2 },
    });

    const staleSaveResponse = await app.inject({
      method: 'POST',
      url: `/v1/video-projects/${projectId}/revisions`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        baseRevision: 1,
        projectDocument: editedDocument,
      },
    });
    expect(staleSaveResponse.statusCode).toBe(409);

    const otherHotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: {
        organizationId,
        name: 'M5 其他门店',
        city: '苏州',
      },
    });
    expect(otherHotelResponse.statusCode).toBe(201);
    const otherHotel = otherHotelResponse.json<{ id: string }>();
    const foreignAssetId = randomUUID();
    await client.db.insert(assets).values({
      byteSize: 1_000_000,
      checksumSha256: 'f'.repeat(64),
      contentType: 'video/mp4',
      hotelId: otherHotel.id,
      id: foreignAssetId,
      kind: 'video',
      metadata: { durationMs: 30_000, frameRate: 30 },
      originalFilename: 'other-hotel-room.mp4',
      status: 'ready',
      storageBucket: 'hotelcut-local',
      storageKey: `integration/m5-editor/${otherHotel.id}/${foreignAssetId}`,
    });
    const firstVideoClipId = projectDocument.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.kind === 'video')?.id;
    const crossHotelDocument = parseHotelVideoProject({
      ...editedDocument,
      tracks: editedDocument.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.kind === 'video' && clip.id === firstVideoClipId
            ? { ...clip, assetId: foreignAssetId }
            : clip,
        ),
      })),
    });
    const crossHotelSaveResponse = await app.inject({
      method: 'POST',
      url: `/v1/video-projects/${projectId}/revisions`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        baseRevision: 2,
        projectDocument: crossHotelDocument,
      },
    });
    expect(crossHotelSaveResponse.statusCode).toBe(400);
    expect(crossHotelSaveResponse.json<{ message: string }>().message).toContain('当前酒店不可用');

    const reloadResponse = await app.inject({
      method: 'GET',
      url: `/v1/video-projects/${projectId}`,
      headers: { 'x-user-id': ownerUserId },
    });
    const reloaded = reloadResponse.json<{
      project: { currentRevision: number };
      currentRevision: { projectDocument: HotelVideoProjectV1 };
    }>();
    expect(reloadResponse.statusCode).toBe(200);
    expect(reloaded.project.currentRevision).toBe(2);
    expect(
      reloaded.currentRevision.projectDocument.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === caption.id),
    ).toMatchObject({ text: '欢迎来到湖畔慢生活' });

    const revisionsResponse = await app.inject({
      method: 'GET',
      url: `/v1/video-projects/${projectId}/revisions`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(
      revisionsResponse.json<Array<{ revision: number }>>().map((revision) => revision.revision),
    ).toEqual([2, 1]);

    const outsiderResponse = await app.inject({
      method: 'GET',
      url: `/v1/video-projects/${projectId}`,
      headers: { 'x-user-id': outsiderUserId },
    });
    expect(outsiderResponse.statusCode).toBe(404);
  });

  it('compiles analyzed and manually tagged hotel assets into revision one', async () => {
    const hotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: {
        organizationId,
        name: 'M7 自动剪辑验收酒店',
        city: '杭州',
      },
    });
    expect(hotelResponse.statusCode).toBe(201);
    const hotel = hotelResponse.json<{ id: string }>();

    const brandKitResponse = await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotel.id}/brand-kit`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        primaryColor: '#17324D',
        secondaryColor: '#F5EFE6',
        accentColor: '#C99A5B',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '住进一段慢时光',
        contactText: '400-000-0000（演示）',
        logoAssetId: null,
      },
    });
    expect(brandKitResponse.statusCode, brandKitResponse.body).toBe(200);

    const briefResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-briefs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        title: 'M7 湖畔周末礼遇',
        platform: 'douyin',
        durationSeconds: 20,
        tone: '温暖高级',
        objective: '提升周末咨询',
        targetAudience: '周末度假客群',
        callToAction: '联系酒店',
      },
    });
    expect(briefResponse.statusCode).toBe(201);
    const brief = briefResponse.json<{ id: string }>();

    const taggedAssets = [
      { id: randomUUID(), label: '酒店外观', filename: '酒店外观.mp4' },
      { id: randomUUID(), label: '客房', filename: '湖景客房.mp4' },
      { id: randomUUID(), label: '服务', filename: '前台服务.mp4' },
      { id: randomUUID(), label: '活动优惠', filename: '周末套餐.mp4' },
    ];
    await client.db.insert(assets).values(
      taggedAssets.map((asset, index) => ({
        byteSize: 10_000_000,
        checksumSha256: String(index + 1).repeat(64),
        contentType: 'video/mp4',
        hotelId: hotel.id,
        id: asset.id,
        kind: 'video' as const,
        metadata: {
          probe: {
            audioChannels: 2,
            audioCodec: 'aac',
            durationMs: 10_000,
            frameRate: 30,
            height: 1_920,
            rotation: 0,
            videoCodec: 'h264',
            width: 1_080,
          },
        },
        originalFilename: asset.filename,
        status: 'ready' as const,
        storageBucket: 'hotelcut-local',
        storageKey: `integration/m7-generation/${hotel.id}/${asset.id}.mp4`,
      })),
    );
    await client.db.insert(assetSegments).values(
      taggedAssets.map((asset) => ({
        assetId: asset.id,
        createdByUserId: ownerUserId,
        endMs: 10_000,
        id: randomUUID(),
        kind: 'manual' as const,
        label: asset.label,
        metadata: {},
        source: 'manual' as const,
        startMs: 0,
      })),
    );

    const templatesResponse = await app.inject({
      method: 'GET',
      url: '/v1/video-project-templates',
      headers: { 'x-user-id': ownerUserId },
    });
    expect(templatesResponse.statusCode).toBe(200);
    expect(
      templatesResponse.json<Array<{ key: string }>>().map((template) => template.key),
    ).toEqual(['hotel.host-broll', 'hotel.room-montage', 'hotel.promotion']);

    const generationResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-projects/generate`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        seed: 20260730,
        templateKey: 'hotel.promotion',
        videoBriefId: brief.id,
      },
    });
    expect(generationResponse.statusCode, generationResponse.body).toBe(201);
    const generated = generationResponse.json<{
      detail: {
        project: { id: string; currentRevision: number; templateKey: string };
        currentRevision: { projectDocument: HotelVideoProjectV1; revision: number };
      };
      generation: {
        selectedSlots: number;
        totalSlots: number;
        usedAssetIds: string[];
      };
    }>();
    expect(generated).toMatchObject({
      detail: {
        project: { currentRevision: 1, templateKey: 'hotel.promotion' },
        currentRevision: { revision: 1 },
      },
      generation: {
        selectedSlots: 4,
        totalSlots: 4,
      },
    });
    expect(generated.generation.usedAssetIds).toHaveLength(4);
    expect(
      generated.detail.currentRevision.projectDocument.tracks
        .filter((track) => track.kind === 'video')
        .flatMap((track) => track.clips),
    ).toHaveLength(4);

    const reloadResponse = await app.inject({
      method: 'GET',
      url: `/v1/video-projects/${generated.detail.project.id}`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(reloadResponse.statusCode).toBe(200);
    expect(reloadResponse.json()).toMatchObject({
      project: { id: generated.detail.project.id, currentRevision: 1 },
    });

    const outsiderResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-projects/generate`,
      headers: { 'x-user-id': outsiderUserId },
      payload: {
        templateKey: 'hotel.promotion',
        videoBriefId: brief.id,
      },
    });
    expect(outsiderResponse.statusCode).toBe(404);

    const untaggedHotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: {
        organizationId,
        name: 'M7 无标签素材验收酒店',
        city: '杭州',
      },
    });
    const untaggedHotel = untaggedHotelResponse.json<{ id: string }>();
    expect(untaggedHotelResponse.statusCode).toBe(201);
    const untaggedBrandKitResponse = await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${untaggedHotel.id}/brand-kit`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        primaryColor: '#17324D',
        secondaryColor: '#F5EFE6',
        accentColor: '#C99A5B',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '住进一段慢时光',
        contactText: null,
        logoAssetId: null,
      },
    });
    expect(untaggedBrandKitResponse.statusCode).toBe(200);
    const untaggedBriefResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${untaggedHotel.id}/video-briefs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        title: '无标签素材不应生成项目',
        platform: 'douyin',
        durationSeconds: 20,
        tone: '温暖高级',
      },
    });
    expect(untaggedBriefResponse.statusCode).toBe(201);
    const untaggedBrief = untaggedBriefResponse.json<{ id: string }>();
    const untaggedAssetId = randomUUID();
    await client.db.insert(assets).values({
      byteSize: 10_000_000,
      checksumSha256: 'f'.repeat(64),
      contentType: 'video/mp4',
      hotelId: untaggedHotel.id,
      id: untaggedAssetId,
      kind: 'video',
      metadata: {
        probe: {
          audioChannels: 2,
          audioCodec: 'aac',
          durationMs: 10_000,
          frameRate: 30,
          height: 1_920,
          rotation: 0,
          videoCodec: 'h264',
          width: 1_080,
        },
      },
      originalFilename: 'untagged-source.mp4',
      status: 'ready',
      storageBucket: 'hotelcut-local',
      storageKey: `integration/m7-generation/${untaggedHotel.id}/${untaggedAssetId}.mp4`,
    });
    const untaggedGenerationResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${untaggedHotel.id}/video-projects/generate`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        templateKey: 'hotel.promotion',
        videoBriefId: untaggedBrief.id,
      },
    });
    expect(untaggedGenerationResponse.statusCode).toBe(400);
    expect(untaggedGenerationResponse.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: '没有素材满足所选模板。请先为可用镜头添加模板建议标签后重试。',
    });
    const untaggedProjectsResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${untaggedHotel.id}/video-projects`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(untaggedProjectsResponse.statusCode).toBe(200);
    expect(untaggedProjectsResponse.json()).toEqual([]);
  });
});
