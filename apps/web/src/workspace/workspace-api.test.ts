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

  it('loads asset production data and submits retry and manual-tag operations', async () => {
    const asset = {
      id: '70000000-0000-4000-8000-000000000001',
      hotelId: '30000000-0000-4000-8000-000000000001',
      kind: 'video' as const,
      status: 'ready' as const,
      originalFilename: 'room-tour.mp4',
      contentType: 'video/mp4',
      byteSize: 8_388_608,
      storageBucket: 'hotelcut-local',
      storageKey: 'hotels/demo/assets/room-tour/original',
      checksumSha256: 'a'.repeat(64),
      metadata: { durationMs: 30_000 },
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:05:00.000Z',
    };
    const detail = {
      ...asset,
      derivatives: [],
      segments: [],
      analysisJobs: [],
    };
    const retry = {
      analysisJobId: '72000000-0000-4000-8000-000000000001',
      assetId: asset.id,
      status: 'queued' as const,
    };
    const segment = {
      id: '73000000-0000-4000-8000-000000000001',
      assetId: asset.id,
      startMs: 0,
      endMs: 30_000,
      label: '湖景房',
      kind: 'manual' as const,
      source: 'manual' as const,
      scoreBasisPoints: null,
      createdByUserId: session.user.id,
      metadata: { role: 'operator-tag' },
      createdAt: '2026-07-29T08:00:00.000Z',
      updatedAt: '2026-07-29T08:00:00.000Z',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([asset]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ expiresInSeconds: 900, url: 'https://media.test/proxy.mp4' }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(retry), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(segment), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createWorkspaceApi('/api');

    await expect(api.listAssets(asset.hotelId)).resolves.toEqual([asset]);
    await expect(api.getAssetDetail(asset.id)).resolves.toEqual(detail);
    await expect(api.getAssetDerivativeDownload(asset.id, 'proxy')).resolves.toEqual({
      expiresInSeconds: 900,
      url: 'https://media.test/proxy.mp4',
    });
    await expect(api.retryAssetAnalysis(asset.id)).resolves.toEqual(retry);
    await expect(
      api.createManualSegment(asset.id, {
        endMs: 30_000,
        label: '湖景房',
        metadata: { role: 'operator-tag' },
        scoreBasisPoints: null,
        startMs: 0,
      }),
    ).resolves.toEqual(segment);

    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
    });
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      body: JSON.stringify({
        endMs: 30_000,
        label: '湖景房',
        metadata: { role: 'operator-tag' },
        scoreBasisPoints: null,
        startMs: 0,
      }),
      credentials: 'include',
      method: 'POST',
    });
  });

  it('hashes and uploads a video through presigned multipart storage URLs', async () => {
    const assetId = '70000000-0000-4000-8000-000000000001';
    const uploadId = 'provider-upload-1';
    const now = '2026-07-29T08:00:00.000Z';
    const registration = {
      asset: {
        id: assetId,
        hotelId: '30000000-0000-4000-8000-000000000001',
        kind: 'video',
        status: 'registered',
        originalFilename: 'room-tour.mp4',
        contentType: 'video/mp4',
        byteSize: 3,
        storageBucket: 'hotelcut-local',
        storageKey: 'hotels/demo/assets/room-tour/original',
        checksumSha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
      upload: {
        id: '74000000-0000-4000-8000-000000000001',
        assetId,
        providerUploadId: uploadId,
        partSize: 8 * 1024 * 1024,
        partCount: 1,
        status: 'initiated',
        expiresAt: '2026-07-29T08:15:00.000Z',
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      parts: [
        {
          partNumber: 1,
          url: 'https://uploads.test/part-1',
          expiresAt: '2026-07-29T08:15:00.000Z',
        },
      ],
    };
    const completion = {
      assetId,
      analysisJobId: '72000000-0000-4000-8000-000000000001',
      status: 'queued',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(registration), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { ETag: '"etag-1"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const progress = vi.fn();
    const file = new File([new Uint8Array([1, 2, 3])], 'room-tour.mp4', {
      type: 'video/mp4',
    });

    await expect(
      createWorkspaceApi('/api').uploadVideo(registration.asset.hotelId, file, progress),
    ).resolves.toEqual(completion);

    const registrationBodyText = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof registrationBodyText !== 'string') {
      throw new Error('Expected the upload registration body to be JSON text');
    }
    const registrationBody = JSON.parse(registrationBodyText) as Record<string, unknown>;
    expect(registrationBody).toMatchObject({
      byteSize: 3,
      checksumSha256: registration.asset.checksumSha256,
      contentType: 'video/mp4',
      kind: 'video',
      originalFilename: 'room-tour.mp4',
      partSize: 8 * 1024 * 1024,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://uploads.test/part-1');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify({
        parts: [{ etag: '"etag-1"', partNumber: 1 }],
        uploadId,
      }),
      credentials: 'include',
      method: 'POST',
    });
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ percent: 100, phase: 'finalizing' }),
    );
  });

  it('creates a production brief and requests a persisted automatic edit', async () => {
    const hotelId = '30000000-0000-4000-8000-000000000001';
    const briefId = '50000000-0000-4000-8000-000000000001';
    const projectId = '60000000-0000-4000-8000-000000000001';
    const now = '2026-07-30T02:00:00.000Z';
    const template = {
      key: 'hotel.promotion',
      version: '1.0.0',
      name: '酒店活动推广',
      description: '聚焦酒店、服务和活动权益',
      minDurationSeconds: 15,
      maxDurationSeconds: 25,
      requiredTags: ['exterior', 'promotion', 'room', 'service'],
    };
    const brief = {
      id: briefId,
      hotelId,
      title: '湖畔周末礼遇',
      platform: 'douyin',
      durationSeconds: 20,
      aspectRatio: '9:16',
      tone: '温暖高级',
      language: 'zh-CN',
      objective: '提升周末咨询',
      targetAudience: '周末度假客群',
      callToAction: '联系酒店',
      createdAt: now,
      updatedAt: now,
    };
    const project = {
      id: projectId,
      hotelId,
      videoBriefId: briefId,
      name: brief.title,
      templateKey: template.key,
      status: 'draft' as const,
      currentRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const detail = {
      project,
      currentRevision: {
        id: '61000000-0000-4000-8000-000000000001',
        videoProjectId: projectId,
        revision: 1,
        schemaVersion: '1.0.0',
        projectDocument: { id: projectId, schemaVersion: '1.0.0' },
        createdByUserId: session.user.id,
        createdAt: now,
      },
    };
    const generated = {
      detail,
      generation: {
        templateKey: template.key,
        templateVersion: template.version,
        seed: 20260730,
        totalSlots: 4,
        selectedSlots: 4,
        usedAssetIds: ['70000000-0000-4000-8000-000000000001'],
        warnings: [],
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([template]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([project]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(brief), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(generated), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createWorkspaceApi('/api');

    await expect(api.listProjectTemplates()).resolves.toEqual([template]);
    await expect(api.listVideoProjects(hotelId)).resolves.toEqual([project]);
    await expect(
      api.createVideoBrief(hotelId, {
        aspectRatio: '9:16',
        callToAction: '联系酒店',
        durationSeconds: 20,
        language: 'zh-CN',
        objective: '提升周末咨询',
        platform: 'douyin',
        targetAudience: '周末度假客群',
        title: '湖畔周末礼遇',
        tone: '温暖高级',
      }),
    ).resolves.toEqual(brief);
    await expect(
      api.generateVideoProject(hotelId, {
        seed: 20260730,
        templateKey: template.key,
        videoBriefId: briefId,
      }),
    ).resolves.toEqual(generated);
    await expect(api.getVideoProject(projectId)).resolves.toEqual(detail);

    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({
        seed: 20260730,
        templateKey: template.key,
        videoBriefId: briefId,
      }),
      credentials: 'include',
      method: 'POST',
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
