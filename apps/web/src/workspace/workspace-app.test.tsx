import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Asset, AuthSession } from '@hotelcut/schemas';

import type { WorkspaceApi } from './workspace-api';
import { WorkspaceApp } from './workspace-app';

const organization = {
  id: '10000000-0000-4000-8000-000000000001',
  name: '云栖酒店集团（演示）',
  slug: 'cloud-rest-demo',
  createdAt: '2026-07-28T08:00:00.000Z',
  updatedAt: '2026-07-28T08:00:00.000Z',
};
const hotels = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    organizationId: organization.id,
    name: '云栖湖畔酒店（虚构）',
    city: '杭州',
    address: '示例路 88 号',
    timezone: 'Asia/Shanghai',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    organizationId: organization.id,
    name: '云栖山居酒店（虚构）',
    city: '黄山',
    address: null,
    timezone: 'Asia/Shanghai',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
];
const session: AuthSession = {
  user: {
    id: '20000000-0000-4000-8000-000000000001',
    email: 'owner@hotelcut.example',
    displayName: '演示管理员',
    status: 'active',
  },
  expiresAt: '2026-08-04T08:00:00.000Z',
};
const brandKit = {
  id: '40000000-0000-4000-8000-000000000001',
  hotelId: hotels[0]!.id,
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
const assets = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    hotelId: hotels[0]!.id,
    kind: 'video' as const,
    status: 'ready' as const,
    originalFilename: '湖景房介绍.mp4',
    contentType: 'video/mp4',
    byteSize: 8_388_608,
    storageBucket: 'hotelcut-local',
    storageKey: 'hotels/demo/assets/ready/original',
    checksumSha256: 'a'.repeat(64),
    metadata: {
      durationMs: 30_000,
      frameRate: 30,
      height: 1920,
      width: 1080,
    },
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:05:00.000Z',
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    hotelId: hotels[0]!.id,
    kind: 'video' as const,
    status: 'failed' as const,
    originalFilename: '大堂口播.mp4',
    contentType: 'video/mp4',
    byteSize: 4_194_304,
    storageBucket: 'hotelcut-local',
    storageKey: 'hotels/demo/assets/failed/original',
    checksumSha256: 'b'.repeat(64),
    metadata: {},
    createdAt: '2026-07-28T08:10:00.000Z',
    updatedAt: '2026-07-28T08:15:00.000Z',
  },
];

function detailFor(asset: Asset) {
  return {
    ...asset,
    derivatives:
      asset.status === 'ready'
        ? [
            {
              id: '71000000-0000-4000-8000-000000000001',
              assetId: asset.id,
              kind: 'proxy' as const,
              storageBucket: 'hotelcut-local',
              storageKey: `${asset.storageKey}/proxy`,
              contentType: 'video/mp4',
              byteSize: 1_048_576,
              checksumSha256: 'c'.repeat(64),
              createdAt: asset.createdAt,
              updatedAt: asset.updatedAt,
            },
          ]
        : [],
    segments: [],
    analysisJobs: [
      {
        id:
          asset.status === 'ready'
            ? '72000000-0000-4000-8000-000000000001'
            : '72000000-0000-4000-8000-000000000002',
        assetId: asset.id,
        status:
          asset.status === 'ready'
            ? ('succeeded' as const)
            : asset.status === 'failed'
              ? ('failed' as const)
              : ('queued' as const),
        attempt: 1,
        maxAttempts: 3,
        logs: [
          {
            at: '2026-07-28T08:05:00.000Z',
            level: asset.status === 'failed' ? ('error' as const) : ('info' as const),
            message:
              asset.status === 'ready'
                ? '分析完成'
                : asset.status === 'failed'
                  ? '无法读取视频'
                  : '等待分析',
          },
        ],
        errorCode: asset.status === 'failed' ? 'PROBE_FAILED' : null,
        errorMessage: asset.status === 'failed' ? '无法读取视频' : null,
        startedAt: '2026-07-28T08:01:00.000Z',
        finishedAt: '2026-07-28T08:05:00.000Z',
        createdAt: '2026-07-28T08:00:30.000Z',
        updatedAt: '2026-07-28T08:05:00.000Z',
      },
    ],
  };
}

