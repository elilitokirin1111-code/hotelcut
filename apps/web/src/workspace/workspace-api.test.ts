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

  it('loads and saves tenant-scoped hotel and BrandKit configuration', async () => {
    const hotel = {
      id: '30000000-0000-4000-8000-000000000001',
      organizationId: '10000000-0000-4000-8000-000000000001',
      name: '云栖湖畔酒店（虚构）',
      city: '杭州',
      address: '示例路 88 号',
      timezone: 'Asia/Shanghai',
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
    };
    const brandKit = {
      id: '40000000-0000-4000-8000-000000000001',
      hotelId: hotel.id,
      primaryColor: '#17324D',
      secondaryColor: '#F5EFE6',
      accentColor: '#C99A5B',
      fontFamily: 'Noto Sans SC',
      subtitleStyle: 'clean',
      endingText: '在湖畔，住进一段慢时光',
      contactText: '400-000-0000（演示）',
      logoAssetId: null,
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
    };
    const updatedHotel = { ...hotel, city: '苏州' };
    const updatedBrandKit = { ...brandKit, accentColor: '#B87333' };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(hotel), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(brandKit), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedHotel), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedBrandKit), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createWorkspaceApi('/api');

    await expect(api.loadHotelConfiguration(hotel.id)).resolves.toEqual({ brandKit, hotel });
    await expect(
      api.updateHotel(hotel.id, {
        name: hotel.name,
        city: '苏州',
        address: hotel.address,
        timezone: hotel.timezone,
      }),
    ).resolves.toEqual(updatedHotel);
    await expect(
      api.saveBrandKit(hotel.id, {
        primaryColor: brandKit.primaryColor,
        secondaryColor: brandKit.secondaryColor,
        accentColor: '#B87333',
        fontFamily: brandKit.fontFamily,
        subtitleStyle: brandKit.subtitleStyle,
        endingText: brandKit.endingText,
        contactText: brandKit.contactText,
        logoAssetId: null,
      }),
    ).resolves.toEqual(updatedBrandKit);

    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/v1/hotels/${hotel.id}`);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify({
        name: hotel.name,
        city: '苏州',
        address: hotel.address,
        timezone: hotel.timezone,
      }),
      credentials: 'include',
      method: 'PATCH',
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe(`/api/v1/hotels/${hotel.id}/brand-kit`);
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({
        primaryColor: brandKit.primaryColor,
        secondaryColor: brandKit.secondaryColor,
        accentColor: '#B87333',
        fontFamily: brandKit.fontFamily,
        subtitleStyle: brandKit.subtitleStyle,
        endingText: brandKit.endingText,
        contactText: brandKit.contactText,
        logoAssetId: null,
      }),
      credentials: 'include',
      method: 'PUT',
    });
  });

  it('uses editable BrandKit defaults when an accessible hotel has no BrandKit yet', async () => {
    const hotel = {
      id: '30000000-0000-4000-8000-000000000001',
      organizationId: '10000000-0000-4000-8000-000000000001',
      name: '新酒店',
      city: '杭州',
      address: null,
      timezone: 'Asia/Shanghai',
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify(hotel), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Brand kit not found' }), {
            status: 404,
          }),
        ),
    );

    await expect(createWorkspaceApi('/api').loadHotelConfiguration(hotel.id)).resolves.toEqual({
      brandKit: null,
      hotel,
    });
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
