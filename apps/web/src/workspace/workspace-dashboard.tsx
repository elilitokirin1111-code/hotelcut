import type { Asset, Hotel, RenderJob, VideoProject } from '@hotelcut/schemas';
import {
  ArrowRight,
  Boxes,
  Check,
  Clapperboard,
  Film,
  FolderOpen,
  RefreshCw,
  Scissors,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceSection } from './app-shell';
import type { WorkspaceApi } from './workspace-api';

interface DashboardData {
  assets: Asset[];
  projects: VideoProject[];
  renderJobs: RenderJob[];
}

type DashboardState =
  | { status: 'loading' }
  | { data: DashboardData; status: 'ready' }
  | { message: string; status: 'error' };

interface WorkspaceDashboardProps {
  api: WorkspaceApi;
  hasBrandKit: boolean;
  hotel: Hotel;
  onDataChange: (counts: { assets: number; projects: number }) => void;
  onNavigate: (section: WorkspaceSection) => void;
}

const activeRenderStatuses = new Set<RenderJob['status']>([
  'queued',
  'preprocessing',
  'rendering',
  'validating',
]);

const renderStatusLabels: Record<RenderJob['status'], string> = {
  cancelled: '已取消',
  failed: '需处理',
  preprocessing: '预处理中',
  queued: '排队中',
  rendering: '渲染中',
  succeeded: '已完成',
  validating: '质检中',
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return '刚刚更新';
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
  if (elapsedMinutes < 1_440) return `${Math.round(elapsedMinutes / 60)} 小时前`;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : '工作台数据加载失败';
}

