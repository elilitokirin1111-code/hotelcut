import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { Asset, AssetDetail } from '@hotelcut/schemas';

import { type AssetUploadProgress, type WorkspaceApi, WorkspaceApiError } from './workspace-api';

type AssetListState =
  | { status: 'loading' }
  | { message: string; status: 'error' }
  | { assets: Asset[]; status: 'ready' };

type AssetDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { message: string; status: 'error' }
  | {
      detail: AssetDetail;
      previewKind: 'proxy' | 'thumbnail' | null;
      previewMessage: string | null;
      previewUrl: string | null;
      status: 'ready';
    };

type UploadState =
  | { status: 'idle' }
  | { progress: AssetUploadProgress; status: 'uploading' }
  | { message: string; status: 'error' }
  | { message: string; status: 'queued' };

type TagState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { message: string; status: 'error' }
  | { message: string; status: 'saved' };

const statusLabels: Record<Asset['status'], string> = {
  registered: '等待上传完成',
  uploaded: '等待分析',
  analyzing: '分析中',
  ready: '可用于剪辑',
  failed: '分析失败',
};

const statusClasses: Record<Asset['status'], string> = {
  registered: 'bg-slate-100 text-slate-600',
  uploaded: 'bg-amber-50 text-amber-700',
  analyzing: 'bg-sky-50 text-sky-700',
  ready: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
};

const uploadPhaseLabels: Record<AssetUploadProgress['phase'], string> = {
  hashing: '正在计算文件校验值',
  registering: '正在登记安全上传',
  uploading: '正在上传视频分片',
  finalizing: '正在校验并提交分析',
};

function formatError(error: unknown): string {
  if (error instanceof WorkspaceApiError || error instanceof Error) {
    return error.message;
  }
  return '素材请求失败，请稍后重试';
}