function createApi(initialSession: AuthSession | null): {
  api: WorkspaceApi;
  createManualSegment: ReturnType<typeof vi.fn<WorkspaceApi['createManualSegment']>>;
  getSession: ReturnType<typeof vi.fn<WorkspaceApi['getSession']>>;
  getAssetDerivativeDownload: ReturnType<typeof vi.fn<WorkspaceApi['getAssetDerivativeDownload']>>;
  getAssetDetail: ReturnType<typeof vi.fn<WorkspaceApi['getAssetDetail']>>;
  listAssets: ReturnType<typeof vi.fn<WorkspaceApi['listAssets']>>;
  loadHotelConfiguration: ReturnType<typeof vi.fn<WorkspaceApi['loadHotelConfiguration']>>;
  loadWorkspace: ReturnType<typeof vi.fn<WorkspaceApi['loadWorkspace']>>;
  login: ReturnType<typeof vi.fn<WorkspaceApi['login']>>;
  logout: ReturnType<typeof vi.fn<WorkspaceApi['logout']>>;
  retryAssetAnalysis: ReturnType<typeof vi.fn<WorkspaceApi['retryAssetAnalysis']>>;
  saveBrandKit: ReturnType<typeof vi.fn<WorkspaceApi['saveBrandKit']>>;
  updateHotel: ReturnType<typeof vi.fn<WorkspaceApi['updateHotel']>>;
  uploadVideo: ReturnType<typeof vi.fn<WorkspaceApi['uploadVideo']>>;
} {
  const getSession = vi.fn<WorkspaceApi['getSession']>().mockResolvedValue(initialSession);
  const loadHotelConfiguration = vi
    .fn<WorkspaceApi['loadHotelConfiguration']>()
    .mockImplementation((hotelId) => {
      const hotel = hotels.find((candidate) => candidate.id === hotelId);
      if (!hotel) {
        return Promise.reject(new Error('Hotel not found'));
      }
      return Promise.resolve({ brandKit: { ...brandKit, hotelId }, hotel });
    });
  const loadWorkspace = vi
    .fn<WorkspaceApi['loadWorkspace']>()
    .mockResolvedValue({ hotels, organizations: [organization] });
  const login = vi.fn<WorkspaceApi['login']>().mockResolvedValue(session);
  const logout = vi.fn<WorkspaceApi['logout']>().mockResolvedValue();
  const listAssets = vi.fn<WorkspaceApi['listAssets']>().mockResolvedValue(assets);
  const getAssetDetail = vi.fn<WorkspaceApi['getAssetDetail']>().mockImplementation((assetId) => {
    const asset = assets.find((candidate) => candidate.id === assetId);
    return asset ? Promise.resolve(detailFor(asset)) : Promise.reject(new Error('Asset not found'));
  });
  const getAssetDerivativeDownload = vi
    .fn<WorkspaceApi['getAssetDerivativeDownload']>()
    .mockResolvedValue({ expiresInSeconds: 900, url: 'https://media.test/proxy.mp4' });
  const uploadVideo = vi
    .fn<WorkspaceApi['uploadVideo']>()
    .mockImplementation((_, __, onProgress) => {
      onProgress?.({
        completedBytes: 100,
        percent: 100,
        phase: 'finalizing',
        totalBytes: 100,
      });
      return Promise.resolve({
        analysisJobId: '72000000-0000-4000-8000-000000000003',
        assetId: assets[0]!.id,
        status: 'queued',
      });
    });
  const retryAssetAnalysis = vi.fn<WorkspaceApi['retryAssetAnalysis']>().mockResolvedValue({
    analysisJobId: '72000000-0000-4000-8000-000000000004',
    assetId: assets[1]!.id,
    status: 'queued',
  });
  const createManualSegment = vi
    .fn<WorkspaceApi['createManualSegment']>()
    .mockImplementation((assetId, input) =>
      Promise.resolve({
        id: '73000000-0000-4000-8000-000000000001',
        assetId,
        startMs: input.startMs,
        endMs: input.endMs,
        label: input.label,
        kind: 'manual',
        source: 'manual',
        scoreBasisPoints: input.scoreBasisPoints ?? null,
        createdByUserId: session.user.id,
        metadata: input.metadata,
        createdAt: '2026-07-29T08:00:00.000Z',
        updatedAt: '2026-07-29T08:00:00.000Z',
      }),
    );
  const saveBrandKit = vi.fn<WorkspaceApi['saveBrandKit']>().mockImplementation((hotelId, input) =>
    Promise.resolve({
      ...brandKit,
      ...input,
      contactText: input.contactText ?? null,
      hotelId,
      logoAssetId: input.logoAssetId ?? null,
      updatedAt: '2026-07-29T08:00:00.000Z',
    }),
  );
  const updateHotel = vi.fn<WorkspaceApi['updateHotel']>().mockImplementation((hotelId, input) => {
    const hotel = hotels.find((candidate) => candidate.id === hotelId)!;
    return Promise.resolve({
      ...hotel,
      address: input.address === undefined ? hotel.address : input.address,
      city: input.city ?? hotel.city,
      name: input.name ?? hotel.name,
      timezone: input.timezone ?? hotel.timezone,
      updatedAt: '2026-07-29T08:00:00.000Z',
    });
  });
  return {
    api: {
      createManualSegment,
      getAssetDerivativeDownload,
      getAssetDetail,
      getSession,
      listAssets,
      loadHotelConfiguration,
      loadWorkspace,
      login,
      logout,
      retryAssetAnalysis,
      saveBrandKit,
      updateHotel,
      uploadVideo,
    },
    createManualSegment,
    getAssetDerivativeDownload,
    getAssetDetail,
    getSession,
    listAssets,
    loadHotelConfiguration,
    loadWorkspace,
    login,
    logout,
    retryAssetAnalysis,
    saveBrandKit,
    updateHotel,
    uploadVideo,
  };
}