export function WorkspaceDashboard({
  api,
  hasBrandKit,
  hotel,
  onDataChange,
  onNavigate,
}: WorkspaceDashboardProps) {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      api.listAssets(hotel.id, controller.signal),
      api.listVideoProjects(hotel.id, controller.signal),
    ])
      .then(async ([assets, projects]) => {
        const jobGroups = await Promise.all(
          projects.slice(0, 8).map(async (project) => {
            try {
              return await api.listRenderJobs(project.id, controller.signal);
            } catch {
              return [];
            }
          }),
        );
        if (controller.signal.aborted) return;
        const data = { assets, projects, renderJobs: jobGroups.flat() };
        setState({ data, status: 'ready' });
        onDataChange({ assets: assets.length, projects: projects.length });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ message: formatError(error), status: 'error' });
      });
    return () => controller.abort();
  }, [api, hotel.id, onDataChange, version]);

  const data = state.status === 'ready' ? state.data : null;
  const readyAssets = data?.assets.filter((asset) => asset.status === 'ready').length ?? 0;
  const activeRenders =
    data?.renderJobs.filter((job) => activeRenderStatuses.has(job.status)).length ?? 0;
  const recentProjects = useMemo(
    () =>
      [...(data?.projects ?? [])]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3),
    [data?.projects],
  );
  const recentJobs = useMemo(
    () =>
      [...(data?.renderJobs ?? [])]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4),
    [data?.renderJobs],
  );
  const readiness = [
    { done: Boolean(hotel.city && hotel.timezone), label: '酒店资料', note: '城市与时区已配置' },
    {
      done: hasBrandKit,
      label: '品牌规范',
      note: hasBrandKit ? 'BrandKit 已保存' : '等待配置品牌信息',
    },
    {
      done: readyAssets > 0,
      label: '素材覆盖',
      note: readyAssets > 0 ? `${readyAssets} 份素材可用于剪辑` : '等待可用素材',
    },
    {
      done: (data?.projects.length ?? 0) > 0,
      label: '创建成片',
      note: (data?.projects.length ?? 0) > 0 ? '已有视频项目' : '可以开始首个项目',
    },
  ];
  const readinessPercent = Math.round(
    (readiness.filter((item) => item.done).length / readiness.length) * 100,
  );

  if (state.status === 'loading') {
    return (
      <section className="dashboard-loading" aria-label="工作台加载状态">
        <span className="loading-orbit" />
        <p>正在汇总酒店生产数据…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="state-card state-card-error">
        <div>
          <strong>工作台数据暂时无法加载</strong>
          <p>{state.message}</p>
        </div>
        <button onClick={() => setVersion((value) => value + 1)} type="button">
          <RefreshCw size={15} />
          重新加载
        </button>
      </section>
    );
  }

  const suggestion =
    readyAssets === 0
      ? {
          action: '上传酒店素材',
          copy: '先上传客房、设施或口播素材，分析完成后即可自动成片。',
          section: 'assets' as const,
          title: '先建立可用素材库',
        }
      : state.data.projects.length === 0
        ? {
            action: '创建首条视频',
            copy: `已有 ${readyAssets} 份素材完成分析，可以进入 AI 成片向导。`,
            section: 'ai-director' as const,
            title: '素材已就绪，开始自动成片',
          }
        : {
            action: '继续创建视频',
            copy: '现有素材与项目均已就绪，可继续创建不同平台和主题的成片。',
            section: 'ai-director' as const,
            title: '继续扩充酒店内容资产',
          };

  return (
    <div className="dashboard-page">
      <div className="page-heading-row dashboard-welcome">
        <div>
          <p className="page-eyebrow">今日工作台</p>
          <h2>{hotel.name}</h2>
          <p>用 AI 创建初剪，在 Studio 精修时间线，然后完成渲染与交付。</p>
        </div>
        <div className="page-heading-actions">
          <button className="button-secondary" onClick={() => onNavigate('assets')} type="button">
            <Upload size={15} />
            上传新素材
          </button>
          <button
            className="button-primary"
            onClick={() => onNavigate('ai-director')}
            type="button"
          >
            <WandSparkles size={15} />
            AI 创建视频
          </button>
        </div>
      </div>

      <section className="dashboard-launchpad" aria-label="快速开始">
        <button
          className="dashboard-launchpad-primary"
          onClick={() => onNavigate('ai-director')}
          type="button"
        >
          <span className="launchpad-icon">
            <WandSparkles size={24} />
          </span>
          <span>
            <small>推荐工作流</small>
            <strong>让 AI 生成剪辑方案</strong>
            <em>从创意、脚本、素材匹配到可编辑时间线</em>
          </span>
          <ArrowRight size={18} />
        </button>
        <button onClick={() => onNavigate('projects')} type="button">
          <span className="launchpad-icon">
            <Scissors size={20} />
          </span>
          <span>
            <strong>打开剪辑工作台</strong>
            <em>继续精修现有项目</em>
          </span>
          <ArrowRight size={16} />
        </button>
        <button onClick={() => onNavigate('assets')} type="button">
          <span className="launchpad-icon">
            <FolderOpen size={20} />
          </span>
          <span>
            <strong>管理酒店素材</strong>
            <em>{readyAssets} 份素材可用于剪辑</em>
          </span>
          <ArrowRight size={16} />
        </button>
      </section>

      <section className="dashboard-metrics" aria-label="酒店内容生产指标">
        <article>
          <span className="metric-icon metric-icon-green">
            <Film size={18} />
          </span>
          <span>
            <small>视频项目</small>
            <strong>{state.data.projects.length}</strong>
          </span>
          <em>真实项目</em>
        </article>
        <article>
          <span className="metric-icon metric-icon-gold">
            <Boxes size={18} />
          </span>
          <span>
            <small>媒体素材</small>
            <strong>{state.data.assets.length}</strong>
          </span>
          <em>{readyAssets} 可用</em>
        </article>
        <article>
          <span className="metric-icon metric-icon-blue">
            <Check size={18} />
          </span>
          <span>
            <small>可用素材</small>
            <strong>{readyAssets}</strong>
          </span>
          <em>
            {state.data.assets.length
              ? `${Math.round((readyAssets / state.data.assets.length) * 100)}%`
              : '0%'}
          </em>
        </article>
        <article>
          <span className="metric-icon metric-icon-rose">
            <Clapperboard size={18} />
          </span>
          <span>
            <small>渲染任务</small>
            <strong>{activeRenders}</strong>
          </span>
          <em>{activeRenders ? '进行中' : '当前空闲'}</em>
        </article>
      </section>

      <div className="dashboard-top-grid">
        <section className="surface-card readiness-card">
          <div className="section-heading">
            <div>
              <h3>本酒店内容准备度</h3>
              <p>完成以下步骤，AI 才能稳定生成可交付成片</p>
            </div>
            <span>{readinessPercent}%</span>
          </div>
          <div className="readiness-steps">
            {readiness.map((item, index) => (
              <article
                className={
                  item.done
                    ? 'is-done'
                    : index === readiness.findIndex((entry) => !entry.done)
                      ? 'is-current'
                      : ''
                }
                key={item.label}
              >
                <span>{item.done ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span>
                <strong>{item.label}</strong>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ai-recommendation-card">
          <p>
            <Sparkles size={13} /> AI CONTENT COPILOT
          </p>
          <h3>{suggestion.title}</h3>
          <span>{suggestion.copy}</span>
          <button onClick={() => onNavigate(suggestion.section)} type="button">
            {suggestion.action}
            <ArrowRight size={14} />
          </button>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="surface-card recent-projects-card">
          <div className="section-heading">
            <div>
              <h3>最近视频项目</h3>
              <p>继续编辑或基于现有项目创建新版本</p>
            </div>
            <button onClick={() => onNavigate('projects')} type="button">
              查看全部项目 <ArrowRight size={13} />
            </button>
          </div>
          {recentProjects.length ? (
            <div className="recent-project-grid">
              {recentProjects.map((project, index) => (
                <button key={project.id} onClick={() => onNavigate('projects')} type="button">
                  <span
                    className={`project-artwork project-artwork-${(index % 3) + 1}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                    <em>{project.status === 'draft' ? '草稿' : project.status}</em>
                  </span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.templateKey} · 修订 {project.currentRevision}
                  </small>
                  <time>{formatUpdatedAt(project.updatedAt)}</time>
                </button>
              ))}
            </div>
          ) : (
            <button
              className="dashboard-empty-action"
              onClick={() => onNavigate('projects')}
              type="button"
            >
              <Film size={22} />
              <span>
                <strong>还没有视频项目</strong>
                <small>使用真实素材创建第一条酒店短视频</small>
              </span>
              <ArrowRight size={16} />
            </button>
          )}
        </section>

        <section className="surface-card render-queue-card">
          <div className="section-heading">
            <div>
              <h3>渲染队列</h3>
              <p>任务状态实时更新</p>
            </div>
            <button onClick={() => onNavigate('renders')} type="button">
              渲染中心
            </button>
          </div>
          {recentJobs.length ? (
            recentJobs.map((job) => (
              <button key={job.id} onClick={() => onNavigate('renders')} type="button">
                <span className="render-queue-thumb">
                  <Clapperboard size={17} />
                </span>
                <span>
                  <strong>{renderStatusLabels[job.status]}</strong>
                  <small>
                    尝试 {job.attempt}/{job.maxAttempts}
                  </small>
                  <i>
                    <b style={{ width: `${job.progressBasisPoints / 100}%` }} />
                  </i>
                </span>
                <em className={`status-pill status-${job.status}`}>
                  {Math.round(job.progressBasisPoints / 100)}%
                </em>
              </button>
            ))
          ) : (
            <div className="queue-empty">
              <Clapperboard size={22} />
              <p>当前没有渲染任务</p>
              <button onClick={() => onNavigate('renders')} type="button">
                查看交付记录
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
