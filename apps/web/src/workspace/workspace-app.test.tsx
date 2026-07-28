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

function createApi(initialSession: AuthSession | null): {
  api: WorkspaceApi;
  getSession: ReturnType<typeof vi.fn<WorkspaceApi['getSession']>>;
  loadWorkspace: ReturnType<typeof vi.fn<WorkspaceApi['loadWorkspace']>>;
  login: ReturnType<typeof vi.fn<WorkspaceApi['login']>>;
  logout: ReturnType<typeof vi.fn<WorkspaceApi['logout']>>;
} {
  const getSession = vi.fn<WorkspaceApi['getSession']>().mockResolvedValue(initialSession);
  const loadWorkspace = vi
    .fn<WorkspaceApi['loadWorkspace']>()
    .mockResolvedValue({ hotels, organizations: [organization] });
  const login = vi.fn<WorkspaceApi['login']>().mockResolvedValue(session);
  const logout = vi.fn<WorkspaceApi['logout']>().mockResolvedValue();
  return {
    api: { getSession, loadWorkspace, login, logout },
    getSession,
    loadWorkspace,
    login,
    logout,
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
