import type {
  AuthSession,
  BrandKit,
  Hotel,
  UpdateHotelInput,
  UpsertBrandKitInput,
} from '@hotelcut/schemas';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { AssetLibrary } from './asset-library';
import { AiTemplateCenter } from './ai-template-center';
import { AiDirectorWorkspace } from './ai-director-workspace';
import { AppShell, type WorkspaceSection } from './app-shell';
import { AutomaticEditWorkflow } from './automatic-edit-workflow';
import { ModelApiSettings } from './model-api-settings';
import { RenderCenter } from './render-center';
import { WorkspaceDashboard } from './workspace-dashboard';
import {
  createWorkspaceApi,
  WorkspaceApiError,
  type WorkspaceApi,
  type WorkspaceSnapshot,
} from './workspace-api';

const developmentSeedEmail =
  import.meta.env.VITE_DEVELOPMENT_SEED_EMAIL ?? 'owner@hotelcut.example';
const developmentSeedPassword = import.meta.env.VITE_DEVELOPMENT_SEED_PASSWORD ?? 'hotelcut-local';
const guestModeByDefault = import.meta.env.VITE_GUEST_MODE !== 'false';
const defaultWorkspaceApi = createWorkspaceApi();

interface WorkspaceAppProps {
  api?: WorkspaceApi;
  developmentEmail?: string;
  developmentPassword?: string;
  guestMode?: boolean;
}

type SessionState =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; session: AuthSession };

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; snapshot: WorkspaceSnapshot }
  | { status: 'error'; message: string };

type ConfigurationLoadState =
  | { status: 'loading' }
  | { status: 'ready'; hasPersistedBrandKit: boolean }
  | { status: 'error'; message: string };

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; message: string }
  | { status: 'error'; message: string };

interface HotelDraft {
  name: string;
  city: string;
  address: string;
  timezone: string;
}

interface BrandKitDraft {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  subtitleStyle: string;
  endingText: string;
  contactText: string;
}

const defaultBrandKitDraft: BrandKitDraft = {
  primaryColor: '#17324D',
  secondaryColor: '#F5EFE6',
  accentColor: '#C99A5B',
  fontFamily: 'Noto Sans SC',
  subtitleStyle: 'clean',
  endingText: '',
  contactText: '',
};

function hotelDraftFrom(hotel: Hotel): HotelDraft {
  return {
    name: hotel.name,
    city: hotel.city,
    address: hotel.address ?? '',
    timezone: hotel.timezone,
  };
}

function brandKitDraftFrom(brandKit: BrandKit | null): BrandKitDraft {
  if (!brandKit) {
    return defaultBrandKitDraft;
  }
  return {
    primaryColor: brandKit.primaryColor,
    secondaryColor: brandKit.secondaryColor,
    accentColor: brandKit.accentColor,
    fontFamily: brandKit.fontFamily,
    subtitleStyle: brandKit.subtitleStyle,
    endingText: brandKit.endingText,
    contactText: brandKit.contactText ?? '',
  };
}

function formatLoadError(error: unknown): string {
  return error instanceof Error ? error.message : '酒店工作空间加载失败';
}

