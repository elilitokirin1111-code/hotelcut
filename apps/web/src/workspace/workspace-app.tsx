import type { Hotel } from '@hotelcut/schemas';
import { useEffect, useMemo, useState } from 'react';

import { createWorkspaceApi, type WorkspaceApi, type WorkspaceSnapshot } from './workspace-api';

const developmentSeedUserId =
  import.meta.env.VITE_DEVELOPMENT_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const defaultWorkspaceApi = createWorkspaceApi();

interface WorkspaceAppProps {
  api?: WorkspaceApi;
  developmentUserId?: string;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; snapshot: WorkspaceSnapshot }
  | { status: 'error'; message: string };

const workspaceModules = [
  {
    title: '酒店配置',
    description: '基础信息、BrandKit、CTA、Logo 与默认片尾',
  },
  {
    title: '素材库',
    description: '上传、分析状态、标签、镜头切分与转写',
  },
  {
    title: '视频项目',
    description: '创建视频、打开编辑器并管理项目修订',
  },
  {
    title: '渲染中心',
    description: '查看进度、质量报告并下载交付产物',
  },
] as const;

function formatLoadError(error: unknown): string {
  return error instanceof Error ? error.message : '酒店工作空间加载失败';
}

function HotelWorkspace({
  hotel,
  organizationName,
  onBack,
}: {
  hotel: Hotel;
  organizationName: string;
  onBack: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#eef1ef] text-[#263138]">
      <header className="border-b border-white/80 bg-white/75 px-5 py-5 backdrop-blur-xl lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a6b3c]">
              {organizationName}
            </p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-[-0.03em]">{hotel.name}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {hotel.city} · {hotel.timezone}
            </p>
          </div>
          <button className="editor-secondary-button" onClick={onBack} type="button">
            返回酒店列表
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
        <section className="overflow-hidden rounded-[28px] bg-[#263138] p-7 text-white shadow-[0_24px_80px_rgba(35,52,60,.18)]">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#e2b174]">
            M7 Workspace
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.035em]">
            从酒店资料到成片交付，都在一个隔离工作空间内完成。
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            当前切片已接入租户身份和酒店选择。后续模块会沿用同一酒店边界逐项接入，
            不会共享其他酒店的数据或上传地址。
          </p>
        </section>

        <section
          aria-label="酒店工作空间模块"
          className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {workspaceModules.map((module, index) => (
            <article
              className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_14px_45px_rgba(35,52,60,.08)]"
              key={module.title}
            >
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#f3e5d4] text-sm font-black text-[#8d5d30]">
                {String(index + 1).padStart(2, '0')}
              </div>
              <h3 className="mt-5 text-base font-black">{module.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{module.description}</p>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                后续切片接入
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export function WorkspaceApp({
  api = defaultWorkspaceApi,
  developmentUserId = developmentSeedUserId,
}: WorkspaceAppProps) {
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [query, setQuery] = useState('');
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);

  useEffect(() => {
    if (!actorUserId) {
      setLoadState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void api
      .loadWorkspace(actorUserId, controller.signal)
      .then((snapshot) => {
        setLoadState({ snapshot, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({ message: formatLoadError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [actorUserId, api]);

  const organizationNameById = useMemo(() => {
    if (loadState.status !== 'ready') {
      return new Map<string, string>();
    }
    return new Map(
      loadState.snapshot.organizations.map((organization) => [organization.id, organization.name]),
    );
  }, [loadState]);

  const visibleHotels = useMemo(() => {
    if (loadState.status !== 'ready') {
      return [];
    }
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalizedQuery) {
      return loadState.snapshot.hotels;
    }
    return loadState.snapshot.hotels.filter((hotel) =>
      [hotel.name, hotel.city, organizationNameById.get(hotel.organizationId) ?? ''].some((value) =>
        value.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
      ),
    );
  }, [loadState, organizationNameById, query]);

  const selectedHotel =
    loadState.status === 'ready'
      ? (loadState.snapshot.hotels.find((hotel) => hotel.id === selectedHotelId) ?? null)
      : null;

  if (!actorUserId) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#e8eeeb] px-5 py-10 text-[#263138]">
        <section className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/80 bg-white/80 p-8 shadow-[0_28px_90px_rgba(35,52,60,.16)] backdrop-blur-xl">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#263138] text-xl font-black text-[#e2b174]">
            H
          </div>
          <p className="mt-8 text-[11px] font-black uppercase tracking-[0.2em] text-[#9a6b3c]">
            HotelCut
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">酒店短视频工作空间</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            开发环境使用数据库种子账号进入。该入口仅用于本地 M7 验收，不代表正式邮箱认证已完成。
          </p>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black">演示管理员</p>
            <p className="mt-1 text-xs text-slate-500">owner@hotelcut.example</p>
          </div>
          <button
            className="mt-4 w-full rounded-2xl bg-[#263138] px-5 py-3.5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#172126]"
            onClick={() => setActorUserId(developmentUserId)}
            type="button"
          >
            使用种子账号进入
          </button>
        </section>
      </main>
    );
  }

  if (selectedHotel) {
    return (
      <HotelWorkspace
        hotel={selectedHotel}
        onBack={() => setSelectedHotelId(null)}
        organizationName={organizationNameById.get(selectedHotel.organizationId) ?? '未命名组织'}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1ef] px-5 py-8 text-[#263138] lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9a6b3c]">
              M7 Hotel Workspace
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">选择酒店</h1>
            <p className="mt-2 text-sm text-slate-500">
              仅显示当前种子账号拥有成员权限的组织与酒店。
            </p>
          </div>
          <button
            className="editor-secondary-button"
            onClick={() => {
              setActorUserId(null);
              setQuery('');
              setSelectedHotelId(null);
            }}
            type="button"
          >
            退出种子账号
          </button>
        </header>

        <label className="mt-8 block max-w-xl">
          <span className="sr-only">搜索酒店</span>
          <input
            aria-label="搜索酒店"
            className="w-full rounded-2xl border border-white bg-white/80 px-5 py-3.5 text-sm font-semibold shadow-[0_12px_40px_rgba(35,52,60,.08)] outline-none transition focus:border-[#d6a76d]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索酒店、城市或所属组织"
            type="search"
            value={query}
          />
        </label>

        {loadState.status === 'loading' ? (
          <p className="mt-10 text-sm font-semibold text-slate-500">正在加载酒店工作空间…</p>
        ) : null}

        {loadState.status === 'error' ? (
          <section className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-6">
            <h2 className="text-sm font-black text-rose-800">工作空间加载失败</h2>
            <p className="mt-2 text-xs leading-5 text-rose-700">{loadState.message}</p>
          </section>
        ) : null}

        {loadState.status === 'ready' ? (
          <section aria-label="酒店列表" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleHotels.map((hotel) => (
              <article
                className="rounded-[26px] border border-white/80 bg-white/75 p-6 shadow-[0_16px_55px_rgba(35,52,60,.09)]"
                key={hotel.id}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9a6b3c]">
                  {organizationNameById.get(hotel.organizationId) ?? '未命名组织'}
                </p>
                <h2 className="mt-3 text-xl font-black tracking-[-0.025em]">{hotel.name}</h2>
                <p className="mt-2 text-xs text-slate-500">
                  {hotel.city} · {hotel.timezone}
                </p>
                <button
                  className="mt-6 w-full rounded-xl bg-[#263138] px-4 py-3 text-xs font-black text-white transition hover:-translate-y-0.5 hover:bg-[#172126]"
                  onClick={() => setSelectedHotelId(hotel.id)}
                  type="button"
                >
                  进入 {hotel.name}
                </button>
              </article>
            ))}
            {visibleHotels.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                没有符合当前搜索条件的酒店。
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
