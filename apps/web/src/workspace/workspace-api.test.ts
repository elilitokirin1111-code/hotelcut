import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceApi, type WorkspaceApiError } from './workspace-api';

const actorUserId = '20000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace API client', () => {
  it('loads only the organizations and hotels returned for the actor header', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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

    const snapshot = await createWorkspaceApi('/api').loadWorkspace(actorUserId);

    expect(snapshot.hotels).toHaveLength(1);
    expect(snapshot.organizations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers).toMatchObject({ 'x-user-id': actorUserId });
    }
  });

  it('preserves a tenant API error instead of rendering another workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Workspace not found' }), {
            status: 404,
          }),
        ),
      ),
    );

    await expect(createWorkspaceApi('/api').loadWorkspace(actorUserId)).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceApiError>>({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
        status: 404,
      }),
    );
  });
});
