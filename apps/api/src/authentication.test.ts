import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '@hotelcut/auth';
import type { AuthRepository, CreateUserSessionInput, HotelCutRepository } from '@hotelcut/domain';

import { buildApp } from './app.js';

const user = {
  id: '20000000-0000-4000-8000-000000000001',
  externalSubject: 'local-dev-owner',
  email: 'owner@hotelcut.example',
  displayName: '演示管理员',
  status: 'active' as const,
  createdAt: '2026-07-28T08:00:00.000Z',
  updatedAt: '2026-07-28T08:00:00.000Z',
};
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

async function createRepositories() {
  const passwordHash = await hashPassword('hotelcut-local');
  let createdSession: CreateUserSessionInput | null = null;
  const createUserSession = vi.fn((input: CreateUserSessionInput) => {
    createdSession = input;
    return Promise.resolve();
  });
  const revokeUserSession = vi.fn(() => Promise.resolve());
  const authRepository: AuthRepository = {
    findPasswordCredentialByEmail: vi.fn((email: string) =>
      Promise.resolve(email === user.email ? { passwordHash, user } : null),
    ),
    createUserSession,
    findUserBySessionTokenHash: vi.fn((tokenHash: string) =>
      Promise.resolve(
        createdSession?.tokenHash === tokenHash
          ? { expiresAt: createdSession.expiresAt, user }
          : null,
      ),
    ),
    revokeUserSession,
  };
  const listOrganizations = vi.fn(() => Promise.resolve([]));
  const repository = { listOrganizations } as unknown as HotelCutRepository;
  return { authRepository, createUserSession, listOrganizations, repository, revokeUserSession };
}

describe('M7 email authentication', () => {
  it('creates an opaque cookie session and uses it as the protected-route identity', async () => {
    const { authRepository, listOrganizations, repository } = await createRepositories();
    const app = await buildApp({
      allowDevelopmentIdentity: false,
      authRepository,
      repository,
      sessionTtlSeconds: 3600,
    });
    apps.push(app);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: 'hotelcut-local' },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
    const cookie = login.headers['set-cookie'];
    expect(cookie).toEqual(expect.stringContaining('hotelcut_session='));
    expect(cookie).toEqual(expect.stringContaining('HttpOnly'));
    expect(cookie).toEqual(expect.stringContaining('SameSite=Lax'));
    expect(cookie).not.toContain(user.id);

    const organizations = await app.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { cookie },
    });

    expect(organizations.statusCode).toBe(200);
    expect(listOrganizations).toHaveBeenCalledWith(user.id);
  });

  it('rejects invalid credentials and ignores development identity in production mode', async () => {
    const { authRepository, createUserSession, repository } = await createRepositories();
    const app = await buildApp({
      allowDevelopmentIdentity: false,
      authRepository,
      repository,
    });
    apps.push(app);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: 'wrong-password' },
    });
    const protectedRequest = await app.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { 'x-user-id': user.id },
    });
    const anonymousSession = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
    });

    expect(login.statusCode).toBe(401);
    expect(login.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(createUserSession).not.toHaveBeenCalled();
    expect(protectedRequest.statusCode).toBe(401);
    expect(anonymousSession.statusCode).toBe(204);
  });

  it('revokes the server session and expires the cookie on logout', async () => {
    const { authRepository, repository, revokeUserSession } = await createRepositories();
    const app = await buildApp({ authRepository, repository });
    apps.push(app);
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: 'hotelcut-local' },
    });

    const logout = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/session',
      headers: { cookie: login.headers['set-cookie'] },
    });

    expect(logout.statusCode).toBe(204);
    expect(revokeUserSession).toHaveBeenCalledOnce();
    expect(logout.headers['set-cookie']).toEqual(expect.stringContaining('Max-Age=0'));
  });
});
