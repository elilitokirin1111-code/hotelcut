import type {
  QualityReport,
  RenderArtifact,
  RenderJob,
  RenderJobDetail,
  RenderJobStatus,
  VideoProject,
} from '@hotelcut/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { RenderArtifactDownload, WorkspaceApi } from './workspace-api';

type RenderCenterApi = Pick<
  WorkspaceApi,
  | 'cancelRenderJob'
  | 'createRenderJob'
  | 'deleteRenderJobs'
  | 'getRenderArtifactDownload'
  | 'getRenderJob'
  | 'listRenderJobs'
  | 'listVideoProjects'
  | 'retryRenderJob'
>;

interface RenderCenterProps {
  api: RenderCenterApi;
  hotelId: string;
  pollIntervalMs?: number;
}

type ProjectLoadState =
  | { status: 'loading' }
  | { status: 'ready'; projects: VideoProject[] }
  | { status: 'error'; message: string };

type JobListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; jobs: RenderJob[] }
  | { status: 'error'; message: string };

type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; detail: RenderJobDetail }
  | { status: 'error'; message: string };

type ActionState =
  | { status: 'idle' }
  | { status: 'working'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

type DownloadState =
  | { status: 'loading' }
  | { status: 'ready'; download: RenderArtifactDownload }
  | { status: 'error'; message: string };

const statusLabels: Record<RenderJobStatus, string> = {
  queued: '等待渲染',
  preprocessing: '准备素材',
  rendering: '正在渲染',
  validating: '质量检查',
  succeeded: '渲染完成',
  failed: '渲染失败',
  cancelled: '已取消',
};

const statusStyles: Record<RenderJobStatus, string> = {
  queued: 'bg-slate-100 text-slate-700',
  preprocessing: 'bg-amber-50 text-amber-700',
  rendering: 'bg-sky-50 text-sky-700',
  validating: 'bg-violet-50 text-violet-700',
  succeeded: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const artifactLabels: Record<RenderArtifact['kind'], string> = {
  video: '成片视频',
  thumbnail: '封面缩略图',
  captions: '字幕文件',
  report: '质量报告',
  project: '项目快照',
  manifest: '渲染清单',
};

const activeStatuses = new Set<RenderJobStatus>([
  'queued',
  'preprocessing',
  'rendering',
  'validating',
]);

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : '渲染中心请求失败';
}

function formatBytes(byteSize: number): string {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function qualitySummary(report: QualityReport) {
  const summary = asRecord(report.details['summary']);
  return {
    failed: numberValue(summary['failed']),
    passed: numberValue(summary['passed']),
    warnings: numberValue(summary['warnings']),
  };
}

function qualityChecks(report: QualityReport) {
  const checks = report.details['checks'];
  if (!Array.isArray(checks)) {
    return [];
  }
  return checks.flatMap((value) => {
    const check = asRecord(value);
    const name = check['name'];
    const status = check['status'];
    const message = check['message'];
    if (
      typeof name !== 'string' ||
      typeof message !== 'string' ||
      !['passed', 'warning', 'failed'].includes(String(status))
    ) {
      return [];
    }
    return [{ message, name, status: String(status) as 'failed' | 'passed' | 'warning' }];
  });
}

function updateJobList(state: JobListState, job: RenderJob): JobListState {
  if (state.status !== 'ready') {
    return { jobs: [job], status: 'ready' };
  }
  const existingIndex = state.jobs.findIndex((candidate) => candidate.id === job.id);
  if (existingIndex < 0) {
    return { jobs: [job, ...state.jobs], status: 'ready' };
  }
  return {
    jobs: state.jobs.map((candidate) => (candidate.id === job.id ? job : candidate)),
    status: 'ready',
  };
}

export function RenderCenter({ api, hotelId, pollIntervalMs = 1_500 }: RenderCenterProps) {
  const [projectVersion, setProjectVersion] = useState(0);
  const [projectState, setProjectState] = useState<ProjectLoadState>({ status: 'loading' });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const createdJobIdsRef = useRef<Set<string>>(new Set());
  const [jobVersion, setJobVersion] = useState(0);
  const [jobState, setJobState] = useState<JobListState>({ status: 'idle' });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' });
  const [actionState, setActionState] = useState<ActionState>({ status: 'idle' });
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  useEffect(() => {
    const controller = new AbortController();
    setProjectState({ status: 'loading' });
    void api
      .listVideoProjects(hotelId, controller.signal)
      .then((projects) => {
        setProjectState({ projects, status: 'ready' });
        setSelectedProjectId((current) =>
          current && projects.some((project) => project.id === current)
            ? current
            : (projects[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProjectState({ message: formatError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, hotelId, projectVersion]);

  useEffect(() => {
    if (!selectedProjectId) {
      setJobState({ status: 'idle' });
      setSelectedJobId(null);
      return;
    }
    const controller = new AbortController();
    setJobState((state) =>
      createdJobIdsRef.current.size > 0 && state.status === 'ready'
        ? state
        : { status: 'loading' },
    );
    void api
      .listRenderJobs(selectedProjectId, controller.signal)
      .then((jobs) => {
        if (controller.signal.aborted) {
          return;
        }
        const knownIds = new Set(jobs.map((job) => job.id));
        for (const id of createdJobIdsRef.current) {
          if (knownIds.has(id)) {
            createdJobIdsRef.current.delete(id);
          }
        }
        if (createdJobIdsRef.current.size > 0) {
          return;
        }
        setJobState({ jobs, status: 'ready' });
        setSelectedJobId((current) =>
          current && jobs.some((job) => job.id === current) ? current : (jobs[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setJobState({ message: formatError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, jobVersion, selectedProjectId]);

  useEffect(() => {
    if (!selectedJobId) {
      setDetailState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setDetailState((state) =>
      state.status === 'ready' && state.detail.job.id === selectedJobId
        ? state
        : { status: 'loading' },
    );
    void api
      .getRenderJob(selectedJobId, controller.signal)
      .then((detail) => {
        setDetailState({ detail, status: 'ready' });
        setJobState((state) => updateJobList(state, detail.job));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDetailState({ message: formatError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, detailVersion, selectedJobId]);

  const selectedStatus = detailState.status === 'ready' ? detailState.detail.job.status : undefined;

  useEffect(() => {
    if (!selectedStatus || !activeStatuses.has(selectedStatus)) {
      return;
    }
    const timer = window.setInterval(
      () => setDetailVersion((version) => version + 1),
      pollIntervalMs,
    );
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, selectedStatus]);

  const selectedProject = useMemo(
    () =>
      projectState.status === 'ready'
        ? (projectState.projects.find((project) => project.id === selectedProjectId) ?? null)
        : null,
    [projectState, selectedProjectId],
  );

  const createRender = async () => {
    if (!selectedProject) {
      return;
    }
    setActionState({ message: '正在提交渲染任务…', status: 'working' });
    try {
      const job = await api.createRenderJob(selectedProject.id);
      createdJobIdsRef.current.add(job.id);
      setJobState((state) => updateJobList(state, job));
      setSelectedJobId(job.id);
      setDetailVersion((version) => version + 1);
      setJobVersion((version) => version + 1);
      setActionState({
        message: `已锁定项目修订 ${selectedProject.currentRevision} 并提交渲染`,
        status: 'success',
      });
    } catch (error) {
      setActionState({ message: formatError(error), status: 'error' });
    }
  };

  const cancelRender = async (jobId: string) => {
    setActionState({ message: '正在申请取消渲染…', status: 'working' });
    try {
      const job = await api.cancelRenderJob(jobId);
      setJobState((state) => updateJobList(state, job));
      setDetailVersion((version) => version + 1);
      setActionState({ message: '取消请求已提交', status: 'success' });
    } catch (error) {
      setActionState({ message: formatError(error), status: 'error' });
    }
  };

  const retryRender = async (jobId: string) => {
    setActionState({ message: '正在重新提交渲染…', status: 'working' });
    try {
      const job = await api.retryRenderJob(jobId);
      setJobState((state) => updateJobList(state, job));
      setDetailVersion((version) => version + 1);
      setActionState({ message: '渲染任务已重新入队', status: 'success' });
    } catch (error) {
      setActionState({ message: formatError(error), status: 'error' });
    }
  };

  const deleteSelectedRenders = async () => {
    if (!selectedProjectId || selectedJobIds.length === 0) {
      return;
    }
    if (!window.confirm(`确定删除选中的 ${selectedJobIds.length} 个渲染任务？删除后不可恢复。`)) {
      return;
    }
    setActionState({ message: '正在删除渲染任务…', status: 'working' });
    try {
      await api.deleteRenderJobs(selectedProjectId, selectedJobIds);
      setActionState({
        message: `已删除 ${selectedJobIds.length} 个渲染任务`,
        status: 'success',
      });
      setSelectedJobIds([]);
      setJobVersion((version) => version + 1);
    } catch (error) {
      setActionState({ message: formatError(error), status: 'error' });
    }
  };

  const prepareDownload = async (artifactId: string) => {
    setDownloads((state) => ({ ...state, [artifactId]: { status: 'loading' } }));
    try {
      const download = await api.getRenderArtifactDownload(artifactId);
      setDownloads((state) => ({
        ...state,
        [artifactId]: { download, status: 'ready' },
      }));
    } catch (error) {
      setDownloads((state) => ({
        ...state,
        [artifactId]: { message: formatError(error), status: 'error' },
      }));
    }
  };

  const detail = detailState.status === 'ready' ? detailState.detail : null;
  const summary = detail?.qualityReport ? qualitySummary(detail.qualityReport) : null;
  const checks = detail?.qualityReport ? qualityChecks(detail.qualityReport) : [];
  const canCancel = detail ? activeStatuses.has(detail.job.status) : false;
  const canRetry =
    detail &&
    (detail.job.status === 'failed' || detail.job.status === 'cancelled') &&
    detail.job.attempt < detail.job.maxAttempts;

  return (
    <section aria-label="生产渲染中心" className="render-page">
      <div className="page-heading-row">
        <div>
          <p className="page-eyebrow">RENDER &amp; DELIVERY</p>
          <h2>渲染中心</h2>
          <p>每个任务锁定一个不可变项目修订，实时展示渲染阶段、质量检查和可下载交付产物。</p>
        </div>
        <button
          className="button-secondary"
          onClick={() => {
            setProjectVersion((version) => version + 1);
            setJobVersion((version) => version + 1);
            setDetailVersion((version) => version + 1);
          }}
          type="button"
        >
          刷新渲染中心
        </button>
      </div>

      {projectState.status === 'loading' ? (
        <p className="mt-8 text-sm font-semibold text-slate-500">正在加载视频项目…</p>
      ) : null}
      {projectState.status === 'error' ? (
        <div className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-black text-rose-800">项目加载失败</p>
          <p className="mt-2 text-xs text-rose-700">{projectState.message}</p>
        </div>
      ) : null}
      {projectState.status === 'ready' && projectState.projects.length === 0 ? (
        <div className="mt-7 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-black text-slate-700">还没有可渲染的视频项目</p>
          <p className="mt-2 text-xs text-slate-500">请先在“视频项目”中完成自动剪辑并保存。</p>
        </div>
      ) : null}

      {projectState.status === 'ready' && projectState.projects.length > 0 ? (
        <div className="render-workspace-grid">
          <aside className="render-project-panel surface-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">视频项目</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
                {projectState.projects.length}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {projectState.projects.map((project) => (
                <button
                  aria-label={`选择渲染项目 ${project.name}`}
                  aria-pressed={project.id === selectedProjectId}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    project.id === selectedProjectId
                      ? 'border-[#d6a76d] bg-[#fff9f1]'
                      : 'border-white bg-white hover:border-slate-200'
                  }`}
                  key={project.id}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setSelectedJobId(null);
                    setActionState({ status: 'idle' });
                  }}
                  type="button"
                >
                  <span className="block truncate text-xs font-black text-slate-800">
                    {project.name}
                  </span>
                  <span className="mt-1 block text-[10px] text-slate-500">
                    修订 {project.currentRevision} · {project.templateKey}
                  </span>
                </button>
              ))}
            </div>
            {selectedProject ? (
              <button
                className="mt-4 w-full rounded-xl bg-[#263138] px-4 py-3 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
                disabled={actionState.status === 'working'}
                onClick={() => void createRender()}
                type="button"
              >
                渲染当前修订 {selectedProject.currentRevision}
              </button>
            ) : null}
            {actionState.status !== 'idle' ? (
              <p
                className={`mt-3 text-[10px] leading-4 ${
                  actionState.status === 'error'
                    ? 'text-rose-700'
                    : actionState.status === 'success'
                      ? 'text-emerald-700'
                      : 'text-slate-500'
                }`}
              >
                {actionState.message}
              </p>
            ) : null}
          </aside>

          <aside className="render-history-panel surface-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">渲染记录</h3>
              {jobState.status === 'ready' ? (
                <div className="flex items-center gap-2">
                  {selectedJobIds.length > 0 ? (
                    <button
                      className="editor-secondary-button"
                      onClick={() => void deleteSelectedRenders()}
                      type="button"
                    >
                      删除选中（{selectedJobIds.length}）
                    </button>
                  ) : null}
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
                    {jobState.jobs.length}
                  </span>
                </div>
              ) : null}
            </div>
            {jobState.status === 'loading' ? (
              <p className="mt-4 text-xs text-slate-500">正在加载渲染记录…</p>
            ) : null}
            {jobState.status === 'error' ? (
              <p className="mt-4 text-xs leading-5 text-rose-700">{jobState.message}</p>
            ) : null}
            {jobState.status === 'ready' && jobState.jobs.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs text-slate-500">
                该项目还没有渲染记录。
              </p>
            ) : null}
            {jobState.status === 'ready' ? (
              <div className="mt-4 space-y-2">
                {jobState.jobs.map((job) => (
                  <div className="flex items-start gap-2" key={job.id}>
                    <label className="render-job-check">
                      <input
                        aria-label={`选择渲染任务 ${job.id}`}
                        checked={selectedJobIds.includes(job.id)}
                        disabled={activeStatuses.has(job.status)}
                        onChange={(event) =>
                          setSelectedJobIds((current) =>
                            event.target.checked
                              ? [...current, job.id]
                              : current.filter((id) => id !== job.id),
                          )
                        }
                        type="checkbox"
                      />
                    </label>
                    <button
                      aria-label={`查看渲染任务 ${job.id}`}
                      aria-pressed={job.id === selectedJobId}
                      className={`min-w-0 flex-1 rounded-2xl border p-3 text-left transition ${
                        job.id === selectedJobId
                          ? 'border-[#d6a76d] bg-[#fff9f1]'
                          : 'border-white bg-white hover:border-slate-200'
                      }`}
                      onClick={() => setSelectedJobId(job.id)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-slate-600">
                          第 {job.attempt + 1} 次尝试
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-[9px] font-black ${statusStyles[job.status]}`}
                        >
                          {statusLabels[job.status]}
                        </span>
                      </span>
                      <span className="mt-2 block text-[10px] text-slate-400">
                        {formatTime(job.createdAt)}
                      </span>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-[#d6a76d]"
                          style={{ width: `${job.progressBasisPoints / 100}%` }}
                        />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </aside>

          <div className="render-detail-panel surface-card">
            {detailState.status === 'idle' ? (
              <div className="grid min-h-64 place-items-center text-center">
                <div>
                  <p className="text-sm font-black text-slate-700">选择一条渲染记录</p>
                  <p className="mt-2 text-xs text-slate-500">查看进度、日志、质检和下载产物。</p>
                </div>
              </div>
            ) : null}
            {detailState.status === 'loading' ? (
              <p className="text-sm font-semibold text-slate-500">正在加载任务详情…</p>
            ) : null}
            {detailState.status === 'error' ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
                <p className="text-sm font-black text-rose-800">任务详情加载失败</p>
                <p className="mt-2 text-xs text-rose-700">{detailState.message}</p>
              </div>
            ) : null}
            {detail ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Render Job
                    </p>
                    <h3 className="mt-2 text-lg font-black text-slate-800">
                      {statusLabels[detail.job.status]}
                    </h3>
                    <p className="mt-1 text-[10px] text-slate-400">
                      任务 {detail.job.id.slice(0, 8)} · 尝试 {detail.job.attempt + 1}/
                      {detail.job.maxAttempts}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-2 text-[10px] font-black ${statusStyles[detail.job.status]}`}
                  >
                    {(detail.job.progressBasisPoints / 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#d6a76d] to-[#6d9c93] transition-[width]"
                    style={{ width: `${detail.job.progressBasisPoints / 100}%` }}
                  />
                </div>
                {detail.job.cancelRequestedAt ? (
                  <p className="mt-3 text-xs font-semibold text-amber-700">
                    已申请取消，Worker 会在当前安全检查点停止。
                  </p>
                ) : null}
                {detail.job.errorMessage ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-xs font-black text-rose-800">
                      {detail.job.errorCode ?? 'RENDER_FAILED'}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-rose-700">
                      {detail.job.errorMessage}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {canCancel ? (
                    <button
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-800"
                      disabled={actionState.status === 'working'}
                      onClick={() => void cancelRender(detail.job.id)}
                      type="button"
                    >
                      取消渲染
                    </button>
                  ) : null}
                  {canRetry ? (
                    <button
                      className="rounded-xl bg-[#263138] px-4 py-2.5 text-xs font-black text-white"
                      disabled={actionState.status === 'working'}
                      onClick={() => void retryRender(detail.job.id)}
                      type="button"
                    >
                      重试渲染
                    </button>
                  ) : null}
                </div>

                <section className="mt-7 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-slate-800">质量报告</h4>
                    {detail.qualityReport ? (
                      <span
                        className={`rounded-full px-3 py-1.5 text-[10px] font-black ${
                          detail.qualityReport.status === 'passed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : detail.qualityReport.status === 'warning'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {detail.qualityReport.status === 'passed'
                          ? '质检通过'
                          : detail.qualityReport.status === 'warning'
                            ? '存在警告'
                            : '质检失败'}
                      </span>
                    ) : null}
                  </div>
                  {detail.qualityReport && summary ? (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-[9px] font-black text-slate-400">综合得分</p>
                          <p className="mt-1 text-lg font-black text-slate-800">
                            {(detail.qualityReport.scoreBasisPoints / 100).toFixed(0)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 p-3">
                          <p className="text-[9px] font-black text-emerald-600">通过</p>
                          <p className="mt-1 text-lg font-black text-emerald-800">
                            {summary.passed}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 p-3">
                          <p className="text-[9px] font-black text-amber-600">警告</p>
                          <p className="mt-1 text-lg font-black text-amber-800">
                            {summary.warnings}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-rose-50 p-3">
                          <p className="text-[9px] font-black text-rose-600">失败</p>
                          <p className="mt-1 text-lg font-black text-rose-800">{summary.failed}</p>
                        </div>
                      </div>
                      {checks.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {checks.map((check) => (
                            <div
                              className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-3"
                              key={check.name}
                            >
                              <div>
                                <p className="text-[10px] font-black text-slate-700">
                                  {check.name}
                                </p>
                                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                  {check.message}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 text-[9px] font-black ${
                                  check.status === 'passed'
                                    ? 'text-emerald-700'
                                    : check.status === 'warning'
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                                }`}
                              >
                                {check.status === 'passed'
                                  ? '通过'
                                  : check.status === 'warning'
                                    ? '警告'
                                    : '失败'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-4 text-xs text-slate-500">
                      渲染完成并进入验证阶段后会生成质量报告。
                    </p>
                  )}
                </section>

                <section className="mt-7 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-slate-800">交付产物</h4>
                    <span className="text-[10px] font-bold text-slate-400">
                      {detail.artifacts.length}
                    </span>
                  </div>
                  {detail.artifacts.length === 0 ? (
                    <p className="mt-4 text-xs text-slate-500">渲染成功后会在这里生成交付文件。</p>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {detail.artifacts.map((artifact) => {
                        const downloadState = downloads[artifact.id];
                        return (
                          <article
                            className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
                            key={artifact.id}
                          >
                            <p className="text-xs font-black text-slate-800">
                              {artifactLabels[artifact.kind]}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {artifact.contentType} · {formatBytes(artifact.byteSize)}
                            </p>
                            {downloadState?.status === 'ready' ? (
                              <a
                                className="mt-3 inline-flex rounded-lg bg-[#263138] px-3 py-2 text-[10px] font-black text-white"
                                href={downloadState.download.downloadUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                下载{artifactLabels[artifact.kind]}
                              </a>
                            ) : (
                              <button
                                className="mt-3 rounded-lg bg-white px-3 py-2 text-[10px] font-black text-[#8d5d30] shadow-sm disabled:opacity-50"
                                disabled={downloadState?.status === 'loading'}
                                onClick={() => void prepareDownload(artifact.id)}
                                type="button"
                              >
                                {downloadState?.status === 'loading'
                                  ? '正在生成链接…'
                                  : '生成下载链接'}
                              </button>
                            )}
                            {downloadState?.status === 'error' ? (
                              <p className="mt-2 text-[9px] text-rose-700">
                                {downloadState.message}
                              </p>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="mt-7 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-black text-slate-800">处理日志</h4>
                  {detail.job.logs.length === 0 ? (
                    <p className="mt-4 text-xs text-slate-500">等待 Worker 写入处理日志。</p>
                  ) : (
                    <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                      {detail.job.logs
                        .slice()
                        .reverse()
                        .map((entry, index) => (
                          <div
                            className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                            key={`${entry.timestamp}-${entry.stage}-${index}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
                                {entry.stage}
                              </p>
                              <p className="text-[9px] text-slate-400">
                                {formatTime(entry.timestamp)}
                              </p>
                            </div>
                            <p
                              className={`mt-1 text-[10px] leading-4 ${
                                entry.level === 'error'
                                  ? 'text-rose-700'
                                  : entry.level === 'warning'
                                    ? 'text-amber-700'
                                    : 'text-slate-600'
                              }`}
                            >
                              {entry.message}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