describe('M7 email-authenticated hotel workspace', () => {
  it('creates a server session before loading tenant-visible hotels', async () => {
    const { api, loadWorkspace, login } = createApi(null);
    render(<WorkspaceApp api={api} />);

    expect(await screen.findByRole('heading', { name: '酒店短视频工作空间' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '登录工作空间' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('owner@hotelcut.example', 'hotelcut-local'),
    );
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledWith(expect.any(AbortSignal)));
    expect(screen.getByRole('heading', { name: '选择酒店' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('酒店列表')).getAllByRole('article')).toHaveLength(2);
  });

  it('restores a valid session, searches hotels and enters the selected workspace', async () => {
    render(<WorkspaceApp api={createApi(session).api} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索酒店' }), {
      target: { value: '黄山' },
    });
    expect(screen.queryByText('云栖湖畔酒店（虚构）')).not.toBeInTheDocument();
    expect(screen.getByText('云栖山居酒店（虚构）')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '进入 云栖山居酒店（虚构）' }));
    expect(screen.getByRole('heading', { name: '云栖山居酒店（虚构）' })).toBeInTheDocument();
    expect(screen.getByLabelText('酒店工作空间模块')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回酒店列表' }));
    expect(screen.getByRole('heading', { name: '选择酒店' })).toBeInTheDocument();
  });

  it('loads, edits and saves hotel and BrandKit configuration', async () => {
    const { api, loadHotelConfiguration, saveBrandKit, updateHotel } = createApi(session);
    render(<WorkspaceApp api={api} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    fireEvent.click(screen.getByRole('button', { name: '打开酒店配置' }));
    await screen.findByRole('heading', { name: '酒店资料与品牌配置' });
    await waitFor(() =>
      expect(loadHotelConfiguration).toHaveBeenCalledWith(hotels[0]!.id, expect.any(AbortSignal)),
    );

    fireEvent.change(screen.getByLabelText('酒店名称'), {
      target: { value: '云栖湖畔度假酒店（虚构）' },
    });
    fireEvent.change(screen.getByLabelText('城市'), {
      target: { value: '苏州' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存酒店资料' }));

    await waitFor(() =>
      expect(updateHotel).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          city: '苏州',
          name: '云栖湖畔度假酒店（虚构）',
        }),
      ),
    );
    expect(await screen.findByText('酒店资料已保存')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '云栖湖畔度假酒店（虚构）' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('强调色'), {
      target: { value: '#b87333' },
    });
    fireEvent.change(screen.getByLabelText('默认片尾文案'), {
      target: { value: '今晚，住进湖畔慢时光' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存品牌配置' }));

    await waitFor(() =>
      expect(saveBrandKit).toHaveBeenCalledWith(
        hotels[0]!.id,
        expect.objectContaining({
          accentColor: '#b87333',
          endingText: '今晚，住进湖畔慢时光',
          logoAssetId: null,
        }),
      ),
    );
    expect(await screen.findByText('品牌配置已保存')).toBeInTheDocument();
  });

  it('operates the production asset library through tenant-scoped APIs', async () => {
    const {
      api,
      createManualSegment,
      getAssetDetail,
      listAssets,
      retryAssetAnalysis,
      uploadVideo,
    } = createApi(session);
    render(<WorkspaceApp api={api} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    expect(await screen.findByRole('heading', { name: '生产素材库' })).toBeInTheDocument();
    await waitFor(() =>
      expect(listAssets).toHaveBeenCalledWith(hotels[0]!.id, expect.any(AbortSignal)),
    );
    expect(
      await within(screen.getByLabelText('素材列表')).findByText('湖景房介绍.mp4'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getAssetDetail).toHaveBeenCalledWith(assets[0]!.id, expect.anything()),
    );

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索素材文件名' }), {
      target: { value: '大堂' },
    });
    expect(
      within(screen.getByLabelText('素材列表')).queryByText('湖景房介绍.mp4'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /大堂口播\.mp4/ }));
    fireEvent.click(await screen.findByRole('button', { name: '重新分析' }));
    await waitFor(() => expect(retryAssetAnalysis).toHaveBeenCalledWith(assets[1]!.id));

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索素材文件名' }), {
      target: { value: '湖景' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /湖景房介绍\.mp4/ }));
    await screen.findByLabelText('素材代理视频预览');
    fireEvent.change(screen.getByLabelText('标签'), { target: { value: '湖景房' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标签' }));
    await waitFor(() =>
      expect(createManualSegment).toHaveBeenCalledWith(
        assets[0]!.id,
        expect.objectContaining({ endMs: 30_000, label: '湖景房', startMs: 0 }),
      ),
    );

    const file = new File(['hotelcut-video'], '新客房素材.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('选择视频文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '上传并自动分析' }));
    await waitFor(() =>
      expect(uploadVideo).toHaveBeenCalledWith(hotels[0]!.id, file, expect.any(Function)),
    );
    expect(await screen.findByText('上传完成，已进入自动分析队列')).toBeInTheDocument();
  });

  it('refreshes selected asset detail when analysis changes the list status', async () => {
    const { api, getAssetDetail, listAssets } = createApi(session);
    const uploadedAsset: Asset = {
      ...assets[0]!,
      status: 'uploaded',
      updatedAt: '2026-07-29T08:00:00.000Z',
    };
    const readyAsset: Asset = {
      ...assets[0]!,
      status: 'ready',
      updatedAt: '2026-07-29T08:01:00.000Z',
    };
    listAssets.mockResolvedValueOnce([uploadedAsset]).mockResolvedValue([readyAsset]);
    getAssetDetail
      .mockResolvedValueOnce(detailFor(uploadedAsset))
      .mockResolvedValue(detailFor(readyAsset));
    render(<WorkspaceApp api={api} />);
    await screen.findByRole('heading', { name: '选择酒店' });

    fireEvent.click(await screen.findByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }));
    expect(await screen.findByRole('button', { name: /等待分析/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));

    expect(await screen.findByRole('button', { name: /可用于剪辑/ })).toBeInTheDocument();
    await waitFor(() => expect(getAssetDetail).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('素材代理视频预览')).toBeInTheDocument();
  });

  it('shows a stable login error without entering the workspace', async () => {
    const { api, login } = createApi(null);
    login.mockRejectedValue(new Error('邮箱或密码错误'));
    render(<WorkspaceApp api={api} />);
    await screen.findByRole('heading', { name: '酒店短视频工作空间' });

    fireEvent.click(screen.getByRole('button', { name: '登录工作空间' }));

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '选择酒店' })).not.toBeInTheDocument();
  });
});
