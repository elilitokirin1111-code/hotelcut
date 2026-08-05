import { Clapperboard, FileText, Film, Lightbulb, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import type {
  AiDirectorFeatureFlags,
  CreativeProject,
  CreativeProjectMode,
} from '@hotelcut/schemas';

import type { WorkspaceApi } from './workspace-api';

interface AiDirectorWorkspaceProps {
  api: WorkspaceApi;
  hotelId: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; flags: AiDirectorFeatureFlags; projects: CreativeProject[] }
  | { status: 'error'; message: string };

const entryModes: Array<{
  mode: CreativeProjectMode;
  title: string;
  description: string;
  icon: typeof Lightbulb;
}> = [
  {
    mode: 'idea',
    title: '从一个创意开始',
    description: '把一句想法扩展为脚本、分镜和可执行拍摄清单。',
    icon: Lightbulb,
  },
  {
    mode: 'script',
    title: '从脚本开始',
    description: '校验信息、补强钩子并转换为结构化剪辑蓝图。',
    icon: FileText,
  },
  {
    mode: 'reference',
    title: '模仿参考视频结构',
    description: '学习叙事、节奏和镜头语言，不复制原片内容。',
    icon: Film,
  },
  {
    mode: 'assets',
    title: '从现有素材开始',
    description: '评估素材覆盖率并生成品牌、转化与真人 IP 方向。',
    icon: Clapperboard,
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI 创作工作台加载失败';
}

export function AiDirectorWorkspace({ api, hotelId }: AiDirectorWorkspaceProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [mode, setMode] = useState<CreativeProjectMode>('idea');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void Promise.all([
      api.getAiDirectorFeatures(controller.signal),
      api.listCreativeProjects(hotelId, controller.signal),
    ])
      .then(([flags, projects]) => setLoadState({ flags, projects, status: 'ready' }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({ message: errorMessage(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, hotelId]);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const project = await api.createCreativeProject(hotelId, { mode, title: title.trim() });
      setLoadState((current) =>
        current.status === 'ready'
          ? { ...current, projects: [project, ...current.projects] }
          : current,
      );
      setTitle('');
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  if (loadState.status === 'loading') {
    return (
      <section className="surface-card p-8 text-sm text-slate-500">正在加载 AI 创作能力…</section>
    );
  }
  if (loadState.status === 'error') {
    return (
      <section className="surface-card p-8">
        <h2 className="text-xl font-black">AI 创作暂不可用</h2>
        <p className="mt-3 text-sm text-rose-700">{loadState.message}</p>
      </section>
    );
  }
  if (!loadState.flags.aiDirectorEnabled) {
    return (
      <section className="surface-card p-8">
        <h2 className="text-xl font-black">AI 导演功能未启用</h2>
        <p className="mt-3 text-sm text-slate-500">请启用 AI_DIRECTOR_ENABLED 后重新加载。</p>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-label="AI 创作工作台">
      <header className="surface-card p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a6b3c]">
          AI Director
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">创建专属剪辑方案</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          AI 先生成可版本化的创意、脚本与 EditBlueprint；校验通过后才会交给现有 Compiler
          生成合法时间线。
        </p>
      </header>

      <form className="surface-card p-7" onSubmit={(event) => void createProject(event)}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {entryModes.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                aria-pressed={mode === entry.mode}
                className={`rounded-2xl border p-5 text-left transition ${
                  mode === entry.mode
                    ? 'border-[#d09a59] bg-[#fff8ef] shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                key={entry.mode}
                onClick={() => setMode(entry.mode)}
                type="button"
              >
                <Icon aria-hidden="true" className="text-[#9a6b3c]" size={22} />
                <strong className="mt-4 block text-sm">{entry.title}</strong>
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  {entry.description}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <label className="flex-1">
            <span className="sr-only">创作项目标题</span>
            <input
              aria-label="创作项目标题"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#d09a59]"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：16 秒酒店前台反差视频"
              required
              value={title}
            />
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#263138] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            disabled={creating}
            type="submit"
          >
            <Plus size={16} />
            {creating ? '正在创建…' : '创建 AI 创作项目'}
          </button>
        </div>
        {createError ? <p className="mt-3 text-xs text-rose-700">{createError}</p> : null}
      </form>

      <section className="surface-card p-7">
        <h3 className="text-lg font-black">最近创作项目</h3>
        {loadState.projects.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">尚无 AI 创作项目，请从上方入口开始。</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {loadState.projects.map((project) => (
              <article
                className="rounded-2xl border border-slate-200 bg-white p-5"
                key={project.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{project.title}</strong>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">
                    {project.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">入口：{project.mode}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
