import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  createDatabaseClient,
  PostgresHotelCutRepository,
  type DatabaseClient,
} from '../../packages/database/src/index.js';
import { memberships, organizations, users } from '../../packages/database/src/schema.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI Director phase 0 integration', () => {
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
      { id: organizationId, name: 'AI Director 验收组织', slug: `ai-director-${organizationId}` },
      {
        id: outsiderOrganizationId,
        name: 'AI Director 隔离组织',
        slug: `ai-director-${outsiderOrganizationId}`,
      },
    ]);
    await client.db.insert(users).values([
      {
        id: ownerUserId,
        displayName: 'AI Director Owner',
        externalSubject: `ai-director-owner-${ownerUserId}`,
      },
      {
        id: outsiderUserId,
        displayName: 'AI Director Outsider',
        externalSubject: `ai-director-outsider-${outsiderUserId}`,
      },
    ]);
    await client.db.insert(memberships).values([
      {
        id: randomUUID(),
        organizationId,
        role: 'owner',
        userId: ownerUserId,
      },
      {
        id: randomUUID(),
        organizationId: outsiderOrganizationId,
        role: 'owner',
        userId: outsiderUserId,
      },
    ]);
    app = await buildApp({
      aiDirectorFeatureFlags: {
        aiDirectorEnabled: true,
        aiReviewEnabled: false,
        dynamicBlueprintEnabled: false,
        referenceAnalysisEnabled: false,
      },
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

  it('creates, lists, reads and updates a tenant-scoped CreativeProject', async () => {
    const hotelResponse = await app.inject({
      headers: { 'x-user-id': ownerUserId },
      method: 'POST',
      payload: {
        city: '上海',
        name: 'AI Director 验收酒店',
        organizationId,
      },
      url: '/v1/hotels',
    });
    expect(hotelResponse.statusCode, hotelResponse.body).toBe(201);
    const hotel = hotelResponse.json<{ id: string }>();

    const createResponse = await app.inject({
      headers: { 'x-user-id': ownerUserId },
      method: 'POST',
      payload: { mode: 'idea', title: '16 秒酒店前台反差视频' },
      url: `/v1/hotels/${hotel.id}/creative-projects`,
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    const creativeProject = createResponse.json<{ id: string; status: string }>();
    expect(creativeProject.status).toBe('draft');

    const [listResponse, readResponse, outsiderResponse] = await Promise.all([
      app.inject({
        headers: { 'x-user-id': ownerUserId },
        method: 'GET',
        url: `/v1/hotels/${hotel.id}/creative-projects`,
      }),
      app.inject({
        headers: { 'x-user-id': ownerUserId },
        method: 'GET',
        url: `/v1/creative-projects/${creativeProject.id}`,
      }),
      app.inject({
        headers: { 'x-user-id': outsiderUserId },
        method: 'GET',
        url: `/v1/creative-projects/${creativeProject.id}`,
      }),
    ]);
    expect(listResponse.statusCode, listResponse.body).toBe(200);
    expect(listResponse.json<Array<{ id: string }>>()).toEqual([
      expect.objectContaining({ id: creativeProject.id }),
    ]);
    expect(readResponse.statusCode, readResponse.body).toBe(200);
    expect(outsiderResponse.statusCode, outsiderResponse.body).toBe(404);

    const updateResponse = await app.inject({
      headers: { 'x-user-id': ownerUserId },
      method: 'PATCH',
      payload: { status: 'planning', title: '前台反差短片（拍摄版）' },
      url: `/v1/creative-projects/${creativeProject.id}`,
    });
    expect(updateResponse.statusCode, updateResponse.body).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: creativeProject.id,
      status: 'planning',
      title: '前台反差短片（拍摄版）',
    });
  });
});
