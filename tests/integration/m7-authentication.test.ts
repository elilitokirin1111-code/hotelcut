import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../packages/auth/src/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import {
  createDatabaseClient,
  PostgresHotelCutRepository,
  type DatabaseClient,
} from '../../packages/database/src/index.js';
import { memberships, organizations, users } from '../../packages/database/src/schema.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('M7 server-owned authentication integration', () => {
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const userId = randomUUID();
  const organizationId = randomUUID();
  const email = `m7-${userId}@hotelcut.example`;

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }
    client = createDatabaseClient(databaseUrl);
    await client.db.insert(organizations).values({
      id: organizationId,
      name: 'M7 Session Organization',
      slug: `m7-${organizationId}`,
    });
    await client.db.insert(users).values({
      id: userId,
      externalSubject: `m7-user-${userId}`,
      email,
      passwordHash: await hashPassword('m7-integration-password'),
      displayName: 'M7 Session User',
    });
    await client.db.insert(memberships).values({
      id: randomUUID(),
      organizationId,
      userId,
      role: 'owner',
    });
    const repository = new PostgresHotelCutRepository(client.db);
    app = await buildApp({
      allowDevelopmentIdentity: false,
      authRepository: repository,
      repository,
    });
  });

  afterAll(async () => {
    if (!databaseUrl || !client) {
      return;
    }
    await app.close();
    await client.sql`delete from organizations where id = ${organizationId}`;
    await client.sql`delete from users where id = ${userId}`;
    await client.close();
  });

  it('authenticates by email and scopes domain reads through the persisted session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'm7-integration-password' },
    });
    expect(login.statusCode).toBe(200);

    const organizationsResponse = await app.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { cookie: login.headers['set-cookie'] },
    });
    expect(organizationsResponse.statusCode).toBe(200);
    expect(organizationsResponse.json()).toEqual([
      expect.objectContaining({ id: organizationId, name: 'M7 Session Organization' }),
    ]);

    const logout = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/session',
      headers: { cookie: login.headers['set-cookie'] },
    });
    expect(logout.statusCode).toBe(204);

    const revoked = await app.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { cookie: login.headers['set-cookie'] },
    });
    expect(revoked.statusCode).toBe(401);
  });
});
