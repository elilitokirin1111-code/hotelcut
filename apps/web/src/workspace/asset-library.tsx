import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { Asset, AssetDetail } from '@hotelcut/schemas';

import {
  visionAngleLabels,
  visionCategoryLabels,
  visionCompositionLabels,
  visionLightingLabels,
  visionMotionLabels,
  visionTagLabels,
} from './asset-labels';
import { searchAssets } from './asset-search';
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
  | {
      completedFiles: number;
      fileName: string;
      progress: AssetUploadProgress;
      status: 'uploading';
      totalFiles: number;
    }
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
  uploading: '正在上传素材分片',
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
  const probe = detail.metadata['probe'];
  const value =
    detail.metadata[key] ??
    (typeof probe === 'object' && probe !== null && !Array.isArray(probe)
      ? (probe as Record<string, unknown>)[key]
      : undefined);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function visionOf(metadata: Record<string, unknown>): Record<string, unknown> {
  return asRecord(metadata['vision']);
}

function assetShortName(value: {
  metadata: Record<string, unknown>;
  originalFilename: string;
}): string {
  const vision = visionOf(value.metadata);
  const shortName = typeof vision['shortName'] === 'string' ? vision['shortName'].trim() : '';
  if (shortName) {
    return shortName;
  }
  const scene = firstUsableScene(vision);
  if (scene) {
    const category =
      typeof scene['category'] === 'string'
        ? (visionCategoryLabels[scene['category']] ?? scene['category'])
        : null;
    const sellingPoints = Array.isArray(scene['sellingPoints'])
      ? scene['sellingPoints'].filter((entry): entry is string => typeof entry === 'string')
      : [];
    const selling = sellingPoints[0]?.replace(/[，。,!?].*$/, '').slice(0, 6) ?? '';
    return category ? (selling ? `${category}·${selling}` : category) : value.originalFilename;
  }
  const summary = typeof vision['summary'] === 'string' ? vision['summary'].trim() : '';
  const clause = summary.split(/[，。,!?]/)[0]?.trim() ?? '';
  return clause.slice(0, 14) || value.originalFilename;
}