function PlannedWorkspaceSection({ section }: { section: 'audit' | 'templates' }) {
  const copy = {
    audit: [
      'AUDIT TRAIL',
      '操作记录',
      '审计日志接口尚未在当前后端切片开放。现有素材分析与渲染日志可分别在对应模块查看。',
    ],
    templates: [
      'TEMPLATE CENTER',
      '模板中心',
      '当前可用生产模板来自真实模板 API，并已集成在 AI 成片向导中。独立模板管理将在模板写入接口开放后提供。',
    ],
  } as const;
  const [eyebrow, title, description] = copy[section];
  return (
    <section className="planned-section surface-card">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function HotelWorkspace({
  api,
  hotel,
  organizationName,
  onBack,
  onLogout,
  onHotelUpdated,
  userEmail,
}: {
  api: WorkspaceApi;
  hotel: Hotel;
  organizationName: string;
  onBack: () => void;
  onLogout?: () => void;
  onHotelUpdated: (hotel: Hotel) => void;
  userEmail: string;
}) {
  const [configurationState, setConfigurationState] = useState<ConfigurationLoadState>({
    status: 'loading',
  });
  const [configurationVersion, setConfigurationVersion] = useState(0);
  const [hotelDraft, setHotelDraft] = useState<HotelDraft>(() => hotelDraftFrom(hotel));
  const [brandKitDraft, setBrandKitDraft] = useState<BrandKitDraft>(defaultBrandKitDraft);
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [hotelSaveState, setHotelSaveState] = useState<SaveState>({ status: 'idle' });
  const [brandKitSaveState, setBrandKitSaveState] = useState<SaveState>({ status: 'idle' });
  const [activeModule, setActiveModule] = useState<WorkspaceSection>('ai-director');
  const [studioOpenRequestId, setStudioOpenRequestId] = useState<string | null>(null);
  const [templatesEnabled, setTemplatesEnabled] = useState<boolean>(
    () => window.localStorage.getItem('hotelcut.templatesEnabled') !== 'false',
  );
  const [workspaceCounts, setWorkspaceCounts] = useState<{ assets: number; projects: number }>({
    assets: 0,
    projects: 0,
  });

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeModule]);

  useEffect(() => {
    const controller = new AbortController();
    setConfigurationState({ status: 'loading' });
    setHotelSaveState({ status: 'idle' });
    setBrandKitSaveState({ status: 'idle' });
    void api
      .loadHotelConfiguration(hotel.id, controller.signal)
      .then((configuration) => {
        setHotelDraft(hotelDraftFrom(configuration.hotel));
        setBrandKitDraft(brandKitDraftFrom(configuration.brandKit));
        setLogoAssetId(configuration.brandKit?.logoAssetId ?? null);
        setConfigurationState({
          hasPersistedBrandKit: configuration.brandKit !== null,
          status: 'ready',
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setConfigurationState({ message: formatLoadError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, configurationVersion, hotel.id]);

  const saveHotel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHotelSaveState({ status: 'saving' });
    const input: UpdateHotelInput = {
      name: hotelDraft.name.trim(),
      city: hotelDraft.city.trim(),
      address: hotelDraft.address.trim() || null,
      timezone: hotelDraft.timezone.trim(),
    };
    try {
      const updatedHotel = await api.updateHotel(hotel.id, input);
      setHotelDraft(hotelDraftFrom(updatedHotel));
      onHotelUpdated(updatedHotel);
      setHotelSaveState({ message: '酒店资料已保存', status: 'saved' });
    } catch (error) {
      setHotelSaveState({ message: formatLoadError(error), status: 'error' });
    }
  };

  const saveBrandKit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBrandKitSaveState({ status: 'saving' });
    const input: UpsertBrandKitInput = {
      primaryColor: brandKitDraft.primaryColor,
      secondaryColor: brandKitDraft.secondaryColor,
      accentColor: brandKitDraft.accentColor,
      fontFamily: brandKitDraft.fontFamily.trim(),
      subtitleStyle: brandKitDraft.subtitleStyle.trim(),
      endingText: brandKitDraft.endingText.trim(),
      contactText: brandKitDraft.contactText.trim() || null,
      logoAssetId,
    };
    try {
      const savedBrandKit = await api.saveBrandKit(hotel.id, input);
      setBrandKitDraft(brandKitDraftFrom(savedBrandKit));
      setLogoAssetId(savedBrandKit.logoAssetId);
      setConfigurationState({ hasPersistedBrandKit: true, status: 'ready' });
      setBrandKitSaveState({ message: '品牌配置已保存', status: 'saved' });
    } catch (error) {
      setBrandKitSaveState({ message: formatLoadError(error), status: 'error' });
    }
  };

  const openVideoProjectInStudio = (projectId: string) => {
    setStudioOpenRequestId(projectId);
    setActiveModule('projects');
  };

  const startQuickEdit = () => {
    setActiveModule('projects');
  };

  return (
    <AppShell
      activeSection={activeModule}
      assetCount={workspaceCounts.assets}
      hotel={hotel}
      onBack={onBack}
      onNavigate={setActiveModule}
      organizationName={organizationName}
      projectCount={workspaceCounts.projects}
      templatesEnabled={templatesEnabled}
      userEmail={userEmail}
      {...(onLogout ? { onLogout } : {})}
    >
      <h1 className="sr-only">{hotel.name}</h1>
      {activeModule === 'dashboard' ? (
        <WorkspaceDashboard
          api={api}
          hasBrandKit={
            configurationState.status === 'ready' && configurationState.hasPersistedBrandKit
          }
          hotel={hotel}
          onDataChange={setWorkspaceCounts}
          onNavigate={setActiveModule}
        />
      ) : null}
      {activeModule === 'brand' ? (
        <section aria-label="酒店资料与品牌配置" className="configuration-page surface-card">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a6b3c]">
                Configuration
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">酒店资料与品牌配置</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                这些信息会成为后续素材、模板、字幕和片尾的酒店级默认值。
              </p>
            </div>
            {configurationState.status === 'ready' ? (
              <p className="rounded-full bg-emerald-50 px-4 py-2 text-[10px] font-black text-emerald-700">
                {configurationState.hasPersistedBrandKit
                  ? 'BrandKit 已配置'
                  : '等待首次保存 BrandKit'}
              </p>
            ) : null}
          </div>

          {configurationState.status === 'loading' ? (
            <p className="mt-8 text-sm font-semibold text-slate-500">正在加载酒店配置…</p>
          ) : null}

          {configurationState.status === 'error' ? (
            <div className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <p className="text-sm font-black text-rose-800">酒店配置加载失败</p>
              <p className="mt-2 text-xs leading-5 text-rose-700">{configurationState.message}</p>
              <button
                className="editor-secondary-button mt-4"
                onClick={() => setConfigurationVersion((version) => version + 1)}
                type="button"
              >
                重新加载
              </button>
            </div>
          ) : null}

          {configurationState.status === 'ready' ? (
            <div className="mt-7 grid gap-5 xl:grid-cols-2">
              <form
                aria-label="酒店资料"
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 lg:p-6"
                onSubmit={(event) => void saveHotel(event)}
              >
                <h3 className="text-base font-black">酒店资料</h3>
                <p className="mt-1 text-xs text-slate-500">用于工作空间识别与门店级时区处理。</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-black text-slate-700">酒店名称</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={160}
                      onChange={(event) => {
                        setHotelDraft((draft) => ({ ...draft, name: event.target.value }));
                        setHotelSaveState({ status: 'idle' });
                      }}
                      required
                      value={hotelDraft.name}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-slate-700">城市</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={100}
                      onChange={(event) => {
                        setHotelDraft((draft) => ({ ...draft, city: event.target.value }));
                        setHotelSaveState({ status: 'idle' });
                      }}
                      required
                      value={hotelDraft.city}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-black text-slate-700">地址</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={300}
                      onChange={(event) => {
                        setHotelDraft((draft) => ({ ...draft, address: event.target.value }));
                        setHotelSaveState({ status: 'idle' });
                      }}
                      placeholder="可选"
                      value={hotelDraft.address}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-black text-slate-700">时区</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={80}
                      onChange={(event) => {
                        setHotelDraft((draft) => ({ ...draft, timezone: event.target.value }));
                        setHotelSaveState({ status: 'idle' });
                      }}
                      required
                      value={hotelDraft.timezone}
                    />
                  </label>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-xl bg-[#263138] px-5 py-3 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
                    disabled={hotelSaveState.status === 'saving'}
                    type="submit"
                  >
                    {hotelSaveState.status === 'saving' ? '正在保存…' : '保存酒店资料'}
                  </button>
                  {hotelSaveState.status === 'saved' || hotelSaveState.status === 'error' ? (
                    <p
                      className={`text-xs font-semibold ${
                        hotelSaveState.status === 'saved' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {hotelSaveState.message}
                    </p>
                  ) : null}
                </div>
              </form>

              <form
                aria-label="品牌配置"
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 lg:p-6"
                onSubmit={(event) => void saveBrandKit(event)}
              >
                <div
                  aria-label="品牌色预览"
                  className="h-16 rounded-2xl border border-white shadow-inner"
                  style={{
                    background: `linear-gradient(110deg, ${brandKitDraft.primaryColor} 0 45%, ${brandKitDraft.secondaryColor} 45% 76%, ${brandKitDraft.accentColor} 76%)`,
                  }}
                />
                <h3 className="mt-5 text-base font-black">BrandKit</h3>
                <p className="mt-1 text-xs text-slate-500">品牌色、字体、字幕样式与默认片尾。</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ['primaryColor', '品牌主色'],
                      ['secondaryColor', '品牌辅色'],
                      ['accentColor', '强调色'],
                    ] as const
                  ).map(([field, label]) => (
                    <label className="block" key={field}>
                      <span className="text-xs font-black text-slate-700">{label}</span>
                      <input
                        aria-label={label}
                        className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1.5"
                        onChange={(event) => {
                          setBrandKitDraft((draft) => ({
                            ...draft,
                            [field]: event.target.value,
                          }));
                          setBrandKitSaveState({ status: 'idle' });
                        }}
                        type="color"
                        value={brandKitDraft[field]}
                      />
                    </label>
                  ))}
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-black text-slate-700">品牌字体</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={120}
                      onChange={(event) => {
                        setBrandKitDraft((draft) => ({
                          ...draft,
                          fontFamily: event.target.value,
                        }));
                        setBrandKitSaveState({ status: 'idle' });
                      }}
                      required
                      value={brandKitDraft.fontFamily}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-slate-700">字幕样式</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={80}
                      onChange={(event) => {
                        setBrandKitDraft((draft) => ({
                          ...draft,
                          subtitleStyle: event.target.value,
                        }));
                        setBrandKitSaveState({ status: 'idle' });
                      }}
                      required
                      value={brandKitDraft.subtitleStyle}
                    />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="text-xs font-black text-slate-700">默认片尾文案</span>
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={300}
                      onChange={(event) => {
                        setBrandKitDraft((draft) => ({
                          ...draft,
                          endingText: event.target.value,
                        }));
                        setBrandKitSaveState({ status: 'idle' });
                      }}
                      value={brandKitDraft.endingText}
                    />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="text-xs font-black text-slate-700">联系信息</span>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#d6a76d]"
                      maxLength={200}
                      onChange={(event) => {
                        setBrandKitDraft((draft) => ({
                          ...draft,
                          contactText: event.target.value,
                        }));
                        setBrandKitSaveState({ status: 'idle' });
                      }}
                      placeholder="可选；只填写已审核的真实信息"
                      value={brandKitDraft.contactText}
                    />
                  </label>
                </div>
                <p className="mt-4 text-[10px] leading-4 text-slate-400">
                  Logo 将在素材库切片提供安全选择器；当前保存会保留已有 Logo 关联。
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-xl bg-[#263138] px-5 py-3 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
                    disabled={brandKitSaveState.status === 'saving'}
                    type="submit"
                  >
                    {brandKitSaveState.status === 'saving' ? '正在保存…' : '保存品牌配置'}
                  </button>
                  {brandKitSaveState.status === 'saved' || brandKitSaveState.status === 'error' ? (
                    <p
                      className={`text-xs font-semibold ${
                        brandKitSaveState.status === 'saved' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {brandKitSaveState.message}
                    </p>
                  ) : null}
                </div>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}
      {activeModule === 'assets' ? (
        <AssetLibrary
          api={api}
          hotelId={hotel.id}
          onCreateVideo={() => setActiveModule('ai-director')}
        />
      ) : null}
      {activeModule === 'ai-director' ? (
        <AiDirectorWorkspace
          api={api}
          hotelId={hotel.id}
          onOpenVideoProject={openVideoProjectInStudio}
          onQuickEdit={startQuickEdit}
        />
      ) : null}
      {activeModule === 'projects' ? (
        <AutomaticEditWorkflow
          api={api}
          hotelId={hotel.id}
          onProjectOpened={() => setStudioOpenRequestId(null)}
          openProjectId={studioOpenRequestId}
        />
      ) : null}
      {activeModule === 'renders' ? <RenderCenter api={api} hotelId={hotel.id} /> : null}
      {activeModule === 'settings' ? (
        <div className="space-y-5">
          <ModelApiSettings api={api} hotelId={hotel.id} />
          <section aria-label="界面设置" className="configuration-page surface-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="page-eyebrow">Workspace</p>
                <h2>界面设置</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  控制导航与创作流程中是否显示 AI 模板中心入口。
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  checked={templatesEnabled}
                  onChange={(event) => {
                    setTemplatesEnabled(event.target.checked);
                    window.localStorage.setItem(
                      'hotelcut.templatesEnabled',
                      String(event.target.checked),
                    );
                  }}
                  type="checkbox"
                />
                启用 AI 模板中心
              </label>
            </div>
          </section>
        </div>
      ) : null}
      {activeModule === 'templates' ? <AiTemplateCenter api={api} hotelId={hotel.id} /> : null}
      {activeModule === 'audit' ? <PlannedWorkspaceSection section={activeModule} /> : null}
    </AppShell>
  );
}

export function WorkspaceApp({
  api = defaultWorkspaceApi,
  developmentEmail = developmentSeedEmail,
  developmentPassword = developmentSeedPassword,
  guestMode = guestModeByDefault,
}: WorkspaceAppProps) {
  const [sessionState, setSessionState] = useState<SessionState>(() =>
    guestMode
      ? {
          status: 'authenticated',
          session: {
            user: {
              id: '20000000-0000-4000-8000-000000000001',
              email: 'workspace@hotelcut.local',
              displayName: '本机运营工作台',
              status: 'active',
            },
            expiresAt: '2999-12-31T23:59:59.000Z',
          },
        }
      : { status: 'checking' },
  );
  const [email, setEmail] = useState(developmentEmail);
  const [password, setPassword] = useState(developmentPassword);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [query, setQuery] = useState('');
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);

  useEffect(() => {
    if (guestMode) {
      return;
    }
    const controller = new AbortController();
    void api
      .getSession(controller.signal)
      .then((session) => {
        setSessionState(session ? { status: 'authenticated', session } : { status: 'anonymous' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoginError(formatLoadError(error));
          setSessionState({ status: 'anonymous' });
        }
      });
    return () => controller.abort();
  }, [api, guestMode]);

  useEffect(() => {
    if (sessionState.status !== 'authenticated') {
      setLoadState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void api
      .loadWorkspace(controller.signal)
      .then((snapshot) => {
        setLoadState({ snapshot, status: 'ready' });
        if (guestMode) {
          setSelectedHotelId((current) => current ?? snapshot.hotels[0]?.id ?? null);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (error instanceof WorkspaceApiError && error.status === 401) {
            if (guestMode) {
              setLoadState({
                message: '免登录模式尚未在 API 服务启用，请检查 GUEST_MODE 配置。',
                status: 'error',
              });
              return;
            }
            setLoginError('登录已过期，请重新登录');
            setSessionState({ status: 'anonymous' });
            return;
          }
          setLoadState({ message: formatLoadError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, guestMode, sessionState]);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingLogin(true);
    setLoginError(null);
    try {
      const session = await api.login(email, password);
      setSessionState({ status: 'authenticated', session });
    } catch (error) {
      setLoginError(formatLoadError(error));
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const logout = async () => {
    setLoginError(null);
    try {
      await api.logout();
      setSessionState({ status: 'anonymous' });
      setQuery('');
      setSelectedHotelId(null);
    } catch (error) {
      setLoginError(formatLoadError(error));
    }
  };

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

  const updateWorkspaceHotel = (updatedHotel: Hotel) => {
    setLoadState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        snapshot: {
          ...current.snapshot,
          hotels: current.snapshot.hotels.map((hotel) =>
            hotel.id === updatedHotel.id ? updatedHotel : hotel,
          ),
        },
        status: 'ready',
      };
    });
  };

  if (sessionState.status === 'checking') {
    return (
      <main className="grid min-h-screen place-items-center bg-[#e8eeeb] px-5 py-10 text-[#263138]">
        <p className="text-sm font-semibold text-slate-500">正在检查登录状态…</p>
      </main>
    );
  }

  if (sessionState.status === 'anonymous') {
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
            使用邮箱和密码登录。身份由服务端会话确认，浏览器不再提交或保存用户 ID。
          </p>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black">本地演示账号</p>
            <p className="mt-1 text-xs text-slate-500">{developmentEmail}</p>
            <p className="mt-1 text-xs text-slate-500">{developmentPassword}</p>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              仅在启用开发种子数据时存在；生产环境必须禁用种子数据。
            </p>
          </div>

          <form className="mt-5 space-y-4" onSubmit={(event) => void submitLogin(event)}>
            <label className="block">
              <span className="text-xs font-black text-slate-700">邮箱</span>
              <input
                autoComplete="username"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#d6a76d]"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block">
              <span className="text-xs font-black text-slate-700">密码</span>
              <input
                autoComplete="current-password"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#d6a76d]"
                minLength={10}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {loginError ? (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
                {loginError}
              </p>
            ) : null}
            <button
              className="w-full rounded-2xl bg-[#263138] px-5 py-3.5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#172126] disabled:cursor-wait disabled:opacity-60"
              disabled={isSubmittingLogin}
              type="submit"
            >
              {isSubmittingLogin ? '正在登录…' : '登录工作空间'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (selectedHotel) {
    return (
      <HotelWorkspace
        api={api}
        hotel={selectedHotel}
        onBack={() => setSelectedHotelId(null)}
        onHotelUpdated={updateWorkspaceHotel}
        organizationName={organizationNameById.get(selectedHotel.organizationId) ?? '未命名组织'}
        userEmail={guestMode ? '免登录本机模式' : sessionState.session.user.email}
        {...(guestMode ? {} : { onLogout: () => void logout() })}
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
              {sessionState.session.user.displayName} · 仅显示当前账号拥有成员权限的组织与酒店。
            </p>
          </div>
          {!guestMode ? (
            <button className="editor-secondary-button" onClick={() => void logout()} type="button">
              退出登录
            </button>
          ) : null}
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
