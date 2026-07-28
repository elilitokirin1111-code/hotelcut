import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceApi, type WorkspaceApiError } from './workspace-api';

const session = {
  user: {
    id: '20000000-0000-4000-8000-000000000001',
    email: 'owner@hotelcut.example',
    displayName: '演示管理员',
    status: 'active' as const,
  },
  expiresAt: '2026-08-04T08:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace API client', () => {
  it('reads a server-owned session and treats HTTP 401 as anonymous', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createWorkspaceApi('/api');

    await expect(api.getSession()).resolves.toEqual(session);
    await expect(api.getSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('logs in and loads tenant data through the session cookie without a user ID header', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '10000000-0000-4000-8000-000000000001',
              name: '云栖酒店集团（演示）',
              slug: 'cloud-rest-demo',
              createdAt: '2026-07-28T08:00:00.000Z',
              updatedAt: '2026-07-28T08:00:00.000Z',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '30000000-0000-4000-8000-000000000001',
              organizationId: '10000000-0000-4000-8000-000000000001',
              name: '云栖湖畔酒店（虚构）',
              city: '杭州',
              address: '示例路 88 号',
              timezone: 'Asia/Shanghai',
              createdAt: '2026-07-28T08:00:00.000Z',
              updatedAt: '2026-07-28T08:00:00.000Z',
            },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const api = createWorkspaceApi('/api');

    await expect(api.login('owner@hotelcut.example', 'hotelcut-local')).resolves.toEqual(session);
    const snapshot = await api.loadWorkspace();

    expect(snapshot.hotels).toHaveLength(1);
    expect(snapshot.organizations).toHaveLength(1);
    const loginInit = fetchMock.mock.calls[0]?.[1];
    expect(loginInit).toMatchObject({
      body: JSON.stringify({
        email: 'owner@hotelcut.example',
        password: 'hotelcut-local',
      }),
      method: 'POST',
    });
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers).not.toHaveProperty('x-user-id');
      expect(call[1]).toMatchObject({ credentials: 'include' });
    }
  });

  it('preserves an authentication or tenant API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Sign in first' }), {
          status: 401,
        }),
      ),
    );

    await expect(
      createWorkspaceApi('/api').login('owner@hotelcut.example', 'wrong-password'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceApiError>>({
        code: 'UNAUTHENTICATED',
        message: 'Sign in first',
        status: 401,
      }),
    );
  });
});