function firstUsableScene(vision: Record<string, unknown>): Record<string, unknown> | null {
  const scenes = Array.isArray(vision['scenes']) ? vision['scenes'] : [];
  for (const scene of scenes) {
    const record = asRecord(scene);
    if (record['usable'] !== false) {
      return record;
    }
  }
  return scenes.length > 0 ? asRecord(scenes[0]) : null;
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
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<AssetDetailState>({ status: 'idle' });
  const [detailVersion, setDetailVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Asset['status'] | 'all'>('all');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputVersion, setFileInputVersion] = useState(0);
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
    const byStatus = listState.assets.filter(
      (asset) => statusFilter === 'all' || asset.status === statusFilter,
    );
    return searchAssets(byStatus, search);
  }, [listState, search, statusFilter]);

  const uploadAssets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedFiles.length === 0) {
      setUploadState({ message: '请先选择视频或音频文件', status: 'error' });
      return;
    }
    let uploadedFiles = 0;
    let lastAssetId: string | null = null;
    const failures: string[] = [];
    for (const [index, file] of selectedFiles.entries()) {
      try {
        const result = await api.uploadVideo(hotelId, file, (progress) =>
          setUploadState({
            completedFiles: index,
            fileName: file.name,
            progress,
            status: 'uploading',
            totalFiles: selectedFiles.length,
          }),
        );
        uploadedFiles += 1;
        lastAssetId = result.assetId;
      } catch (error) {
        failures.push(`${file.name}：${formatError(error)}`);
      }
    }
    if (uploadedFiles > 0) {
      setSelectedAssetId(lastAssetId);
      setListVersion((version) => version + 1);
    }
    setSelectedFiles([]);
    setFileInputVersion((version) => version + 1);
    setUploadState(
      failures.length > 0
        ? {
            message: `已提交 ${uploadedFiles}/${selectedFiles.length} 个素材；${failures.join('；')}`,
            status: 'error',
          }
        : {
            message: `${uploadedFiles} 个素材上传完成，已进入自动分析队列`,
            status: 'queued',
          },
    );
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

  const deleteSelectedAssets = async () => {
    if (selectedAssetIds.length === 0) {
      return;
    }
    if (!window.confirm(`确定删除选中的 ${selectedAssetIds.length} 个素材？删除后不可恢复。`)) {
      return;
    }
    setOperationMessage(null);
    try {
      await api.deleteAssets(hotelId, selectedAssetIds);
      setOperationMessage(`已删除 ${selectedAssetIds.length} 个素材`);
      setSelectedAssetIds([]);
      setSelectedAssetId((current) =>
        current && selectedAssetIds.includes(current) ? null : current,
      );
      setListVersion((version) => version + 1);
      setDetailVersion((version) => version + 1);
    } catch (error) {
      setOperationMessage(formatError(error));
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
    <section aria-label="生产素材库" className="asset-page">
      <div className="page-heading-row">
        <div>
          <p className="page-eyebrow">MEDIA INTELLIGENCE</p>
          <h2>生产素材库</h2>
          <p>
            视频和背景音乐经安全分片上传后自动进入分析队列；分析完成的素材才会进入后续自动剪辑候选池。
          </p>
        </div>
        <button
          className="button-secondary"
          onClick={() => setListVersion((version) => version + 1)}
          type="button"
        >
          刷新状态
        </button>
        {selectedAssetIds.length > 0 ? (
          <button
            className="button-danger"
            onClick={() => void deleteSelectedAssets()}
            type="button"
          >
            删除选中（{selectedAssetIds.length}）
          </button>
        ) : null}
      </div>
      {operationMessage ? (
        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
          {operationMessage}
        </p>
      ) : null}

      <div className="asset-workspace-grid">
        <div className="asset-main-panel surface-card">
          <form
            aria-label="批量上传视频和音频素材"
            className="asset-upload-drop"
            onSubmit={(event) => void uploadAssets(event)}
          >
            <label className="mt-4 block">
              <span className="sr-only">选择视频或音频文件</span>
              <strong>将视频或图片拖到此处，或点击选择素材</strong>
              <small>支持视频与背景音乐，可一次选择多个文件；单文件最大 20 GB</small>
              <input
                accept="video/*,audio/*"
                aria-label="选择视频或音频文件"
                className="asset-file-input"
                key={fileInputVersion}
                multiple
                onChange={(event) => {
                  setSelectedFiles(Array.from(event.target.files ?? []));
                  setUploadState({ status: 'idle' });
                }}
                type="file"
              />
            </label>
            {selectedFiles.length > 0 ? (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs">
                <div className="flex items-center justify-between gap-3 font-bold text-slate-700">
                  <span>{selectedFiles.length} 个待上传素材</span>
                  <span className="shrink-0 text-slate-400">
                    {formatBytes(selectedFiles.reduce((total, file) => total + file.size, 0))}
                  </span>
                </div>
                <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[10px] text-slate-400">
                  {selectedFiles.map((file) => (
                    <p className="truncate" key={`${file.name}-${file.lastModified}-${file.size}`}>
                      {file.name}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {uploadState.status === 'uploading' ? (
              <div className="mt-4" aria-live="polite">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>
                    {uploadState.completedFiles + 1}/{uploadState.totalFiles} ·{' '}
                    {uploadPhaseLabels[uploadState.progress.phase]} · {uploadState.fileName}
                  </span>
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
              className="asset-upload-button"
              disabled={selectedFiles.length === 0 || uploadState.status === 'uploading'}
              type="submit"
            >
              {uploadState.status === 'uploading' ? '正在批量处理…' : '批量上传并自动分析'}
            </button>
          </form>

          <div className="asset-collection">
            <div className="asset-toolbar-heading">
              <h3>酒店素材</h3>
              {listState.status === 'ready' ? (
                <span className="text-[10px] font-black text-slate-400">
                  {listState.assets.length} 个文件
                  {search.trim() ? `，匹配 ${filteredAssets.length} 个` : ''}
                </span>
              ) : null}
            </div>
            <div className="asset-filter-row">
              <label>
                <span className="sr-only">搜索素材</span>
                <input
                  aria-label="搜索素材"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs outline-none focus:border-[#d6a76d]"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索名称、标签、卖点或画面描述…"
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
                {listState.assets.length === 0
                  ? '还没有上传素材'
                  : '没有匹配的素材，试试名称、标签、卖点或画面描述'}
              </p>
            ) : null}
            <div aria-label="素材列表" className="asset-card-grid">
              {filteredAssets.map((asset) => (
                <div className="asset-card-wrap" key={asset.id}>
                  <label className="asset-card-check">
                    <input
                      aria-label={`选择素材 ${assetShortName(asset)}`}
                      checked={selectedAssetIds.includes(asset.id)}
                      onChange={(event) =>
                        setSelectedAssetIds((current) =>
                          event.target.checked
                            ? [...current, asset.id]
                            : current.filter((id) => id !== asset.id),
                        )
                      }
                      type="checkbox"
                    />
                  </label>
                  <button
                    aria-pressed={asset.id === selectedAssetId}
                    className={`asset-library-card ${asset.id === selectedAssetId ? 'is-selected' : ''}`}
                    onClick={() => setSelectedAssetId(asset.id)}
                    type="button"
                  >
                    <span
                      className={`asset-card-visual asset-card-${asset.kind}`}
                      aria-hidden="true"
                    >
                      <i />
                      <i />
                      <i />
                      <em>{asset.kind === 'audio' ? 'AUDIO' : '9:16'}</em>
                    </span>
                    <div className="asset-card-copy">
                      <div>
                        <strong>{assetShortName(asset)}</strong>
                        <AssetStatus status={asset.status} />
                      </div>
                      <small className="asset-card-file">{asset.originalFilename}</small>
                      <p>
                        {asset.kind === 'audio' ? '音频' : '视频'} · {formatBytes(asset.byteSize)}
                      </p>
                      <time>{new Date(asset.createdAt).toLocaleString('zh-CN')}</time>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="asset-detail-panel surface-card">
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
  const vision = asRecord(detail.metadata['vision']);
  const visionStatus = typeof vision['status'] === 'string' ? vision['status'] : null;
  const visionSummary = typeof vision['summary'] === 'string' ? vision['summary'] : '';
  const visionModel = typeof vision['model'] === 'string' ? vision['model'] : '';
  const visionQuality = typeof vision['qualityScore'] === 'number' ? vision['qualityScore'] : null;
  const visionTags = stringArray(vision['tags']);
  const visionSellingPoints = stringArray(vision['sellingPoints']);
  const usableScene = firstUsableScene(vision);
  const shot = asRecord(usableScene?.['shot']);
  const shotAngle =
    typeof shot['angle'] === 'string' ? (visionAngleLabels[shot['angle']] ?? shot['angle']) : null;
  const shotMotion =
    typeof shot['cameraMotion'] === 'string'
      ? (visionMotionLabels[shot['cameraMotion']] ?? shot['cameraMotion'])
      : null;
  const shotLighting =
    typeof shot['lighting'] === 'string'
      ? (visionLightingLabels[shot['lighting']] ?? shot['lighting'])
      : null;
  const shotComposition =
    typeof shot['composition'] === 'string'
      ? (visionCompositionLabels[shot['composition']] ?? shot['composition'])
      : null;
  const sceneShortNames = Array.isArray(vision['scenes'])
    ? vision['scenes']
        .map((scene) => {
          const value = asRecord(scene)['shortName'];
          return typeof value === 'string' && value.trim() ? value.trim() : null;
        })
        .filter((value): value is string => value !== null)
    : [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a6b3c]">
            Asset Detail
          </p>
          <h3 className="mt-2 truncate text-xl font-black">{assetShortName(detail)}</h3>
          <p className="mt-1 truncate text-[10px] text-slate-400">{detail.originalFilename}</p>
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
              (detail.status === 'ready'
                ? detail.kind === 'audio'
                  ? '音频已完成分析，可添加“背景音乐 / BGM”标签供自动剪辑选择'
                  : '暂无可用代理预览'
                : detail.kind === 'audio'
                  ? '分析完成后将读取音频时长和编码信息'
                  : '分析完成后将生成代理视频与缩略图')}
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

      {detail.kind === 'video' && detail.status === 'ready' && visionStatus === 'succeeded' ? (
        <section
          aria-label="AI 素材理解结果"
          className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-indigo-950">AI 素材理解完成</p>
              <p className="mt-1 text-[10px] text-indigo-500">
                {visionModel || 'OpenAI 视觉模型'}
                {visionQuality !== null ? ` · 画面评分 ${visionQuality}/100` : ''}
              </p>
            </div>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black text-indigo-700">
              已进入自动选片
            </span>
          </div>
          {visionSummary ? (
            <p className="mt-4 text-xs leading-6 text-slate-600">{visionSummary}</p>
          ) : null}
          {usableScene ? (
            <div className="mt-4 space-y-1.5 rounded-2xl bg-white/70 p-3 text-[10px] leading-5 text-slate-600">
              <p className="font-black text-indigo-900">镜头分析</p>
              <p>
                {[
                  shotAngle && `角度：${shotAngle}`,
                  shotMotion && `运镜：${shotMotion}`,
                  shotLighting && `光线：${shotLighting}`,
                  shotComposition && `构图：${shotComposition}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {sceneShortNames.length > 0 ? <p>分镜：{sceneShortNames.join(' / ')}</p> : null}
            </div>
          ) : null}
          {visionTags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {visionTags.map((tag) => (
                <span
                  className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-indigo-700"
                  key={tag}
                >
                  {visionTagLabels[tag] ?? tag}
                </span>
              ))}
            </div>
          ) : null}
          {visionSellingPoints.length > 0 ? (
            <p className="mt-4 text-[10px] leading-5 text-slate-500">
              可用卖点：{visionSellingPoints.join('、')}
            </p>
          ) : null}
          <button className="editor-secondary-button mt-4" onClick={onRetry} type="button">
            重新进行 AI 分析
          </button>
        </section>
      ) : null}

      {detail.kind === 'video' && detail.status === 'ready' && visionStatus === 'failed' ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-black text-amber-900">AI 素材理解暂时失败</p>
          <p className="mt-1 text-[10px] leading-5 text-amber-700">
            当前素材仍可通过规则和人工标签剪辑；点击“重新分析”可再次调用模型。
          </p>
          <button className="editor-secondary-button mt-3" onClick={onRetry} type="button">
            重新分析
          </button>
        </div>
      ) : null}

      {detail.kind === 'video' && detail.status === 'ready' && visionStatus === 'disabled' ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black text-slate-700">AI 素材理解未启用</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            配置 OPENAI_API_KEY 后重新分析，即可自动识别客房、卫浴、设施与画面质量。
          </p>
          <button className="editor-secondary-button mt-3" onClick={onRetry} type="button">
            配置后重新分析
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
              placeholder="如：湖景房、人物口播、背景音乐"
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