function formatBytes(byteSize: number): string {
  if (byteSize >= 1024 * 1024 * 1024) {
    return `${(byteSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder} 秒`;
}

function metadataNumber(detail: AssetDetail, key: string): number | null {
  const value = detail.metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function AssetStatus({ status }: { status: Asset['status'] }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export function AssetLibrary({ api, hotelId }: { api: WorkspaceApi; hotelId: string }) {
  const [listState, setListState] = useState<AssetListState>({ status: 'loading' });
  const [listVersion, setListVersion] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<AssetDetailState>({ status: 'idle' });
  const [detailVersion, setDetailVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Asset['status'] | 'all'>('all');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [tagLabel, setTagLabel] = useState('');
  const [tagStartSeconds, setTagStartSeconds] = useState('0');
  const [tagEndSeconds, setTagEndSeconds] = useState('');
  const [tagState, setTagState] = useState<TagState>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setListState({ status: 'loading' });
    void api
      .listAssets(hotelId, controller.signal)
      .then((assets) => {
        setListState({ assets, status: 'ready' });
        setSelectedAssetId((current) =>
          current && assets.some((asset) => asset.id === current)
            ? current
            : (assets[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setListState({ message: formatError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [api, hotelId, listVersion]);

  const hasActiveAnalysis =
    listState.status === 'ready' &&
    listState.assets.some((asset) => asset.status === 'uploaded' || asset.status === 'analyzing');

  useEffect(() => {
    if (!hasActiveAnalysis) {
      return;
    }
    const interval = window.setInterval(() => setListVersion((version) => version + 1), 5_000);
    return () => window.clearInterval(interval);
  }, [hasActiveAnalysis]);

  const selectedListAsset =
    listState.status === 'ready'
      ? listState.assets.find((asset) => asset.id === selectedAssetId)
      : undefined;
  const selectedListAssetVersion = selectedListAsset
    ? `${selectedListAsset.status}:${selectedListAsset.updatedAt}`
    : null;
  const loadedDetailVersion =
    detailState.status === 'ready'
      ? `${detailState.detail.status}:${detailState.detail.updatedAt}`
      : null;

  useEffect(() => {
    if (
      selectedListAssetVersion &&
      loadedDetailVersion &&
      selectedListAssetVersion !== loadedDetailVersion
    ) {
      setDetailVersion((version) => version + 1);
    }
  }, [loadedDetailVersion, selectedListAssetVersion]);

  useEffect(() => {
    if (!selectedAssetId) {
      setDetailState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    const loadDetail = async () => {
      setDetailState({ status: 'loading' });
      try {
        const detail = await api.getAssetDetail(selectedAssetId, controller.signal);
        const previewKind = detail.derivatives.some((item) => item.kind === 'proxy')
          ? 'proxy'
          : detail.derivatives.some((item) => item.kind === 'thumbnail')
            ? 'thumbnail'
            : null;
        let previewUrl: string | null = null;
        let previewMessage: string | null = null;
        if (previewKind) {
          try {
            previewUrl = (
              await api.getAssetDerivativeDownload(selectedAssetId, previewKind, controller.signal)
            ).url;
          } catch (error) {
            previewMessage = formatError(error);
          }
        }
        if (!controller.signal.aborted) {
          setDetailState({
            detail,
            previewKind,
            previewMessage,
            previewUrl,
            status: 'ready',
          });
          const durationMs = metadataNumber(detail, 'durationMs');
          setTagEndSeconds(durationMs ? String(Math.round(durationMs / 100) / 10) : '');
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setDetailState({ message: formatError(error), status: 'error' });
        }
      }
    };
    void loadDetail();
    return () => controller.abort();
  }, [api, detailVersion, selectedAssetId]);

  const filteredAssets = useMemo(() => {
    if (listState.status !== 'ready') {
      return [];
    }
    const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN');
    return listState.assets.filter(
      (asset) =>
        (statusFilter === 'all' || asset.status === statusFilter) &&
        (!normalizedSearch ||
          asset.originalFilename.toLocaleLowerCase('zh-CN').includes(normalizedSearch)),
    );
  }, [listState, search, statusFilter]);

  const uploadVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setUploadState({ message: '请先选择视频文件', status: 'error' });
      return;
    }
    try {
      const result = await api.uploadVideo(hotelId, selectedFile, (progress) =>
        setUploadState({ progress, status: 'uploading' }),
      );
      setUploadState({ message: '上传完成，已进入自动分析队列', status: 'queued' });
      setSelectedFile(null);
      setSelectedAssetId(result.assetId);
      setListVersion((version) => version + 1);
    } catch (error) {
      setUploadState({ message: formatError(error), status: 'error' });
    }
  };

  const retryAnalysis = async () => {
    if (!selectedAssetId) {
      return;
    }
    try {
      await api.retryAssetAnalysis(selectedAssetId);
      setListVersion((version) => version + 1);
      setDetailVersion((version) => version + 1);
    } catch (error) {
      setDetailState({ message: formatError(error), status: 'error' });
    }
  };

  const createTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAssetId) {
      return;
    }
    const startMs = Math.round(Number(tagStartSeconds) * 1000);
    const endMs = Math.round(Number(tagEndSeconds) * 1000);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      setTagState({ message: '标签结束时间必须晚于开始时间', status: 'error' });
      return;
    }
    setTagState({ status: 'saving' });
    try {
      await api.createManualSegment(selectedAssetId, {
        endMs,
        label: tagLabel.trim(),
        metadata: { role: 'operator-tag' },
        scoreBasisPoints: null,
        startMs,
      });
      setTagLabel('');
      setTagState({ message: '人工标签已保存', status: 'saved' });
      setDetailVersion((version) => version + 1);
    } catch (error) {
      setTagState({ message: formatError(error), status: 'error' });
    }
  };

  return (
    <section
      aria-label="生产素材库"
      className="mt-5 rounded-[28px] border border-white/80 bg-white/75 p-6 shadow-[0_18px_60px_rgba(35,52,60,.09)] lg:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a6b3c]">
            Production Assets
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">生产素材库</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
            视频经安全分片上传后自动进入分析队列；分析完成的素材才会进入后续自动剪辑候选池。
          </p>
        </div>
        <button
          className="editor-secondary-button"
          onClick={() => setListVersion((version) => version + 1)}
          type="button"
        >
          刷新状态
        </button>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(340px,.9fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <form
            aria-label="上传视频素材"
            className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5"
            onSubmit={(event) => void uploadVideo(event)}
          >
            <h3 className="text-base font-black">上传视频素材</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              支持浏览器识别的视频格式，单文件最大 20 GB。
            </p>
            <label className="mt-4 block">
              <span className="sr-only">选择视频文件</span>
              <input
                accept="video/*"
                className="block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#263138] file:px-4 file:py-3 file:text-xs file:font-black file:text-white"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setUploadState({ status: 'idle' });
                }}
                type="file"
              />
            </label>
            {selectedFile ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-xs">
                <span className="min-w-0 truncate font-bold text-slate-700">
                  {selectedFile.name}
                </span>
                <span className="shrink-0 text-slate-400">{formatBytes(selectedFile.size)}</span>
              </div>
            ) : null}
            {uploadState.status === 'uploading' ? (
              <div className="mt-4" aria-live="polite">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>{uploadPhaseLabels[uploadState.progress.phase]}</span>
                  <span>{uploadState.progress.percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#d6a76d] transition-[width]"
                    style={{ width: `${uploadState.progress.percent}%` }}
                  />
                </div>
              </div>
            ) : null}
            {uploadState.status === 'error' || uploadState.status === 'queued' ? (
              <p
                className={`mt-4 text-xs font-semibold ${
                  uploadState.status === 'queued' ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {uploadState.message}
              </p>
            ) : null}
            <button
              className="mt-4 rounded-xl bg-[#263138] px-5 py-3 text-xs font-black text-white disabled:cursor-wait disabled:opacity-50"
              disabled={!selectedFile || uploadState.status === 'uploading'}
              type="submit"
            >
              {uploadState.status === 'uploading' ? '正在处理…' : '上传并自动分析'}
            </button>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black">酒店素材</h3>
              {listState.status === 'ready' ? (
                <span className="text-[10px] font-black text-slate-400">
                  {listState.assets.length} 个文件
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px] xl:grid-cols-1 2xl:grid-cols-[1fr_150px]">
              <label>
                <span className="sr-only">搜索素材文件名</span>
                <input
                  aria-label="搜索素材文件名"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs outline-none focus:border-[#d6a76d]"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索文件名"
                  type="search"
                  value={search}
                />
              </label>
              <label>
                <span className="sr-only">筛选素材状态</span>
                <select
                  aria-label="筛选素材状态"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs outline-none focus:border-[#d6a76d]"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as Asset['status'] | 'all')
                  }
                  value={statusFilter}
                >
                  <option value="all">全部状态</option>
                  {Object.entries(statusLabels).map(([status, label]) => (
                    <option key={status} value={status}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {listState.status === 'loading' ? (
              <p className="mt-5 text-xs font-semibold text-slate-500">正在加载素材…</p>
            ) : null}
            {listState.status === 'error' ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-semibold text-rose-700">{listState.message}</p>
              </div>
            ) : null}
            {listState.status === 'ready' && filteredAssets.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
                {listState.assets.length === 0 ? '还没有上传素材' : '没有符合筛选条件的素材'}
              </p>
            ) : null}
            <div aria-label="素材列表" className="mt-4 space-y-2">
              {filteredAssets.map((asset) => (
                <button
                  aria-pressed={asset.id === selectedAssetId}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    asset.id === selectedAssetId
                      ? 'border-[#d6a76d] bg-[#fffaf4]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-xs font-black text-slate-700">
                      {asset.originalFilename}
                    </span>
                    <AssetStatus status={asset.status} />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {formatBytes(asset.byteSize)} ·{' '}
                    {new Date(asset.createdAt).toLocaleString('zh-CN')}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50/70 p-5 lg:p-6">
          {detailState.status === 'idle' ? (
            <div className="grid min-h-72 place-items-center text-center">
              <div>
                <p className="text-sm font-black text-slate-600">选择一个素材查看详情</p>
                <p className="mt-2 text-xs text-slate-400">
                  分析参数、镜头、转写和人工标签会显示在这里。
                </p>
              </div>
            </div>
          ) : null}
          {detailState.status === 'loading' ? (
            <p className="text-xs font-semibold text-slate-500">正在加载素材详情…</p>
          ) : null}
          {detailState.status === 'error' ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <p className="text-xs font-semibold text-rose-700">{detailState.message}</p>
              <button
                className="editor-secondary-button mt-4"
                onClick={() => setDetailVersion((version) => version + 1)}
                type="button"
              >
                重新加载
              </button>
            </div>
          ) : null}
          {detailState.status === 'ready' ? (
            <AssetDetailPanel
              detailState={detailState}
              onRetry={() => void retryAnalysis()}
              onTag={(event) => void createTag(event)}
              setTagEndSeconds={setTagEndSeconds}
              setTagLabel={setTagLabel}
              setTagStartSeconds={setTagStartSeconds}
              tagEndSeconds={tagEndSeconds}
              tagLabel={tagLabel}
              tagStartSeconds={tagStartSeconds}
              tagState={tagState}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AssetDetailPanel({
  detailState,
  onRetry,
  onTag,
  setTagEndSeconds,
  setTagLabel,
  setTagStartSeconds,
  tagEndSeconds,
  tagLabel,
  tagStartSeconds,
  tagState,
}: {
  detailState: Extract<AssetDetailState, { status: 'ready' }>;
  onRetry: () => void;
  onTag: (event: FormEvent<HTMLFormElement>) => void;
  setTagEndSeconds: (value: string) => void;
  setTagLabel: (value: string) => void;
  setTagStartSeconds: (value: string) => void;
  tagEndSeconds: string;
  tagLabel: string;
  tagStartSeconds: string;
  tagState: TagState;
}) {
  const { detail, previewKind, previewMessage, previewUrl } = detailState;
  const durationMs = metadataNumber(detail, 'durationMs');
  const width = metadataNumber(detail, 'width');
  const height = metadataNumber(detail, 'height');
  const frameRate = metadataNumber(detail, 'frameRate');
  const latestJob = detail.analysisJobs[0];
  const manualSegments = detail.segments.filter((segment) => segment.source === 'manual');
  const transcriptSegments = detail.segments.filter((segment) => segment.kind === 'speech');

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a6b3c]">
            Asset Detail
          </p>
          <h3 className="mt-2 truncate text-xl font-black">{detail.originalFilename}</h3>
          <p className="mt-2 text-xs text-slate-500">
            {formatBytes(detail.byteSize)}
            {durationMs ? ` · ${formatDuration(durationMs)}` : ''}
            {width && height ? ` · ${width}×${height}` : ''}
            {frameRate ? ` · ${frameRate.toFixed(2)} fps` : ''}
          </p>
        </div>
        <AssetStatus status={detail.status} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-[#1f2c32]">
        {previewUrl && previewKind === 'proxy' ? (
          <video
            aria-label="素材代理视频预览"
            className="aspect-video w-full bg-black object-contain"
            controls
            preload="metadata"
            src={previewUrl}
          />
        ) : null}
        {previewUrl && previewKind === 'thumbnail' ? (
          <img
            alt={`${detail.originalFilename} 缩略图`}
            className="aspect-video w-full object-contain"
            src={previewUrl}
          />
        ) : null}
        {!previewUrl ? (
          <div className="grid aspect-video place-items-center px-6 text-center text-xs text-white/55">
            {previewMessage ??
              (detail.status === 'ready' ? '暂无可用代理预览' : '分析完成后将生成代理视频与缩略图')}
          </div>
        ) : null}
      </div>

      {detail.status === 'failed' ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-black text-rose-800">
            {latestJob?.errorMessage ?? '自动分析失败'}
          </p>
          <button className="editor-secondary-button mt-3" onClick={onRetry} type="button">
            重新分析
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">镜头</p>
          <p className="mt-2 text-xl font-black">
            {detail.segments.filter((segment) => segment.kind === 'scene').length}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            语音段
          </p>
          <p className="mt-2 text-xl font-black">{transcriptSegments.length}</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            人工标签
          </p>
          <p className="mt-2 text-xl font-black">{manualSegments.length}</p>
        </div>
      </div>

      <form
        aria-label="添加人工素材标签"
        className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"
        onSubmit={onTag}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-black">人工素材标签</h4>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">
              标注可用镜头范围，后续自动剪辑会保留人工结果。
            </p>
          </div>
          {manualSegments.length > 0 ? (
            <div className="flex max-w-[55%] flex-wrap justify-end gap-1.5">
              {manualSegments.map((segment) => (
                <span
                  className="rounded-full bg-[#f3e5d4] px-2.5 py-1 text-[9px] font-black text-[#8d5d30]"
                  key={segment.id}
                >
                  {segment.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_110px]">
          <label>
            <span className="text-[10px] font-black text-slate-600">标签</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-[#d6a76d]"
              maxLength={160}
              onChange={(event) => setTagLabel(event.target.value)}
              placeholder="如：湖景房、人物口播"
              required
              value={tagLabel}
            />
          </label>
          <label>
            <span className="text-[10px] font-black text-slate-600">开始（秒）</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-[#d6a76d]"
              min="0"
              onChange={(event) => setTagStartSeconds(event.target.value)}
              step="0.1"
              type="number"
              value={tagStartSeconds}
            />
          </label>
          <label>
            <span className="text-[10px] font-black text-slate-600">结束（秒）</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-[#d6a76d]"
              min="0.1"
              onChange={(event) => setTagEndSeconds(event.target.value)}
              required
              step="0.1"
              type="number"
              value={tagEndSeconds}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-xl bg-[#263138] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
            disabled={detail.status !== 'ready' || tagState.status === 'saving'}
            type="submit"
          >
            {tagState.status === 'saving' ? '正在保存…' : '保存标签'}
          </button>
          {detail.status !== 'ready' ? (
            <p className="text-[10px] text-slate-400">素材分析完成后才能添加范围标签</p>
          ) : null}
          {tagState.status === 'saved' || tagState.status === 'error' ? (
            <p
              className={`text-xs font-semibold ${
                tagState.status === 'saved' ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {tagState.message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-black">分析记录</h4>
        {latestJob ? (
          <>
            <p className="mt-2 text-xs text-slate-500">
              状态：{latestJob.status} · 尝试 {latestJob.attempt}/{latestJob.maxAttempts}
            </p>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {latestJob.logs.length > 0 ? (
                latestJob.logs.map((log, index) => (
                  <div className="rounded-xl bg-slate-50 px-3 py-2" key={`${log.at}-${index}`}>
                    <p className="text-[10px] font-black uppercase text-slate-600">{log.level}</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">{log.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-slate-400">等待分析工作器写入进度</p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-400">尚无分析任务</p>
        )}
      </div>
    </>
  );
}
