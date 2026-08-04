import type {
  Asset,
  CreateVideoBriefInput,
  GeneratedVideoProject,
  ProjectGenerationSummary,
  ProjectTemplate,
  VideoBrief,
  VideoProject,
  VideoProjectDetail,
} from '@hotelcut/schemas';
import { hotelVideoProjectV1Schema, type HotelVideoProjectV1 } from '@hotelcut/timeline';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ProjectStudio } from '../App';
import type { DemoArtwork, EditorAsset } from '../editor/demo-data';
import { StudioPreview } from '../editor/studio-preview';
import type { WorkspaceApi } from './workspace-api';

interface AutomaticEditWorkflowProps {
  api: WorkspaceApi;
  hotelId: string;
}

interface WorkflowData {
  assets: Asset[];
  projects: VideoProject[];
  templates: ProjectTemplate[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: WorkflowData }
  | { status: 'error'; message: string };

type CreateState =
  | { status: 'idle' }
  | { status: 'saving-brief' }
  | { status: 'compiling' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

interface BriefDraft {
  callToAction: string;
  durationSeconds: number;
  objective: string;
  platform: CreateVideoBriefInput['platform'];
  targetAudience: string;
  title: string;
  tone: string;
}

const initialBriefDraft: BriefDraft = {
  callToAction: '',
  durationSeconds: 20,
  objective: '',
  platform: 'douyin',
  targetAudience: '',
  title: '',
  tone: '温暖高级',
};

const preferredDurations: Record<string, number> = {
  'hotel.host-broll': 30,
  'hotel.promotion': 20,
  'hotel.room-montage': 25,
};

const tagLabels: Record<string, string> = {
  bathroom: '卫浴',
  booking: '预订结尾',
  detail: '细节',
  exterior: '酒店外观',
  facility: '酒店设施',
  lobby: '大堂',
  promotion: '活动优惠',
  room: '客房',
  service: '服务',
  welcome: '欢迎开场',
};

const slotLabels: Record<string, string> = {
  'promo.exterior': '酒店外观',
  'promo.offer': '活动优惠',
  'promo.room': '客房',
  'promo.service': '服务',
  'room.bathroom': '卫浴',
  'room.detail': '客房细节',
  'room.exterior': '酒店外观',
  'room.facility': '酒店设施',
  'room.hero': '客房主画面',
};

interface GenerationGuidance {
  action: string;
  title: string;
}

function generationGuidance(
  warning: ProjectGenerationSummary['warnings'][number],
): GenerationGuidance {
  if (warning.code === 'BACKGROUND_MUSIC_MISSING') {
    return warning.severity === 'info'
      ? {
          title: '已启用原视频环境声',
          action: '系统会用低音量环境声铺满成片；请在渲染中心核对音频质检结果。',
        }
      : {
          title: '缺少可用音频',
          action: '请至少上传一段带连续声音的视频素材，再重新生成项目。',
        };
  }
  if (warning.code === 'SLOT_REQUIREMENT_UNMET') {
    const slotId = warning.path?.replace(/^slots\./, '') ?? '';
    const label = (slotLabels[slotId] ?? slotId) || '对应画面';
    return {
      title: `缺少${label}素材`,
      action: `请在素材库为一段可用视频添加“${label}”标签后重新生成。`,
    };
  }
  if (warning.code === 'CAPTION_SOURCE_MISSING') {
    return {
      title: '口播字幕来源缺失',
      action: '请确认口播视频分析成功并生成转写文本，然后重新生成。',
    };
  }
  if (warning.code === 'CTA_NOT_CONFIGURED') {
    return {
      title: '缺少行动引导',
      action: '补充经过确认的行动引导文案，避免系统自动编造联系方式或价格。',
    };
  }
  if (warning.code.startsWith('LOCKED_')) {
    return {
      title: '锁定片段需要处理',
      action: '在 Studio 中解除失效片段的锁定，或替换为当前可用素材。',
    };
  }
  return {
    title: '生成项目需要检查',
    action: warning.message,
  };
}

const productionArtwork: readonly DemoArtwork[] = [
  'room',
  'lake',
  'lobby',
  'breakfast',
  'suite',
  'spa',
  'host',
];

const productionColors: ReadonlyArray<readonly [string, string]> = [
  ['#78624f', '#263138'],
  ['#5f7d82', '#24343c'],
  ['#a27654', '#3d312a'],
  ['#b68a58', '#5e4731'],
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function assetDurationFrames(asset: Asset): number {
  const probe = asRecord(asset.metadata['probe']);
  const durationMs =
    numberValue(asset.metadata['durationMs']) ?? numberValue(probe['durationMs']) ?? 0;
  const frameRate =
    numberValue(asset.metadata['frameRate']) ?? numberValue(probe['frameRate']) ?? 30;
  return Math.max(1, Math.round((durationMs / 1_000) * frameRate));
}

function productionEditorAsset(asset: Asset, index: number): EditorAsset | null {
  if (asset.status !== 'ready' || !['audio', 'image', 'logo', 'video'].includes(asset.kind)) {
    return null;
  }
  const durationFrames = assetDurationFrames(asset);
  const durationSeconds = Math.max(1, Math.round(durationFrames / 30));
  const editorKind = asset.kind === 'logo' ? 'image' : asset.kind;
  return {
    artwork: productionArtwork[index % productionArtwork.length] ?? 'room',
    colors: productionColors[index % productionColors.length] ?? ['#78624f', '#263138'],
    detail: `${asset.kind === 'audio' ? '音频' : editorKind === 'image' ? '图片' : '视频'} · ${durationSeconds} 秒`,
    durationFrames,
    id: asset.id,
    kind: editorKind as EditorAsset['kind'],
    name: asset.originalFilename,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : '自动剪辑请求失败';
}

function projectDocument(detail: VideoProjectDetail): HotelVideoProjectV1 | null {
  const parsed = hotelVideoProjectV1Schema.safeParse(detail.currentRevision.projectDocument);
  return parsed.success ? parsed.data : null;
}

function durationFor(template: ProjectTemplate): number {
  return Math.min(
    template.maxDurationSeconds,
    Math.max(template.minDurationSeconds, preferredDurations[template.key] ?? 20),
  );
}

function statusLabel(status: VideoProject['status']): string {
  const labels: Record<VideoProject['status'], string> = {
    archived: '已归档',
    completed: '已完成',
    draft: '草稿',
    rendering: '渲染中',
  };
  return labels[status];
}

export function AutomaticEditWorkflow({ api, hotelId }: AutomaticEditWorkflowProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [loadVersion, setLoadVersion] = useState(0);
  const [templateKey, setTemplateKey] = useState('');
  const [briefDraft, setBriefDraft] = useState<BriefDraft>(initialBriefDraft);
  const [createState, setCreateState] = useState<CreateState>({ status: 'idle' });
  const [pendingBrief, setPendingBrief] = useState<VideoBrief | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<VideoProjectDetail | null>(null);
  const [generation, setGeneration] = useState<ProjectGenerationSummary | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSessionVersion, setStudioSessionVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void Promise.all([
      api.listProjectTemplates(controller.signal),
      api.listVideoProjects(hotelId, controller.signal),
      api.listAssets(hotelId, controller.signal),
    ])
      .then(([templates, projects, assets]) => {
        setLoadState({ data: { assets, projects, templates }, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({ message: formatError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, hotelId, loadVersion]);

  useEffect(() => {
    if (loadState.status !== 'ready' || templateKey) {
      return;
    }
    const firstTemplate = loadState.data.templates[0];
    if (!firstTemplate) {
      return;
    }
    setTemplateKey(firstTemplate.key);
    setBriefDraft((draft) => ({
      ...draft,
      durationSeconds: durationFor(firstTemplate),
    }));
  }, [loadState, templateKey]);

  const selectedTemplate =
    loadState.status === 'ready'
      ? (loadState.data.templates.find((template) => template.key === templateKey) ?? null)
      : null;
  const readyAssets = useMemo(
    () =>
      loadState.status === 'ready'
        ? loadState.data.assets.filter((asset) => asset.status === 'ready')
        : [],
    [loadState],
  );
  const studioAssets = useMemo(
    () =>
      readyAssets.flatMap((asset, index) => {
        const mapped = productionEditorAsset(asset, index);
        return mapped ? [mapped] : [];
      }),
    [readyAssets],
  );
  const previewProject = useMemo(
    () => (selectedDetail ? projectDocument(selectedDetail) : null),
    [selectedDetail],
  );

  useEffect(() => {
    if (!isPlaying || !previewProject) {
      return;
    }
    const interval = window.setInterval(() => {
      setCurrentFrame((frame) => {
        const next = frame + Math.max(1, Math.round(previewProject.output.frameRate / 10));
        return next >= previewProject.output.durationFrames ? 0 : next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [isPlaying, previewProject]);

  const previewStats = useMemo(() => {
    if (!previewProject) {
      return null;
    }
    return {
      clipCount: previewProject.tracks.reduce((count, track) => count + track.clips.length, 0),
      durationSeconds: Math.round(
        previewProject.output.durationFrames / previewProject.output.frameRate,
      ),
      trackCount: previewProject.tracks.length,
    };
  }, [previewProject]);

  const compileBrief = async (brief: VideoBrief) => {
    setCreateState({ status: 'compiling' });
    try {
      const result: GeneratedVideoProject = await api.generateVideoProject(hotelId, {
        templateKey,
        videoBriefId: brief.id,
      });
      setPendingBrief(null);
      setGeneration(result.generation);
      setSelectedDetail(result.detail);
      setCurrentFrame(0);
      setIsPlaying(false);
      setLoadState((state) =>
        state.status === 'ready'
          ? {
              data: {
                ...state.data,
                projects: [
                  result.detail.project,
                  ...state.data.projects.filter(
                    (project) => project.id !== result.detail.project.id,
                  ),
                ],
              },
              status: 'ready',
            }
          : state,
      );
      setCreateState({
        message: `自动剪辑已保存为项目修订 ${result.detail.currentRevision.revision}`,
        status: 'success',
      });
    } catch (error) {
      setPendingBrief(brief);
      setCreateState({
        message: `需求单已保存，但自动剪辑未完成：${formatError(error)}`,
        status: 'error',
      });
    }
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTemplate) {
      setCreateState({ message: '请选择自动剪辑模板', status: 'error' });
      return;
    }
    setCreateState({ status: 'saving-brief' });
    try {
      const brief = await api.createVideoBrief(hotelId, {
        aspectRatio: '9:16',
        callToAction: briefDraft.callToAction.trim() || null,
        durationSeconds: briefDraft.durationSeconds,
        language: 'zh-CN',
        objective: briefDraft.objective.trim() || null,
        platform: briefDraft.platform,
        targetAudience: briefDraft.targetAudience.trim() || null,
        title: briefDraft.title.trim(),
        tone: briefDraft.tone.trim(),
      });
      await compileBrief(brief);
    } catch (error) {
      setCreateState({ message: formatError(error), status: 'error' });
    }
  };

  const openProject = async (projectId: string, openStudio = false) => {
    setCreateState({ status: 'idle' });
    setGeneration(null);
    try {
      const detail = await api.getVideoProject(projectId);
      setSelectedDetail(detail);
      setCurrentFrame(0);
      setIsPlaying(false);
      setStudioOpen(openStudio);
    } catch (error) {
      setCreateState({ message: formatError(error), status: 'error' });
    }
  };

  const saveStudioRevision = async (
    project: HotelVideoProjectV1,
    baseRevision: number,
  ): Promise<number> => {
    if (!selectedDetail) {
      throw new Error('没有可保存的项目');
    }
    const detail = await api.saveProjectRevision(selectedDetail.project.id, {
      baseRevision,
      projectDocument: project,
    });
    setSelectedDetail(detail);
    setLoadState((state) =>
      state.status === 'ready'
        ? {
            data: {
              ...state.data,
              projects: state.data.projects.map((candidate) =>
                candidate.id === detail.project.id ? detail.project : candidate,
              ),
            },
            status: 'ready',
          }
        : state,
    );
    return detail.currentRevision.revision;
  };

  const reloadStudioRevision = async () => {
    if (!selectedDetail) {
      return;
    }
    const detail = await api.getVideoProject(selectedDetail.project.id);
    setSelectedDetail(detail);
    setStudioSessionVersion((version) => version + 1);
    setCreateState({
      message: `已加载服务器修订 ${detail.currentRevision.revision}`,
      status: 'success',
    });
  };

  if (loadState.status === 'loading') {
    return (
      <section className="mt-5 rounded-[28px] bg-white/75 p-8">
        <p className="text-sm font-semibold text-slate-500">正在加载自动剪辑工作流…</p>
      </section>
    );
  }

  if (loadState.status === 'error') {
    return (
      <section className="mt-5 rounded-[28px] border border-rose-200 bg-rose-50 p-8">
        <p className="text-sm font-black text-rose-800">自动剪辑工作流加载失败</p>
        <p className="mt-2 text-xs text-rose-700">{loadState.message}</p>
        <button
          className="editor-secondary-button mt-4"
          onClick={() => setLoadVersion((version) => version + 1)}
          type="button"
        >
          重新加载
        </button>
      </section>
    );
  }

  if (studioOpen && previewProject && selectedDetail) {
    return (
      <ProjectStudio
        assets={studioAssets}
        embedded
        initialProject={previewProject}
        initialRevision={selectedDetail.currentRevision.revision}
        key={`${selectedDetail.project.id}-${studioSessionVersion}`}
        onClose={() => setStudioOpen(false)}
        onReload={reloadStudioRevision}
        onSaveRevision={saveStudioRevision}
      />
    );
  }

  return (
    <section aria-label="自动剪辑工作流" className="automatic-workflow-page">
      <div className="page-heading-row">
        <div>
          <p className="page-eyebrow">AI COMPILATION WORKFLOW</p>
          <h2>创建自动剪辑项目</h2>
          <p>
            填写用途和时长，选择模板后，系统会从已分析素材中按标签、画质和镜头时长自动编排，
            并将结果保存为可继续编辑的修订。
          </p>
        </div>
        <div className="workflow-ready-count">
          <p className="text-[10px] font-black text-[#3f7c73]">可用生产素材</p>
          <p className="mt-1 text-xl font-black text-[#263138]">{readyAssets.length}</p>
        </div>
      </div>

      <div className="workflow-stepper surface-card" aria-label="自动成片进度">
        {['视频简报', '选择模板', '素材复核', '生成项目'].map((label, index) => {
          const currentStep = generation ? 4 : createState.status === 'compiling' ? 3 : 2;
          return (
            <span
              className={
                index + 1 < currentStep ? 'is-done' : index + 1 === currentStep ? 'is-active' : ''
              }
              key={label}
            >
              <i>{index + 1 < currentStep ? '✓' : String(index + 1).padStart(2, '0')}</i>
              {label}
            </span>
          );
        })}
      </div>

      <div className="automatic-wizard-grid">
        <form className="wizard-form-grid" onSubmit={(event) => void createProject(event)}>
          <fieldset className="wizard-pane wizard-template-pane surface-card">
            <legend className="text-sm font-black text-[#263138]">2. 选择剪辑模板</legend>
            <p className="wizard-pane-description">模板决定角色节奏、素材槽位与最终时长范围。</p>
            <div className="workflow-template-grid">
              {loadState.data.templates.map((template) => {
                const selected = template.key === templateKey;
                return (
                  <label
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      selected
                        ? 'border-[#c99258] bg-[#fff7ed]'
                        : 'border-slate-200 bg-white/80 hover:border-[#d9b489]'
                    }`}
                    key={template.key}
                  >
                    <input
                      checked={selected}
                      className="sr-only"
                      name="template"
                      onChange={() => {
                        setTemplateKey(template.key);
                        setBriefDraft((draft) => ({
                          ...draft,
                          durationSeconds: durationFor(template),
                        }));
                      }}
                      type="radio"
                      value={template.key}
                    />
                    <span className="text-xs font-black text-[#263138]">{template.name}</span>
                    <span className="mt-2 block text-[10px] leading-4 text-slate-500">
                      {template.description}
                    </span>
                    <span className="mt-3 block text-[9px] font-bold text-[#9a6b3c]">
                      {template.minDurationSeconds}–{template.maxDurationSeconds} 秒
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedTemplate ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[10px] font-bold text-slate-400">建议素材标签：</span>
                {selectedTemplate.requiredTags.map((tag) => (
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600"
                    key={tag}
                  >
                    {tagLabels[tag] ?? tag}
                  </span>
                ))}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="wizard-pane wizard-brief-pane surface-card">
            <legend className="text-sm font-black text-[#263138]">1. 填写视频需求单</legend>
            <p className="wizard-pane-description">AI 只使用已验证的酒店资料与明确输入生成文案。</p>
            <div className="wizard-brief-fields">
              <label className="editor-field md:col-span-2">
                <span>项目标题</span>
                <input
                  maxLength={160}
                  onChange={(event) =>
                    setBriefDraft((draft) => ({ ...draft, title: event.target.value }))
                  }
                  placeholder="例如：湖景客房周末体验"
                  required
                  value={briefDraft.title}
                />
              </label>
              <label className="editor-field">
                <span>发布平台</span>
                <select
                  onChange={(event) =>
                    setBriefDraft((draft) => ({
                      ...draft,
                      platform: event.target.value as BriefDraft['platform'],
                    }))
                  }
                  value={briefDraft.platform}
                >
                  <option value="douyin">抖音</option>
                  <option value="xiaohongshu">小红书</option>
                  <option value="wechat_channels">视频号</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label className="editor-field">
                <span>成片时长（秒）</span>
                <input
                  max={selectedTemplate?.maxDurationSeconds ?? 180}
                  min={selectedTemplate?.minDurationSeconds ?? 5}
                  onChange={(event) =>
                    setBriefDraft((draft) => ({
                      ...draft,
                      durationSeconds: Number(event.target.value),
                    }))
                  }
                  required
                  type="number"
                  value={briefDraft.durationSeconds}
                />
              </label>
              <label className="editor-field">
                <span>画面调性</span>
                <input
                  maxLength={80}
                  onChange={(event) =>
                    setBriefDraft((draft) => ({ ...draft, tone: event.target.value }))
                  }
                  required
                  value={briefDraft.tone}
                />
              </label>
              <label className="editor-field">
                <span>目标客群</span>
                <input
                  maxLength={200}
                  onChange={(event) =>
                    setBriefDraft((draft) => ({
                      ...draft,
                      targetAudience: event.target.value,
                    }))
                  }
                  placeholder="例如：周末亲子客群"
                  value={briefDraft.targetAudience}
                />
              </label>
              <label className="editor-field md:col-span-2">
                <span>传播目标</span>
                <textarea
                  maxLength={300}
                  onChange={(event) =>
                    setBriefDraft((draft) => ({ ...draft, objective: event.target.value }))
                  }
                  placeholder="例如：突出湖景房与早餐，提升周末咨询"
                  rows={2}
                  value={briefDraft.objective}
                />
              </label>
              <label className="editor-field md:col-span-2">
                <span>行动引导（仅使用已确认文案）</span>
                <input
                  maxLength={200}
                  onChange={(event) =>
                    setBriefDraft((draft) => ({ ...draft, callToAction: event.target.value }))
                  }
                  placeholder="例如：联系酒店了解周末房态"
                  value={briefDraft.callToAction}
                />
              </label>
            </div>
          </fieldset>

          <div className="wizard-actions surface-card">
            <button
              className="editor-primary-button"
              disabled={
                readyAssets.length === 0 ||
                createState.status === 'saving-brief' ||
                createState.status === 'compiling'
              }
              type="submit"
            >
              {createState.status === 'saving-brief'
                ? '正在保存需求单…'
                : createState.status === 'compiling'
                  ? '正在自动编排…'
                  : '生成并保存剪辑项目'}
            </button>
            {pendingBrief ? (
              <button
                className="editor-secondary-button"
                disabled={createState.status === 'compiling'}
                onClick={() => void compileBrief(pendingBrief)}
                type="button"
              >
                重试自动剪辑
              </button>
            ) : null}
            {readyAssets.length === 0 ? (
              <p className="text-[10px] font-bold text-amber-700">
                请先在素材库上传视频并等待分析完成。
              </p>
            ) : null}
          </div>

          {createState.status === 'success' ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-xs font-bold text-emerald-700">
              {createState.message}
            </p>
          ) : null}
          {createState.status === 'error' ? (
            <p className="rounded-2xl bg-rose-50 p-4 text-xs leading-5 text-rose-700">
              {createState.message}
            </p>
          ) : null}
        </form>

        <aside className="wizard-plan-column">
          <div className="wizard-preview-card">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e2b174]">
              Generated Preview
            </p>
            {previewProject && selectedDetail ? (
              <>
                <h3 className="mt-2 text-lg font-black">{previewProject.name}</h3>
                <p className="mt-1 text-[10px] text-white/55">
                  已保存 · 修订 {selectedDetail.currentRevision.revision}
                </p>
                <div className="mt-4 overflow-hidden rounded-2xl bg-[#10181c]">
                  <StudioPreview
                    assets={studioAssets}
                    currentFrame={currentFrame}
                    isPlaying={isPlaying}
                    onScrub={setCurrentFrame}
                    onTogglePlayback={() => setIsPlaying((playing) => !playing)}
                    project={previewProject}
                  />
                </div>
                {previewStats ? (
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ['时长', `${previewStats.durationSeconds}s`],
                      ['轨道', String(previewStats.trackCount)],
                      ['片段', String(previewStats.clipCount)],
                    ].map(([label, value]) => (
                      <div className="rounded-xl bg-white/8 px-2 py-3" key={label}>
                        <p className="text-sm font-black">{value}</p>
                        <p className="mt-1 text-[8px] text-white/45">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {generation ? (
                  <div className="mt-4 rounded-2xl bg-white/7 p-4 text-[10px] leading-5 text-white/65">
                    <p className="font-black text-white">
                      已匹配 {generation.selectedSlots}/{generation.totalSlots} 个画面槽位
                    </p>
                    <p>使用 {generation.usedAssetIds.length} 个素材文件</p>
                    {generation.warnings.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {generation.warnings.map((warning, index) => {
                          const guidance = generationGuidance(warning);
                          return (
                            <li
                              className={`rounded-xl border p-3 ${
                                warning.severity === 'info'
                                  ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-100'
                                  : 'border-amber-300/20 bg-amber-300/8 text-amber-100'
                              }`}
                              key={`${warning.code}-${index}`}
                            >
                              <p className="font-black">{guidance.title}</p>
                              <p className="mt-1 opacity-75">{guidance.action}</p>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-emerald-200">
                        <span>编排无警告</span>，可进入渲染验收
                      </p>
                    )}
                  </div>
                ) : null}
                <button
                  className="mt-4 w-full rounded-xl bg-[#e2b174] px-4 py-3 text-xs font-black text-[#263138] transition hover:-translate-y-0.5"
                  onClick={() => setStudioOpen(true)}
                  type="button"
                >
                  进入 Studio 编辑
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-6 text-center">
                <p className="text-sm font-black">等待生成结果</p>
                <p className="mt-2 text-[10px] leading-5 text-white/45">
                  生成后会在这里展示竖版预览、轨道和片段统计。
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">已保存项目</h3>
              <span className="text-[10px] font-bold text-slate-400">
                {loadState.data.projects.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {loadState.data.projects.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-[10px] text-slate-500">
                  还没有生产项目。
                </p>
              ) : (
                loadState.data.projects.map((project) => (
                  <button
                    aria-label={`在 Studio 中打开 ${project.name}`}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-3 text-left transition hover:border-[#d9b489]"
                    key={project.id}
                    onClick={() => void openProject(project.id, true)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black">{project.name}</span>
                      <span className="mt-1 block text-[9px] text-slate-400">
                        {project.templateKey} · 修订 {project.currentRevision}
                      </span>
                    </span>
                    <span className="ml-3 rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-600">
                      {statusLabel(project.status)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
