import { Clapperboard, FileText, Film, Lightbulb, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type {
  AiDirectorFeatureFlags,
  Asset,
  AssetRequirement,
  CreativeBriefRevision,
  CreativeProject,
  CreativeProjectMode,
  CreativeVideoVersion,
  EditBlueprint,
  ScriptPackage,
  ReferenceVideoProfile,
} from '@hotelcut/schemas';

import type { WorkspaceApi } from './workspace-api';

interface AiDirectorWorkspaceProps {
  api: WorkspaceApi;
  hotelId: string;
  onOpenVideoProject?: (projectId: string) => void;
  onQuickEdit?: () => void;
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

function firstIncompleteStep(
  requirements: AssetRequirement[],
  blueprints: EditBlueprint[],
  versions: CreativeVideoVersion[],
): number {
  if (versions.length === 0) {
    if (blueprints.length === 0) {
      return requirements.length === 0 ? 1 : 4;
    }
    return 5;
  }
  return 6;
}

export function AiDirectorWorkspace({
  api,
  hotelId,
  onOpenVideoProject,
  onQuickEdit,
}: AiDirectorWorkspaceProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [mode, setMode] = useState<CreativeProjectMode>('idea');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [briefs, setBriefs] = useState<CreativeBriefRevision[]>([]);
  const [scripts, setScripts] = useState<ScriptPackage[]>([]);
  const [directing, setDirecting] = useState(false);
  const [referenceAssets, setReferenceAssets] = useState<Asset[]>([]);
  const [productionAssets, setProductionAssets] = useState<Asset[]>([]);
  const [referenceProfiles, setReferenceProfiles] = useState<ReferenceVideoProfile[]>([]);
  const [assetRequirements, setAssetRequirements] = useState<AssetRequirement[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [blueprints, setBlueprints] = useState<EditBlueprint[]>([]);
  const [videoVersions, setVideoVersions] = useState<CreativeVideoVersion[]>([]);
  const [referenceAssetId, setReferenceAssetId] = useState<string | null>(null);
  const [assetVersion, setAssetVersion] = useState(0);
  const [stepIndex, setStepIndex] = useState(1);
  const assistantRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!selectedProjectId || loadState.status !== 'ready') return;
    void Promise.all([
      api.listAssets(hotelId),
      api.listAssetRequirements(selectedProjectId),
      api.listEditBlueprints(selectedProjectId),
      api.listCreativeVideoVersions(selectedProjectId),
      loadState.flags.referenceAnalysisEnabled
        ? api.listReferenceVideoProfiles(selectedProjectId)
        : Promise.resolve([]),
    ])
      .then(([assets, requirements, blueprints, versions, profiles]) => {
        setReferenceAssets(
          assets.filter(
            (asset) =>
              asset.kind === 'video' &&
              asset.status === 'ready' &&
              asset.purpose === 'reference_video',
          ),
        );
        const productionAssets = assets.filter(
          (asset) =>
            asset.kind === 'video' &&
            asset.status === 'ready' &&
            asset.purpose !== 'reference_video',
        );
        setProductionAssets(productionAssets);
        setReferenceAssetId((current) =>
          current && productionAssets.some((asset) => asset.id === current)
            ? current
            : (productionAssets[0]?.id ?? null),
        );
        setAssetRequirements(requirements);
        setBlueprints(blueprints);
        setVideoVersions(versions);
        setReferenceProfiles(profiles);
        setStepIndex(firstIncompleteStep(requirements, blueprints, versions));
      })
      .catch((error: unknown) => setCreateError(errorMessage(error)));
  }, [api, assetVersion, hotelId, loadState, selectedProjectId]);

  const selectedProject =
    loadState.status === 'ready'
      ? (loadState.projects.find((project) => project.id === selectedProjectId) ?? null)
      : null;

  const goToStep = (next: number) => {
    setStepIndex(next);
    window.setTimeout(() => {
      assistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

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
      setSelectedProjectId(project.id);
      setStepIndex(1);
      window.setTimeout(() => {
        assistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const generateCreativePlan = async () => {
    if (!selectedProjectId || !idea.trim()) return;
    setDirecting(true);
    setCreateError(null);
    try {
      const brief = await api.createCreativeBriefRevision(selectedProjectId, {
        durationSeconds: 16,
        platform: 'douyin',
        rawIdea: idea.trim(),
      });
      const directions = await api.expandIdea(selectedProjectId);
      const generatedScript = await api.generateScript(
        selectedProjectId,
        directions[0]?.id ?? brief.id,
      );
      setBriefs([brief, ...directions]);
      setScripts((current) => [generatedScript, ...current]);
      goToStep(2);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const createReferenceProfile = async (assetId: string) => {
    if (!selectedProjectId) return;
    setDirecting(true);
    setCreateError(null);
    try {
      const profile = await api.createReferenceVideoProfile(selectedProjectId, assetId);
      setReferenceProfiles((current) => [profile, ...current]);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const generateReferenceScript = async (profileId: string) => {
    if (!selectedProjectId) return;
    const profile = referenceProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    const asset = referenceAssets.find((item) => item.id === profile.assetId);
    setDirecting(true);
    setCreateError(null);
    try {
      const durationSeconds = Math.min(180, Math.max(5, Math.round(profile.durationMs / 1_000)));
      const brief = await api.createCreativeBriefRevision(selectedProjectId, {
        durationSeconds,
        platform: 'douyin',
        rawIdea: `参考《${asset?.originalFilename ?? '参考视频'}》的剪辑风格制作成片`,
      });
      const script = await api.generateScript(selectedProjectId, brief.id, {
        referenceProfileId: profileId,
      });
      setBriefs([brief]);
      setScripts((current) => [script, ...current]);
      await api.selectScript(selectedProjectId, script.id);
      setSelectedScriptId(script.id);
      setAssetRequirements(await api.generateAssetRequirements(selectedProjectId, script.id));
      goToStep(4);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const selectScriptAndMatch = async (scriptId: string) => {
    if (!selectedProjectId) return;
    setDirecting(true);
    setCreateError(null);
    try {
      await api.selectScript(selectedProjectId, scriptId);
      setSelectedScriptId(scriptId);
      setAssetRequirements(await api.generateAssetRequirements(selectedProjectId, scriptId));
      goToStep(4);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const assignRequirement = async (requirementId: string, assetId: string) => {
    if (!selectedProjectId) return;
    setDirecting(true);
    setCreateError(null);
    try {
      const updated = await api.assignAssetRequirement(selectedProjectId, requirementId, assetId);
      setAssetRequirements((current) =>
        current.map((requirement) => (requirement.id === updated.id ? updated : requirement)),
      );
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const generateBlueprint = async () => {
    if (!selectedProjectId) return;
    setDirecting(true);
    setCreateError(null);
    try {
      const blueprint = await api.generateEditBlueprint(selectedProjectId);
      setBlueprints((current) => [blueprint, ...current]);
      goToStep(5);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const generateVideoVersions = async (blueprintId: string) => {
    if (!selectedProjectId) return;
    setDirecting(true);
    setCreateError(null);
    try {
      const batch = await api.generateVideoVersions(selectedProjectId, { blueprintId });
      setVideoVersions(batch.versions);
      goToStep(6);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const markAsReference = async (assetId: string) => {
    if (!selectedProject) {
      return;
    }
    setDirecting(true);
    setCreateError(null);
    try {
      await api.organizeAssets(selectedProject.hotelId, [assetId], {
        purpose: 'reference_video',
      });
      setAssetVersion((version) => version + 1);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setDirecting(false);
    }
  };

  const creationSteps = [
    { key: 'script', label: '生成创意与脚本', done: briefs.length > 0 || scripts.length > 0 },
    {
      key: 'select',
      label: '选择脚本',
      done: selectedScriptId !== null || assetRequirements.length > 0,
    },
    { key: 'match', label: '素材匹配', done: assetRequirements.length > 0 },
    { key: 'blueprint', label: '生成蓝图', done: blueprints.length > 0 },
    { key: 'versions', label: 'A/B/C 成片', done: videoVersions.length > 0 },
    { key: 'studio', label: 'Studio 精剪', done: videoVersions.length > 0 },
  ];
  const activeStepIndex = creationSteps.findIndex((step) => !step.done);
  const currentStep =
    creationSteps[activeStepIndex === -1 ? creationSteps.length - 1 : activeStepIndex]!;
  const stepHints: Record<string, string> = {
    script: '先在下方输入一句创意，点击「生成三套创意与完整脚本」。',
    select: '在生成的脚本卡片上点击「选为后续蓝图脚本」，系统会同时完成素材匹配。',
    match: '素材匹配已生成，可手动替换候选；确认后点击「生成已校验 EditBlueprint」。',
    blueprint: '蓝图已校验通过，点击「生成 A/B/C 成片」。',
    versions: 'A/B/C 成片已生成，点击「在 Studio 中打开成片」开始精剪。',
    studio: '你可以在 Studio 中修改镜头、字幕和 CTA，然后到渲染中心出片。',
  };
  const canGenerateBlueprint = selectedScriptId !== null || assetRequirements.length > 0;

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
    <section className="ai-director-page space-y-6" aria-label="AI 创作工作台">
      <header className="ai-director-hero surface-card p-7">
        <div className="ai-director-hero-copy">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a6b3c]">
            AI Director
          </p>
          <h2 aria-label="创建专属剪辑方案" className="mt-2 text-3xl font-black tracking-[-0.04em]">
            描述想法，获得可精修的初剪
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            AI 先生成可版本化的创意、脚本与 EditBlueprint；校验通过后才会交给现有 Compiler
            生成合法时间线。
          </p>
          {onQuickEdit ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                aria-label="直接开始剪辑（素材自动成片）"
                className="button-primary"
                onClick={onQuickEdit}
                type="button"
              >
                直接打开剪辑工作台
              </button>
              <span className="text-[10px] text-slate-400">
                已有思路时，可跳过 AI 策划直接自动成片。
              </span>
            </div>
          ) : null}
        </div>
        <div className="ai-director-hero-visual" aria-hidden="true">
          <span />
          <span />
          <span />
          <i>AI</i>
        </div>
      </header>

      <form
        className="ai-entry-panel surface-card p-7"
        onSubmit={(event) => void createProject(event)}
      >
        <div className="ai-entry-heading">
          <div>
            <span>新建创作</span>
            <h3>选择最接近你的起点</h3>
          </div>
          <p>后续所有 AI 结果都会保留版本，可回退并继续人工修改。</p>
        </div>
        <div className="ai-entry-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {entryModes.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                aria-pressed={mode === entry.mode}
                className={`ai-entry-card rounded-2xl border p-5 text-left transition ${
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
        <p className="mt-3 text-[10px] text-slate-400">
          创建项目后会进入下方「创意助手」，自动加载该项目的脚本、素材匹配和成片版本。
        </p>
      </form>

      <section className="ai-recent-projects surface-card p-7">
        <div className="ai-entry-heading">
          <div>
            <span>最近项目</span>
            <h3>继续上次创作</h3>
          </div>
          <p>{loadState.projects.length} 个 AI 创作项目</p>
        </div>
        {loadState.projects.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">尚无 AI 创作项目，请从上方入口开始。</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {loadState.projects.map((project) => (
              <article
                className="rounded-2xl border border-slate-200 bg-white p-5"
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
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

      {selectedProjectId ? (
        <section aria-label="创作流程向导" className="surface-card p-7" ref={assistantRef}>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-black">
              {creationSteps.map((step, index) => (
                <li
                  className={`flex items-center gap-1 ${
                    step.done
                      ? 'text-emerald-700'
                      : index === activeStepIndex
                        ? 'text-[#9a6b3c]'
                        : 'text-slate-400'
                  }`}
                  key={step.key}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${
                      step.done
                        ? 'bg-emerald-600 text-white'
                        : index === activeStepIndex
                          ? 'bg-[#9a6b3c] text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {step.done ? '✓' : index + 1}
                  </span>
                  {step.label}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs font-semibold text-slate-600">
              下一步：{stepHints[currentStep.key] ?? ''}
            </p>
          </div>

          <div style={{ display: stepIndex === 1 ? undefined : 'none' }}>
            <h3 className="mt-6 text-lg font-black">
              {selectedProject?.mode === 'reference'
                ? '第 1 步：参考视频与脚本'
                : '第 1 步：生成脚本'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {selectedProject?.mode === 'reference'
                ? '先选择参考视频生成风格画像，再基于它生成脚本；参考视频不会用于正片选材。'
                : '输入一句创意，AI 会生成三套方向与完整脚本。'}
            </p>
            {selectedProject?.mode === 'reference' ? (
              <div className="mt-4 space-y-3">
                {productionAssets.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="min-w-44 flex-1">
                      <span className="sr-only">选择要设为参考的视频</span>
                      <select
                        aria-label="选择要设为参考的视频"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-[#d09a59]"
                        onChange={(event) => setReferenceAssetId(event.target.value)}
                        value={referenceAssetId ?? ''}
                      >
                        {productionAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.originalFilename}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="rounded-xl bg-[#263138] px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                      disabled={directing || !referenceAssetId}
                      onClick={() =>
                        void (referenceAssetId ? markAsReference(referenceAssetId) : undefined)
                      }
                      type="button"
                    >
                      {directing ? '处理中…' : '设为参考视频'}
                    </button>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                    没有可用的正片素材可设为参考视频，请先到素材库上传并完成分析。
                  </p>
                )}
                {referenceAssets.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                    还没有参考视频。从上方选择一个素材「设为参考视频」。
                  </p>
                ) : (
                  referenceAssets.map((asset) => (
                    <button
                      className="w-full rounded-xl border border-slate-200 p-3 text-left text-xs hover:border-[#d09a59]"
                      disabled={directing}
                      key={asset.id}
                      onClick={() => void createReferenceProfile(asset.id)}
                      type="button"
                    >
                      分析参考：{asset.originalFilename}
                    </button>
                  ))
                )}
                {referenceProfiles.map((profile) => (
                  <article className="rounded-xl bg-slate-50 p-4 text-xs" key={profile.id}>
                    <strong>{profile.narrativePattern}</strong>
                    <p className="mt-1">
                      {profile.shotCount} 镜头 · 平均 {profile.averageShotDurationMs}ms ·{' '}
                      {profile.reusableStyleRules.join('；')}
                    </p>
                    <button
                      className="mt-3 rounded-lg bg-[#263138] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                      disabled={directing}
                      onClick={() => void generateReferenceScript(profile.id)}
                      type="button"
                    >
                      {directing ? '正在生成脚本…' : '基于该参考生成脚本'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <>
                <textarea
                  aria-label="创意输入"
                  className="mt-4 min-h-28 w-full rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-[#d09a59]"
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="例如：制作一条 16 秒的酒店前台反差视频…"
                  value={idea}
                />
                <button
                  className="mt-3 rounded-xl bg-[#9a6b3c] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                  disabled={directing || !idea.trim()}
                  onClick={() => void generateCreativePlan()}
                  type="button"
                >
                  {directing ? '正在生成三套方向和脚本…' : '生成三套创意与完整脚本'}
                </button>
                {briefs.length > 0 ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {briefs
                      .filter((brief) => brief.createdBy === 'ai')
                      .map((brief) => (
                        <article className="rounded-xl border border-slate-200 p-4" key={brief.id}>
                          <p className="text-xs font-black text-[#9a6b3c]">{brief.direction}</p>
                          <strong className="mt-2 block text-sm">{brief.objective}</strong>
                          <p className="mt-2 text-xs text-slate-500">{brief.tone.join(' · ')}</p>
                        </article>
                      ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div style={{ display: stepIndex === 2 ? undefined : 'none' }}>
            <h3 className="mt-6 text-lg font-black">第 2 步：选择脚本</h3>
            <p className="mt-2 text-sm text-slate-500">
              从生成的脚本里选一个作为成片蓝图的基础；选择后会同时完成素材匹配。
            </p>
            {scripts.map((script) => (
              <article className="mt-5 rounded-xl border border-slate-200 p-5" key={script.id}>
                <div className="flex items-center justify-between gap-3">
                  <strong>{script.title}</strong>
                  <button
                    className="text-xs font-black text-[#9a6b3c]"
                    disabled={directing}
                    onClick={() => void selectScriptAndMatch(script.id)}
                    type="button"
                  >
                    选为后续蓝图脚本
                  </button>
                </div>
                <p className="mt-2 text-sm">钩子：{script.hook}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {script.scenes.length} 个分镜 · {script.shotList.length} 条拍摄要求 ·{' '}
                  {Math.round(script.totalDurationMs / 1_000)} 秒
                </p>
              </article>
            ))}
            {scripts.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
                还没有脚本，请先完成第 1 步。
              </p>
            ) : null}
          </div>

          <div
            className="mt-6 border-t border-slate-200 pt-6"
            style={{ display: stepIndex === 3 ? undefined : 'none' }}
          >
            <h4 className="font-black">第 3 步：素材匹配与补拍清单</h4>
            <p className="mt-2 text-xs text-slate-500">
              每条拍摄需求会基于已有视频片段的标签、画面说明与质量分析给出前三个候选；你可以手动确认。
            </p>
            {assetRequirements.map((requirement) => (
              <article
                className="mt-3 rounded-xl border border-slate-200 p-4 text-xs"
                key={requirement.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <strong>{requirement.description}</strong>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-black text-slate-600">
                    {requirement.status === 'matched'
                      ? '已匹配'
                      : requirement.status === 'weak_match'
                        ? '弱匹配'
                        : '缺失'}
                  </span>
                </div>
                <p className="mt-2 text-slate-500">
                  {requirement.candidateMatches.length > 0
                    ? `候选：${requirement.candidateMatches
                        .map(
                          (candidate) => `${candidate.reasons[0]}（${candidate.scoreBasisPoints}）`,
                        )
                        .join('；')}`
                    : '没有可用候选素材。'}
                </p>
                {requirement.filmingInstruction ? (
                  <p className="mt-2 text-[#9a6b3c]">{requirement.filmingInstruction}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {requirement.candidateMatches.map((candidate) => (
                    <button
                      className="rounded-lg border border-slate-200 px-2 py-1 hover:border-[#d09a59]"
                      disabled={directing}
                      key={`${candidate.assetId}-${candidate.segmentId ?? 'asset'}`}
                      onClick={() => void assignRequirement(requirement.id, candidate.assetId)}
                      type="button"
                    >
                      采用候选素材
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {loadState.flags.dynamicBlueprintEnabled ? (
            <div
              className="mt-6 border-t border-slate-200 pt-6"
              style={{ display: stepIndex === 4 || stepIndex === 5 ? undefined : 'none' }}
            >
              <h4 className="font-black">
                {stepIndex === 4 ? '第 4 步：生成剪辑蓝图' : '第 5 步：A/B/C 成片'}
              </h4>
              <p className="mt-2 text-xs text-slate-500">
                蓝图先经过时长、镜头和素材边界校验，再编译为可在 Studio 继续修改的时间线。
              </p>
              {canGenerateBlueprint ? (
                <button
                  className="mt-3 rounded-xl bg-[#263138] px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                  disabled={directing}
                  onClick={() => void generateBlueprint()}
                  type="button"
                >
                  {directing ? '正在生成…' : '生成已校验 EditBlueprint'}
                </button>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                  请先完成上一步：在脚本卡片上点击「选为后续蓝图脚本」，生成素材匹配后才能生成剪辑蓝图。
                </p>
              )}
              {blueprints.map((blueprint) => (
                <article
                  className="mt-3 rounded-xl border border-slate-200 p-4 text-xs"
                  key={blueprint.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong>
                      蓝图 v{blueprint.revision} · {blueprint.beats.length} 个节拍
                    </strong>
                    <button
                      className="rounded-lg bg-[#9a6b3c] px-3 py-2 font-black text-white disabled:opacity-60"
                      disabled={directing || videoVersions.length > 0}
                      onClick={() => void generateVideoVersions(blueprint.id)}
                      type="button"
                    >
                      生成 A/B/C 成片
                    </button>
                  </div>
                  <p className="mt-2 text-slate-500">
                    {blueprint.style.pace} · {JSON.stringify(blueprint.captionStyle)} · 种子{' '}
                    {blueprint.seed}
                  </p>
                </article>
              ))}
              {videoVersions.length > 0 ? (
                <div style={{ display: stepIndex === 5 ? undefined : 'none' }}>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {videoVersions.map((version) => (
                      <article className="rounded-xl bg-slate-50 p-4 text-xs" key={version.id}>
                        <strong>
                          版本 {version.variant}
                          {version.variant === 'A'
                            ? ' · 严格脚本'
                            : version.variant === 'B'
                              ? ' · 快节奏 Hook'
                              : ' · 转化 CTA'}
                        </strong>
                        <p className="mt-2">
                          综合 {version.scoreBasisPoints} · 钩子 {version.hookScoreBasisPoints}
                        </p>
                        <p className="mt-1">
                          卖点 {version.sellingPointCoverageBasisPoints} · 节奏{' '}
                          {version.paceScoreBasisPoints}
                        </p>
                        <p className="mt-2 text-slate-500">{version.recommendationReason}</p>
                        {onOpenVideoProject ? (
                          <button
                            className="mt-2 rounded-lg bg-[#9a6b3c] px-3 py-2 text-xs font-black text-white"
                            onClick={() => onOpenVideoProject(version.videoProjectId)}
                            type="button"
                          >
                            在 Studio 中打开成片
                          </button>
                        ) : (
                          <p className="mt-2 font-black text-[#9a6b3c]">
                            已生成可编辑项目：{version.videoProjectId}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-black text-[#9a6b3c]">
                    A/B/C 成片已生成，点击卡片上的「在 Studio 中打开成片」进入精剪。
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
            style={{ display: stepIndex === 6 ? undefined : 'none' }}
          >
            <p className="text-sm font-black text-emerald-800">A/B/C 成片已生成</p>
            <p className="mt-1 text-xs leading-5 text-emerald-700">
              下一步：在 Studio 中精剪（镜头、字幕、CTA），然后到渲染中心提交出片。
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5">
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-40"
              disabled={stepIndex <= 1}
              onClick={() => goToStep(stepIndex - 1)}
              type="button"
            >
              上一步
            </button>
            {stepIndex < 6 ? (
              <button
                className="rounded-xl bg-[#263138] px-5 py-2 text-xs font-black text-white disabled:opacity-40"
                disabled={!creationSteps[stepIndex - 1]?.done}
                onClick={() => goToStep(stepIndex + 1)}
                type="button"
              >
                下一步
              </button>
            ) : onOpenVideoProject && videoVersions[0] ? (
              <button
                className="rounded-xl bg-[#9a6b3c] px-5 py-2 text-xs font-black text-white"
                onClick={() => onOpenVideoProject(videoVersions[0]!.videoProjectId)}
                type="button"
              >
                在 Studio 中打开成片
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
