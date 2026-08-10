import {
  ArrowRight,
  Check,
  Clapperboard,
  FileText,
  Film,
  FolderCheck,
  Lightbulb,
  Plus,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type {
  AiDirectorFeatureFlags,
  Asset,
  AssetRequirement,
  CreativeBriefRevision,
  CreativeProject,
  CreativeProjectMode,
  CreativeVideoVersion,
  EditBlueprint,
  ReferenceVideoProfile,
  ScriptPackage,
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

type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6;

const entryModes: Array<{
  mode: CreativeProjectMode;
  title: string;
  description: string;
  icon: typeof Lightbulb;
  primary?: boolean;
}> = [
  {
    mode: 'reference',
    title: '从对标视频开始',
    description: 'AI 解析结构、节奏、字幕和镜头语言，再生成适合本酒店的剪辑思路与脚本。',
    icon: Film,
    primary: true,
  },
  {
    mode: 'idea',
    title: '从创意开始',
    description: '输入一句想法，AI 扩展三套创意方向、完整脚本、分镜和素材需求。',
    icon: Lightbulb,
    primary: true,
  },
  {
    mode: 'script',
    title: '已有脚本',
    description: '粘贴或描述现有脚本，由 AI 补强钩子并转换为可执行剪辑方案。',
    icon: FileText,
  },
  {
    mode: 'assets',
    title: '从已有素材开始',
    description: '先盘点现有镜头覆盖率，再反向生成最适合当前素材的脚本。',
    icon: Clapperboard,
  },
];

const workflowSteps: Array<{
  index: WorkflowStep;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Lightbulb;
}> = [
  {
    index: 1,
    label: '创意或对标解析',
    shortLabel: '策划起点',
    description: '选择对标素材，或直接输入创意',
    icon: Sparkles,
  },
  {
    index: 2,
    label: '剪辑思路与脚本',
    shortLabel: 'AI 脚本',
    description: '确认叙事、分镜、口播与 CTA',
    icon: FileText,
  },
  {
    index: 3,
    label: '选择剪辑素材',
    shortLabel: '选素材',
    description: '逐镜头确认素材并处理缺口',
    icon: Clapperboard,
  },
  {
    index: 4,
    label: 'AI 初剪成片',
    shortLabel: 'AI 成片',
    description: '生成校验蓝图和 A/B/C 时间线',
    icon: WandSparkles,
  },
  {
    index: 5,
    label: '人工微调剪辑',
    shortLabel: '人工精修',
    description: '在 Studio 调整镜头、字幕、音频与特效',
    icon: SlidersHorizontal,
  },
  {
    index: 6,
    label: '保存到剪辑库',
    shortLabel: '剪辑库',
    description: '保存可继续编辑的项目与全部修订',
    icon: FolderCheck,
  },
];

const statusLabels: Record<CreativeProject['status'], string> = {
  blueprint_ready: '蓝图就绪',
  completed: '已入剪辑库',
  draft: '待策划',
  generated: '待精修',
  planning: '策划中',
  script_ready: '脚本就绪',
  waiting_assets: '待选素材',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI 创作工作流加载失败';
}

function inferWorkflowStep(
  project: CreativeProject,
  scripts: ScriptPackage[],
  requirements: AssetRequirement[],
  blueprints: EditBlueprint[],
  versions: CreativeVideoVersion[],
): WorkflowStep {
  if (project.status === 'completed') return 6;
  if (project.selectedVideoProjectId) return 5;
  if (versions.length > 0 || blueprints.length > 0) return 4;
  if (requirements.length > 0 || project.selectedScriptRevisionId) return 3;
  if (scripts.length > 0) return 2;
  return 1;
}

function assetLabel(asset: Asset | undefined): string {
  return asset?.originalFilename ?? '未知素材';
}

export function AiDirectorWorkspace({
  api,
  hotelId,
  onOpenVideoProject,
  onQuickEdit,
}: AiDirectorWorkspaceProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [mode, setMode] = useState<CreativeProjectMode>('reference');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [briefs, setBriefs] = useState<CreativeBriefRevision[]>([]);
  const [scripts, setScripts] = useState<ScriptPackage[]>([]);
  const [referenceAssets, setReferenceAssets] = useState<Asset[]>([]);
  const [productionAssets, setProductionAssets] = useState<Asset[]>([]);
  const [referenceProfiles, setReferenceProfiles] = useState<ReferenceVideoProfile[]>([]);
  const [assetRequirements, setAssetRequirements] = useState<AssetRequirement[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [blueprints, setBlueprints] = useState<EditBlueprint[]>([]);
  const [videoVersions, setVideoVersions] = useState<CreativeVideoVersion[]>([]);
  const [referenceAssetId, setReferenceAssetId] = useState<string | null>(null);
  const [assetVersion, setAssetVersion] = useState(0);
  const [step, setStep] = useState<WorkflowStep>(1);
  const workflowRef = useRef<HTMLElement | null>(null);

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
    const controller = new AbortController();
    setProjectLoading(true);
    setMessage(null);
    void Promise.all([
      api.getCreativeProject(selectedProjectId, controller.signal),
      api.listCreativeBriefRevisions(selectedProjectId, controller.signal),
      api.listScriptPackages(selectedProjectId, controller.signal),
      api.listAssets(hotelId, controller.signal),
      api.listAssetRequirements(selectedProjectId, controller.signal),
      api.listEditBlueprints(selectedProjectId, controller.signal),
      api.listCreativeVideoVersions(selectedProjectId, controller.signal),
      loadState.flags.referenceAnalysisEnabled
        ? api.listReferenceVideoProfiles(selectedProjectId, controller.signal)
        : Promise.resolve([]),
    ])
      .then(
        ([
          project,
          loadedBriefs,
          loadedScripts,
          assets,
          requirements,
          loadedBlueprints,
          versions,
          profiles,
        ]) => {
          const references = assets.filter(
            (asset) =>
              asset.kind === 'video' &&
              asset.status === 'ready' &&
              asset.purpose === 'reference_video',
          );
          const production = assets.filter(
            (asset) =>
              asset.kind === 'video' &&
              asset.status === 'ready' &&
              asset.purpose !== 'reference_video',
          );
          setLoadState((current) =>
            current.status === 'ready'
              ? {
                  ...current,
                  projects: current.projects.map((candidate) =>
                    candidate.id === project.id ? project : candidate,
                  ),
                }
              : current,
          );
          setBriefs(loadedBriefs);
          setScripts(loadedScripts);
          setReferenceAssets(references);
          setProductionAssets(production);
          setReferenceProfiles(profiles);
          setAssetRequirements(requirements);
          setBlueprints(loadedBlueprints);
          setVideoVersions(versions);
          setSelectedScriptId(project.selectedScriptRevisionId);
          setReferenceAssetId((current) =>
            current && production.some((asset) => asset.id === current)
              ? current
              : (production[0]?.id ?? null),
          );
          setStep(
            inferWorkflowStep(project, loadedScripts, requirements, loadedBlueprints, versions),
          );
        },
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setProjectLoading(false);
      });
    return () => controller.abort();
  }, [api, assetVersion, hotelId, loadState.status, selectedProjectId]);

  const selectedProject =
    loadState.status === 'ready'
      ? (loadState.projects.find((project) => project.id === selectedProjectId) ?? null)
      : null;
  const selectedVersion = useMemo(
    () =>
      videoVersions.find(
        (version) => version.videoProjectId === selectedProject?.selectedVideoProjectId,
      ) ?? null,
    [selectedProject?.selectedVideoProjectId, videoVersions],
  );
  const matchedRequiredCount = assetRequirements.filter(
    (requirement) => !requirement.required || requirement.matchedAssetIds.length > 0,
  ).length;
  const materialReady =
    assetRequirements.length > 0 && matchedRequiredCount === assetRequirements.length;
  const highestUnlockedStep = inferWorkflowStep(
    selectedProject ?? ({ status: 'draft' } as CreativeProject),
    scripts,
    assetRequirements,
    blueprints,
    videoVersions,
  );

  const updateProjectState = (project: CreativeProject) => {
    setLoadState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            projects: current.projects.map((candidate) =>
              candidate.id === project.id ? project : candidate,
            ),
          }
        : current,
    );
  };

  const goToStep = (next: WorkflowStep) => {
    setStep(next);
    window.setTimeout(
      () => workflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60,
    );
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const project = await api.createCreativeProject(hotelId, { mode, title: title.trim() });
      setLoadState((current) =>
        current.status === 'ready'
          ? { ...current, projects: [project, ...current.projects] }
          : current,
      );
      setTitle('');
      setIdea('');
      setSelectedProjectId(project.id);
      setStep(1);
      window.setTimeout(
        () => workflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        100,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const generateCreativePlan = async () => {
    if (!selectedProjectId || !idea.trim()) return;
    setBusy(true);
    setMessage(null);
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
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const markAsReference = async (assetId: string) => {
    if (!selectedProject) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.organizeAssets(selectedProject.hotelId, [assetId], { purpose: 'reference_video' });
      setAssetVersion((version) => version + 1);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const analyzeReference = async (assetId: string) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const profile = await api.createReferenceVideoProfile(selectedProjectId, assetId);
      setReferenceProfiles((current) => [profile, ...current]);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const generateReferenceScript = async (profileId: string) => {
    if (!selectedProjectId) return;
    const profile = referenceProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    const asset = referenceAssets.find((candidate) => candidate.id === profile.assetId);
    setBusy(true);
    setMessage(null);
    try {
      const durationSeconds = Math.min(180, Math.max(5, Math.round(profile.durationMs / 1_000)));
      const brief = await api.createCreativeBriefRevision(selectedProjectId, {
        durationSeconds,
        platform: 'douyin',
        rawIdea: `参考《${assetLabel(asset)}》的结构与剪辑语言，为本酒店生成原创内容`,
      });
      const script = await api.generateScript(selectedProjectId, brief.id, {
        referenceProfileId: profileId,
      });
      setBriefs((current) => [brief, ...current]);
      setScripts((current) => [script, ...current]);
      goToStep(2);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const selectScriptAndMatch = async (scriptId: string) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const project = await api.selectScript(selectedProjectId, scriptId);
      const requirements = await api.generateAssetRequirements(selectedProjectId, scriptId);
      updateProjectState(project);
      setSelectedScriptId(scriptId);
      setAssetRequirements(requirements);
      goToStep(3);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const assignRequirement = async (requirementId: string, assetId: string) => {
    if (!selectedProjectId || !assetId) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api.assignAssetRequirement(selectedProjectId, requirementId, assetId);
      setAssetRequirements((current) =>
        current.map((requirement) => (requirement.id === updated.id ? updated : requirement)),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const generateAiMovie = async () => {
    if (!selectedProjectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const blueprint = blueprints[0] ?? (await api.generateEditBlueprint(selectedProjectId));
      if (!blueprints.some((candidate) => candidate.id === blueprint.id)) {
        setBlueprints((current) => [blueprint, ...current]);
      }
      const batch =
        videoVersions.length > 0
          ? { versions: videoVersions }
          : await api.generateVideoVersions(selectedProjectId, { blueprintId: blueprint.id });
      setVideoVersions(batch.versions);
      goToStep(4);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseVersionAndOpenStudio = async (version: CreativeVideoVersion) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const project = await api.selectCreativeVideoVersion(selectedProjectId, version.id);
      updateProjectState(project);
      goToStep(5);
      onOpenVideoProject?.(version.videoProjectId);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveToEditingLibrary = async () => {
    if (!selectedProjectId || !selectedProject?.selectedVideoProjectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const project = await api.updateCreativeProject(selectedProjectId, { status: 'completed' });
      updateProjectState(project);
      goToStep(6);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
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
    <section className="ai-director-page space-y-6" aria-label="AI 创作工作台">
      <header className="ai-director-hero surface-card p-7">
        <div className="ai-director-hero-copy">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a6b3c]">
            AI Production Workflow
          </p>
          <h2 aria-label="创建专属剪辑方案" className="mt-2 text-3xl font-black tracking-[-0.04em]">
            从灵感到精修，一条链路完成
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            对标解析或创意生成 → 剪辑思路与脚本 → 选择素材 → AI 初剪 → Studio 人工微调 →
            保存到剪辑库。 AI 只生成严格校验的 EditBlueprint，Compiler 才会创建可编辑时间线。
          </p>
          {onQuickEdit ? (
            <button
              aria-label="直接开始剪辑（素材自动成片）"
              className="button-secondary mt-5"
              onClick={onQuickEdit}
              type="button"
            >
              已有明确方案，直接进入剪辑
            </button>
          ) : null}
        </div>
        <div className="ai-director-hero-visual" aria-hidden="true">
          <span />
          <span />
          <span />
          <i>AI</i>
        </div>
      </header>

      <section className="workflow-overview surface-card p-5" aria-label="完整制作流程">
        <ol className="workflow-overview-track">
          {workflowSteps.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.index}>
                <span className="workflow-overview-icon">
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{item.shortLabel}</strong>
                  <small>{item.description}</small>
                </div>
                {index < workflowSteps.length - 1 ? (
                  <ArrowRight className="workflow-overview-arrow" size={14} />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <form
        className="ai-entry-panel surface-card p-7"
        onSubmit={(event) => void createProject(event)}
      >
        <div className="ai-entry-heading">
          <div>
            <span>新建工作流</span>
            <h3>选择本次创作的起点</h3>
          </div>
          <p>对标解析和创意生成是两个主要入口；已有脚本与素材也可直接接入同一链路。</p>
        </div>
        <div className="ai-entry-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {entryModes.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                aria-label={
                  entry.mode === 'script'
                    ? '从脚本开始：已有脚本'
                    : entry.mode === 'reference'
                      ? '模仿参考视频结构：从对标视频开始'
                      : undefined
                }
                aria-pressed={mode === entry.mode}
                className={`ai-entry-card rounded-2xl border p-5 text-left transition ${
                  mode === entry.mode
                    ? 'border-[#d09a59] bg-[#fff8ef] shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                } ${entry.primary ? 'ai-entry-card-primary' : ''}`}
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
              placeholder="例如：酒店前台 16 秒反差短片"
              required
              value={title}
            />
          </label>
          <button
            aria-label="创建 AI 创作项目"
            className="button-primary"
            disabled={creating}
            type="submit"
          >
            <Plus size={16} />
            {creating ? '正在创建…' : '创建并进入工作流'}
          </button>
        </div>
      </form>

      <section className="ai-recent-projects surface-card p-7">
        <div className="ai-entry-heading">
          <div>
            <span>进行中的工作</span>
            <h3>继续上次的制作链路</h3>
          </div>
          <p>{loadState.projects.length} 个创作项目</p>
        </div>
        {loadState.projects.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">尚无创作项目，请从上方创建。</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loadState.projects.map((project) => (
              <button
                className={`workflow-project-card ${selectedProjectId === project.id ? 'is-selected' : ''}`}
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                type="button"
              >
                <span>
                  <strong>{project.title}</strong>
                  <small>{entryModes.find((entry) => entry.mode === project.mode)?.title}</small>
                </span>
                <em>{statusLabels[project.status]}</em>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedProjectId ? (
        <section
          aria-label="创作流程向导"
          className="workflow-shell surface-card"
          ref={workflowRef}
        >
          <aside className="workflow-stepper" aria-label="制作步骤">
            <div className="workflow-stepper-heading">
              <span>当前项目</span>
              <strong>{selectedProject?.title ?? '加载中…'}</strong>
            </div>
            <ol>
              {workflowSteps.map((item) => {
                const Icon = item.icon;
                const done =
                  item.index < highestUnlockedStep || selectedProject?.status === 'completed';
                const unlocked = item.index <= highestUnlockedStep;
                return (
                  <li key={item.index}>
                    <button
                      aria-current={step === item.index ? 'step' : undefined}
                      className={`${step === item.index ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                      disabled={!unlocked}
                      onClick={() => goToStep(item.index)}
                      type="button"
                    >
                      <span>{done ? <Check size={15} /> : <Icon size={15} />}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <main className="workflow-stage">
            {message ? (
              <div className="workflow-message" role="alert">
                {message}
              </div>
            ) : null}
            {projectLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">正在恢复项目工作流…</p>
            ) : null}

            {!projectLoading && step === 1 ? (
              <div>
                <div className="workflow-stage-heading">
                  <span>01 / 策划起点</span>
                  <h3>
                    {selectedProject?.mode === 'reference'
                      ? '选择对标视频并让 AI 解析'
                      : '告诉 AI 这条视频要表达什么'}
                  </h3>
                  <p>
                    {selectedProject?.mode === 'reference'
                      ? '参考视频只用于学习结构、节奏和表达方式，不会进入最终成片。'
                      : 'AI 会保留你的事实约束，并生成三套不同力度的创意方向。'}
                  </p>
                </div>
                {selectedProject?.mode === 'reference' ? (
                  <div className="mt-6 space-y-4">
                    <div className="workflow-action-card">
                      <div>
                        <strong>1. 选择对标素材</strong>
                        <p>可从现有素材中设为参考视频，再提交 AI 解析。</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label="选择要设为参考的视频"
                          value={referenceAssetId ?? ''}
                          onChange={(event) => setReferenceAssetId(event.target.value)}
                        >
                          <option value="">选择视频素材</option>
                          {productionAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.originalFilename}
                            </option>
                          ))}
                        </select>
                        <button
                          className="button-secondary"
                          disabled={busy || !referenceAssetId}
                          onClick={() =>
                            void (referenceAssetId ? markAsReference(referenceAssetId) : undefined)
                          }
                          type="button"
                        >
                          设为对标视频
                        </button>
                      </div>
                    </div>
                    <div className="workflow-reference-grid">
                      {referenceAssets.map((asset) => {
                        const profiles = referenceProfiles.filter(
                          (profile) => profile.assetId === asset.id,
                        );
                        return (
                          <article key={asset.id}>
                            <Film size={18} />
                            <strong>{asset.originalFilename}</strong>
                            {profiles.length === 0 ? (
                              <button
                                disabled={busy}
                                onClick={() => void analyzeReference(asset.id)}
                                type="button"
                              >
                                AI 解析结构与节奏
                              </button>
                            ) : (
                              profiles.map((profile) => (
                                <div className="reference-profile" key={profile.id}>
                                  <span>{profile.narrativePattern}</span>
                                  <p>{profile.analysisSummary}</p>
                                  <small>
                                    {profile.shotCount} 个镜头 · 平均{' '}
                                    {Math.round(profile.averageShotDurationMs / 100) / 10}s
                                  </small>
                                  <button
                                    disabled={busy}
                                    onClick={() => void generateReferenceScript(profile.id)}
                                    type="button"
                                  >
                                    生成原创剪辑思路与脚本
                                  </button>
                                </div>
                              ))
                            )}
                          </article>
                        );
                      })}
                    </div>
                    {referenceAssets.length === 0 ? (
                      <div className="workflow-empty">
                        素材库中还没有对标视频。请先从上方选择已有视频并设为对标素材。
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-6">
                    <textarea
                      aria-label="创意输入"
                      className="workflow-idea-input"
                      onChange={(event) => setIdea(event.target.value)}
                      placeholder={
                        selectedProject?.mode === 'script'
                          ? '粘贴现有脚本，并说明希望 AI 如何优化…'
                          : selectedProject?.mode === 'assets'
                            ? '描述现有素材内容和希望生成的视频目标…'
                            : '例如：用 16 秒表现酒店前台从普通接待到超预期服务的反差，结尾引导预订…'
                      }
                      value={idea}
                    />
                    <button
                      className="button-primary mt-3"
                      disabled={busy || !idea.trim()}
                      onClick={() => void generateCreativePlan()}
                      type="button"
                    >
                      <Sparkles size={16} />
                      {busy ? 'AI 正在策划…' : '生成三套创意方向与脚本'}
                    </button>
                    {briefs.some((brief) => brief.createdBy === 'ai') ? (
                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        {briefs
                          .filter((brief) => brief.createdBy === 'ai')
                          .map((brief) => (
                            <article className="creative-direction-card" key={brief.id}>
                              <span>{brief.direction}</span>
                              <strong>{brief.objective}</strong>
                              <p>{brief.tone.join(' · ')}</p>
                            </article>
                          ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {!projectLoading && step === 2 ? (
              <div>
                <div className="workflow-stage-heading">
                  <span>02 / AI 脚本</span>
                  <h3>确认剪辑思路、脚本和分镜</h3>
                  <p>选定后，系统会把每个分镜转换成素材需求，并开始从素材库智能匹配。</p>
                </div>
                <div className="mt-6 space-y-4">
                  {scripts.map((script) => (
                    <article
                      className={`workflow-script-card ${selectedScriptId === script.id ? 'is-selected' : ''}`}
                      key={script.id}
                    >
                      <header>
                        <div>
                          <span>脚本 v{script.revision}</span>
                          <h4>{script.title}</h4>
                        </div>
                        <em>{Math.round(script.totalDurationMs / 1_000)} 秒</em>
                      </header>
                      <p className="hook">前三秒钩子：{script.hook}</p>
                      <p>{script.storySummary}</p>
                      <div className="script-metrics">
                        <span>{script.scenes.length} 个分镜</span>
                        <span>{script.shotList.length} 个镜头需求</span>
                        <span>{script.captions.length} 组字幕</span>
                      </div>
                      <button
                        className="button-primary"
                        disabled={busy || selectedScriptId === script.id}
                        onClick={() => void selectScriptAndMatch(script.id)}
                        type="button"
                      >
                        {selectedScriptId === script.id
                          ? '已选定并完成素材匹配'
                          : '选定脚本，进入素材选择'}
                        <ArrowRight size={15} />
                      </button>
                    </article>
                  ))}
                  {scripts.length === 0 ? (
                    <div className="workflow-empty">
                      尚未生成脚本，请返回第 1 步完成对标解析或创意生成。
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!projectLoading && step === 3 ? (
              <div>
                <div className="workflow-stage-heading">
                  <span>03 / 选择素材</span>
                  <h3>逐镜头确认 AI 要使用的素材</h3>
                  <p>
                    AI 候选来自真实素材分析；你可以接受候选，也可以从全部可用正片素材中手动替换。
                  </p>
                </div>
                <div className="material-progress">
                  <strong>
                    {matchedRequiredCount} / {assetRequirements.length}
                  </strong>
                  <span>个镜头需求已确认</span>
                  <div>
                    <i
                      style={{
                        width: `${assetRequirements.length ? (matchedRequiredCount / assetRequirements.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {assetRequirements.map((requirement, index) => {
                    const selectedAssetId = requirement.matchedAssetIds[0] ?? '';
                    const bestCandidate = requirement.candidateMatches[0];
                    return (
                      <article className="material-requirement" key={requirement.id}>
                        <div className="material-requirement-index">
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        <div className="material-requirement-copy">
                          <strong>{requirement.description}</strong>
                          <p>
                            {requirement.requiredTags.join(' · ') || '无指定标签'} ·{' '}
                            {Math.round(requirement.preferredDurationMs / 100) / 10}s
                          </p>
                          {requirement.filmingInstruction && requirement.status !== 'matched' ? (
                            <small>{requirement.filmingInstruction}</small>
                          ) : null}
                        </div>
                        <div className="material-requirement-picker">
                          <span className={`material-status ${selectedAssetId ? 'is-ready' : ''}`}>
                            {selectedAssetId ? '已确认' : requirement.required ? '必选' : '可选'}
                          </span>
                          <select
                            aria-label={`为${requirement.description}选择素材`}
                            disabled={busy}
                            value={selectedAssetId}
                            onChange={(event) =>
                              void assignRequirement(requirement.id, event.target.value)
                            }
                          >
                            <option value="">选择剪辑素材</option>
                            {productionAssets.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {asset.originalFilename}
                              </option>
                            ))}
                          </select>
                          {bestCandidate ? (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void assignRequirement(requirement.id, bestCandidate.assetId)
                              }
                              type="button"
                            >
                              采用 AI 首选（
                              {Math.round(bestCandidate.scoreBasisPoints / 100)}
                              %）
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {assetRequirements.length === 0 ? (
                  <div className="workflow-empty mt-5">
                    尚未生成素材需求，请先在第 2 步选定脚本。
                  </div>
                ) : null}
                <div className="workflow-stage-cta">
                  <div>
                    <strong>{materialReady ? '素材已全部确认' : '仍有必选镜头未确认'}</strong>
                    <p>
                      {materialReady
                        ? '下一步将生成严格 JSON Schema 校验的蓝图，再编译为三套可编辑时间线。'
                        : '请选择素材，或回素材库补充缺失镜头后再继续。'}
                    </p>
                  </div>
                  <button
                    className="button-primary"
                    disabled={busy || !materialReady || !loadState.flags.dynamicBlueprintEnabled}
                    onClick={() => void generateAiMovie()}
                    type="button"
                  >
                    <WandSparkles size={16} />
                    {busy ? '正在生成初剪…' : '确认素材并 AI 成片'}
                  </button>
                </div>
              </div>
            ) : null}

            {!projectLoading && step === 4 ? (
              <div>
                <div className="workflow-stage-heading">
                  <span>04 / AI 初剪</span>
                  <h3>选择一版作为人工精修底稿</h3>
                  <p>
                    三版都已经是可编辑的真实 VideoProject，不是预览
                    Mock；选择后会登记为该创作项目的主剪辑。
                  </p>
                </div>
                {videoVersions.length === 0 ? (
                  <div className="workflow-empty mt-6">
                    <WandSparkles size={22} />
                    <strong>还没有 AI 初剪版本</strong>
                    <p>返回素材选择，确认所有必选镜头后生成。</p>
                  </div>
                ) : (
                  <div className="video-version-grid mt-6">
                    {videoVersions.map((version) => (
                      <article
                        className={`video-version-card variant-${version.variant.toLowerCase()}`}
                        key={version.id}
                      >
                        <header>
                          <span>版本 {version.variant}</span>
                          <em>
                            {version.variant === 'A'
                              ? '严格脚本'
                              : version.variant === 'B'
                                ? '强 Hook 快节奏'
                                : '卖点与 CTA'}
                          </em>
                        </header>
                        <div className="version-score">
                          <strong>{Math.round(version.scoreBasisPoints / 100)}</strong>
                          <span>综合评分</span>
                        </div>
                        <dl>
                          <div>
                            <dt>钩子</dt>
                            <dd>{Math.round(version.hookScoreBasisPoints / 100)}</dd>
                          </div>
                          <div>
                            <dt>卖点</dt>
                            <dd>{Math.round(version.sellingPointCoverageBasisPoints / 100)}</dd>
                          </div>
                          <div>
                            <dt>节奏</dt>
                            <dd>{Math.round(version.paceScoreBasisPoints / 100)}</dd>
                          </div>
                        </dl>
                        <p>{version.recommendationReason}</p>
                        <button
                          className="button-primary"
                          disabled={busy}
                          onClick={() => void chooseVersionAndOpenStudio(version)}
                          type="button"
                        >
                          选定并进入人工微调
                          <ArrowRight size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {!projectLoading && step === 5 ? (
              <div>
                <div className="workflow-stage-heading">
                  <span>05 / 人工精修</span>
                  <h3>在专业剪辑工作台完成最后调整</h3>
                  <p>
                    Studio
                    支持多轨时间线、分割/裁剪、镜头替换、字幕、音频、转场、关键帧、撤销重做和版本保存。
                  </p>
                </div>
                <div className="studio-handoff mt-6">
                  <div className="studio-handoff-preview">
                    <SlidersHorizontal size={30} />
                    <span>Studio</span>
                    <small>
                      可编辑项目{' '}
                      {selectedVersion?.variant ? `· AI 版本 ${selectedVersion.variant}` : ''}
                    </small>
                  </div>
                  <div className="studio-handoff-copy">
                    <strong>所有人工调整都保存为项目修订</strong>
                    <p>
                      进入 Studio 微调后点击保存。返回本工作流时，再确认归档到剪辑库；原始 AI
                      版本和每次人工修订都会保留。
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="button-primary"
                        disabled={!selectedProject?.selectedVideoProjectId}
                        onClick={() =>
                          selectedProject?.selectedVideoProjectId &&
                          onOpenVideoProject?.(selectedProject.selectedVideoProjectId)
                        }
                        type="button"
                      >
                        <SlidersHorizontal size={16} />
                        打开 Studio 继续微调
                      </button>
                      <button
                        className="button-secondary"
                        disabled={busy || !selectedProject?.selectedVideoProjectId}
                        onClick={() => void saveToEditingLibrary()}
                        type="button"
                      >
                        <FolderCheck size={16} />
                        已完成微调，保存到剪辑库
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!projectLoading && step === 6 ? (
              <div className="workflow-complete">
                <span>
                  <Check size={34} />
                </span>
                <p>Workflow completed</p>
                <h3>项目已保存到剪辑库</h3>
                <p>
                  AI 原始蓝图、成片底稿和人工修订均已保留。以后可以从「视频项目 /
                  剪辑库」继续编辑、渲染和交付。
                </p>
                <button
                  className="button-primary"
                  disabled={!selectedProject?.selectedVideoProjectId}
                  onClick={() =>
                    selectedProject?.selectedVideoProjectId &&
                    onOpenVideoProject?.(selectedProject.selectedVideoProjectId)
                  }
                  type="button"
                >
                  打开剪辑库项目
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : null}
          </main>
        </section>
      ) : null}
    </section>
  );
}
