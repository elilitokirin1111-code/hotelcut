import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@hotelcut/schemas';

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

function createApi(initialSession: AuthSession | null): {
  api: WorkspaceApi;
  getSession: ReturnType<typeof vi.fn<WorkspaceApi['getSession']>>;
  loadHotelConfiguration: ReturnType<typeof vi.fn<WorkspaceApi['loadHotelConfiguration']>>;
  loadWorkspace: ReturnType<typeof vi.fn<WorkspaceApi['loadWorkspace']>>;
  login: ReturnType<typeof vi.fn<WorkspaceApi['login']>>;
  logout: ReturnType<typeof vi.fn<WorkspaceApi['logout']>>;
  saveBrandKit: ReturnType<typeof vi.fn<WorkspaceApi['saveBrandKit']>>;
  updateHotel: ReturnType<typeof vi.fn<WorkspaceApi['updateHotel']>>;
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
      getSession,
      loadHotelConfiguration,
      loadWorkspace,
      login,
      logout,
      saveBrandKit,
      updateHotel,
    },
    getSession,
    loadHotelConfiguration,
    loadWorkspace,
    login,
    logout,
    saveBrandKit,
    updateHotel,
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
