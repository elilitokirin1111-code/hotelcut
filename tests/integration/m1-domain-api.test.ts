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

describeWithDatabase('M1 domain and API integration', () => {
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
      { id: organizationId, name: 'M1 验收组织', slug: `m1-${organizationId}` },
      {
        id: outsiderOrganizationId,
        name: '隔离租户',
        slug: `m1-${outsiderOrganizationId}`,
      },
    ]);
    await client.db.insert(users).values([
      {
        id: ownerUserId,
        externalSubject: `m1-owner-${ownerUserId}`,
        displayName: 'M1 Owner',
      },
      {
        id: outsiderUserId,
        externalSubject: `m1-outsider-${outsiderUserId}`,
        displayName: 'M1 Outsider',
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

  it('creates a hotel, saves its BrandKit, and creates a VideoBrief', async () => {
    const hotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: {
        organizationId,
        name: 'M1 验收酒店',
        city: '成都',
      },
    });
    expect(hotelResponse.statusCode).toBe(201);
    const hotel = hotelResponse.json<{ id: string; timezone: string }>();
    expect(hotel.timezone).toBe('Asia/Shanghai');

    const brandResponse = await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotel.id}/brand-kit`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        primaryColor: '#17324D',
        secondaryColor: '#F5EFE6',
        accentColor: '#C99A5B',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '欢迎入住',
      },
    });
    expect(brandResponse.statusCode).toBe(200);
    expect(brandResponse.json()).toMatchObject({ hotelId: hotel.id });

    const updateHotelResponse = await app.inject({
      method: 'PATCH',
      url: `/v1/hotels/${hotel.id}`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        city: '都江堰',
        address: '虚构地址 18 号',
      },
    });
    expect(updateHotelResponse.statusCode).toBe(200);
    expect(updateHotelResponse.json()).toMatchObject({
      city: '都江堰',
      address: '虚构地址 18 号',
    });

    const brandReadResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotel.id}/brand-kit`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(brandReadResponse.statusCode).toBe(200);
    expect(brandReadResponse.json()).toMatchObject({
      endingText: '欢迎入住',
      hotelId: hotel.id,
    });

    const briefResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-briefs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        title: '夏日城市度假',
        platform: 'douyin',
        durationSeconds: 30,
        tone: '轻松明快',
      },
    });
    expect(briefResponse.statusCode).toBe(201);
    const brief = briefResponse.json<{ id: string; aspectRatio: string }>();
    expect(brief.aspectRatio).toBe('9:16');

    const outsiderHotelResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotel.id}`,
      headers: { 'x-user-id': outsiderUserId },
    });
    const outsiderBriefResponse = await app.inject({
      method: 'GET',
      url: `/v1/video-briefs/${brief.id}`,
      headers: { 'x-user-id': outsiderUserId },
    });
    const outsiderBrandResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotel.id}/brand-kit`,
      headers: { 'x-user-id': outsiderUserId },
    });
    const outsiderBrandUpdateResponse = await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotel.id}/brand-kit`,
      headers: { 'x-user-id': outsiderUserId },
      payload: {
        primaryColor: '#111111',
        secondaryColor: '#222222',
        accentColor: '#333333',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '越权修改',
      },
    });
    expect(outsiderHotelResponse.statusCode, outsiderHotelResponse.body).toBe(404);
    expect(outsiderBriefResponse.statusCode, outsiderBriefResponse.body).toBe(404);
    expect(outsiderBrandResponse.statusCode, outsiderBrandResponse.body).toBe(404);
    expect(outsiderBrandUpdateResponse.statusCode, outsiderBrandUpdateResponse.body).toBe(404);

    await expect(
      client.sql`
        insert into video_briefs (
          id, hotel_id, title, platform, duration_seconds, aspect_ratio, tone, language
        ) values (
          ${randomUUID()}, ${hotel.id}, '非法时长', 'douyin', 1, '9:16', '测试', 'zh-CN'
        )
      `,
    ).rejects.toThrow();
  });
});
