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
import { memberships, organizations, users } from '../../packages/database/src/schema.js';
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
});
