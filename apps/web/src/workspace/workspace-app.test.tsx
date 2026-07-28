import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceApi } from './workspace-api';
import { WorkspaceApp } from './workspace-app';

const developmentUserId = '20000000-0000-4000-8000-000000000001';
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

function createApi(): {
  api: WorkspaceApi;
  loadWorkspace: ReturnType<typeof vi.fn<WorkspaceApi['loadWorkspace']>>;
} {
  const loadWorkspace = vi
    .fn<WorkspaceApi['loadWorkspace']>()
    .mockResolvedValue({ hotels, organizations: [organization] });
  return { api: { loadWorkspace }, loadWorkspace };
}

describe('M7 hotel workspace entry', () => {
  it('uses the development seed account and lists only API-visible hotels', async () => {
    const { api, loadWorkspace } = createApi();
    render(<WorkspaceApp api={api} developmentUserId={developmentUserId} />);

    expect(screen.getByRole('heading', { name: '酒店短视频工作空间' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '使用种子账号进入' }));

    await waitFor(() =>
      expect(loadWorkspace).toHaveBeenCalledWith(developmentUserId, expect.any(AbortSignal)),
    );
    expect(screen.getByRole('heading', { name: '选择酒店' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('酒店列表')).getAllByRole('article')).toHaveLength(2);
  });

  it('searches visible hotels and enters the selected tenant workspace', async () => {
    render(<WorkspaceApp api={createApi().api} developmentUserId={developmentUserId} />);
    fireEvent.click(screen.getByRole('button', { name: '使用种子账号进入' }));
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
});
