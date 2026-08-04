import type { EditorCommand } from '@hotelcut/editor';
import type {
  AudioClip,
  CaptionClip,
  Clip,
  HotelVideoProjectV1,
  TextClip,
} from '@hotelcut/timeline';
import { useEffect, useMemo, useState } from 'react';

import { editorAssets, findEditorAsset, type EditorAsset } from './demo-data';
import { Icon, type IconName } from './icon';
import { PreviewArtwork } from './preview-artwork';

type InspectorTab = 'shot' | 'copy' | 'cta' | 'music';

interface InspectorProps {
  assets?: readonly EditorAsset[];
  project: HotelVideoProjectV1;
  currentFrame: number;
  selectedClipId: string | null;
  execute: (command: EditorCommand) => void;
}

const tabs: Array<{ id: InspectorTab; label: string; icon: IconName }> = [
  { id: 'shot', label: '镜头', icon: 'scissors' },
  { id: 'copy', label: '文案', icon: 'copy' },
  { id: 'cta', label: 'CTA', icon: 'replace' },
  { id: 'music', label: '音乐', icon: 'music' },
];

function allClips(project: HotelVideoProjectV1): Clip[] {
  return project.tracks.flatMap((track) => track.clips);
}

export function Inspector({
  assets = editorAssets,
  project,
  currentFrame,
  selectedClipId,
  execute,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('shot');
  const selectedClip = allClips(project).find((clip) => clip.id === selectedClipId);
  const selectedVideo = selectedClip?.kind === 'video' ? selectedClip : null;
  const captions = allClips(project).filter((clip): clip is CaptionClip => clip.kind === 'caption');
  const title = allClips(project).find(
    (clip): clip is TextClip =>
      clip.kind === 'text' && clip.metadata['generatedFrom'] === 'brief.title',
  );
  const activeCaption =
    captions.find(
      (caption) =>
        caption.startFrame <= currentFrame &&
        currentFrame < caption.startFrame + caption.durationFrames,
    ) ?? captions[0];
  const [sourceStart, setSourceStart] = useState(0);
  const [sourceEnd, setSourceEnd] = useState(1);
  const [captionId, setCaptionId] = useState(activeCaption?.id ?? '');
  const caption = captions.find((candidate) => candidate.id === captionId) ?? activeCaption;
  const [captionDraft, setCaptionDraft] = useState(caption?.text ?? '');
  const [titleDraft, setTitleDraft] = useState(title?.text ?? '');
  const [ctaText, setCtaText] = useState(project.cta?.text ?? '');
  const [ctaDestination, setCtaDestination] = useState(project.cta?.destination ?? '');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedVideo) {
      return;
    }
    setSourceStart(selectedVideo.sourceStartFrame);
    setSourceEnd(selectedVideo.sourceStartFrame + selectedVideo.sourceDurationFrames);
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!activeCaption) {
      return;
    }
    setCaptionId(activeCaption.id);
    setCaptionDraft(activeCaption.text);
  }, [activeCaption?.id]);

  const visualAssets = useMemo(
    () => assets.filter((asset) => asset.kind === 'video' || asset.kind === 'image'),
    [assets],
  );
  const compatibleVisualAssets = visualAssets.filter((asset) =>
    selectedClip?.kind === 'image' ? asset.kind === 'image' : asset.kind === 'video',
  );
  const audioAssets = useMemo(() => assets.filter((asset) => asset.kind === 'audio'), [assets]);
  const currentAsset =
    selectedClip && (selectedClip.kind === 'video' || selectedClip.kind === 'image')
      ? findEditorAsset(selectedClip.assetId, assets)
      : undefined;
  const currentMusicId = project.tracks
    .flatMap((track) => track.clips)
    .find(
      (clip): clip is AudioClip => clip.kind === 'audio' && clip.metadata['slotId'] === 'music',
    )?.assetId;

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 1800);
  };

  const applyTrim = () => {
    if (!selectedVideo || sourceEnd <= sourceStart) {
      notify('出点必须晚于入点');
      return;
    }
    execute({
      type: 'trim-video',
      clipId: selectedVideo.id,
      sourceStartFrame: sourceStart,
      sourceDurationFrames: sourceEnd - sourceStart,
    });
    notify('镜头裁切已更新');
  };

  return (
    <aside
      aria-label="编辑面板"
      className="studio-inspector flex min-h-0 flex-col rounded-[16px] p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Inspector
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-[#263138]">局部调整</h2>
        </div>
        {message && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
            {message}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 rounded-xl bg-slate-100 p-1">
        {tabs.map((item) => (
          <button
            aria-pressed={tab === item.id}
            className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold transition ${
              tab === item.id
                ? 'bg-white text-[#263138] shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 studio-scrollbar">
        {tab === 'shot' && (
          <div className="space-y-5">
            <div>
              <p className="editor-label">当前镜头</p>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                  {currentAsset && (
                    <PreviewArtwork artwork={currentAsset.artwork} colors={currentAsset.colors} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800">
                    {currentAsset?.name ?? '请选择视频镜头'}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {selectedVideo
                      ? `${(selectedVideo.durationFrames / project.output.frameRate).toFixed(1)} 秒 · ${
                          selectedVideo.muted ? '静音 B-roll' : '保留原声'
                        }`
                      : '时间线中的视频片段'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="editor-label">镜头裁切</p>
                <span className="text-[10px] text-slate-400">项目时长保持不变</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="editor-field">
                  <span>素材入点（帧）</span>
                  <input
                    aria-label="素材入点"
                    min={0}
                    onChange={(event) => setSourceStart(Number(event.target.value))}
                    type="number"
                    value={sourceStart}
                  />
                </label>
                <label className="editor-field">
                  <span>素材出点（帧）</span>
                  <input
                    aria-label="素材出点"
                    min={1}
                    onChange={(event) => setSourceEnd(Number(event.target.value))}
                    type="number"
                    value={sourceEnd}
                  />
                </label>
              </div>
              <button
                className="editor-secondary-button mt-2 w-full"
                disabled={!selectedVideo}
                onClick={applyTrim}
                type="button"
              >
                <Icon className="h-4 w-4" name="scissors" />
                应用裁切
              </button>
            </div>

            <div>
              <p className="editor-label">替换镜头</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {compatibleVisualAssets.map((asset) => (
                  <button
                    aria-label={`替换为 ${asset.name}`}
                    className={`group overflow-hidden rounded-xl border text-left transition ${
                      currentAsset?.id === asset.id
                        ? 'border-[#d6a76d] ring-1 ring-[#d6a76d]'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                    key={asset.id}
                    onClick={() => {
                      if (
                        !selectedClip ||
                        (selectedClip.kind !== 'video' && selectedClip.kind !== 'image')
                      ) {
                        return;
                      }
                      execute({
                        type: 'replace-clip-asset',
                        clipId: selectedClip.id,
                        assetId: asset.id,
                      });
                      notify('镜头已替换');
                    }}
                    type="button"
                  >
                    <div className="relative aspect-[16/9] bg-slate-800">
                      <PreviewArtwork artwork={asset.artwork} colors={asset.colors} />
                    </div>
                    <p className="truncate px-2 pb-2 pt-1.5 text-[10px] font-bold text-slate-600">
                      {asset.name}
                    </p>
                  </button>
                ))}
                {compatibleVisualAssets.length === 0 ? (
                  <p className="col-span-2 rounded-xl bg-slate-50 p-3 text-[10px] leading-4 text-slate-500">
                    当前酒店没有可用于替换的已就绪画面素材。
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {tab === 'copy' && (
          <div className="space-y-5">
            <div>
              <p className="editor-label">视频标题</p>
              <textarea
                aria-label="视频标题"
                className="editor-textarea mt-2"
                onChange={(event) => setTitleDraft(event.target.value)}
                rows={2}
                value={titleDraft}
              />
              <button
                className="editor-secondary-button mt-2 w-full"
                disabled={!title || !titleDraft.trim()}
                onClick={() => {
                  if (!title) return;
                  execute({ type: 'update-title', clipId: title.id, text: titleDraft });
                  notify('标题已更新');
                }}
                type="button"
              >
                应用标题
              </button>
            </div>

            <div>
              <p className="editor-label">字幕段落</p>
              <div className="mt-2 flex gap-1.5">
                {captions.map((item, index) => (
                  <button
                    aria-label={`选择字幕 ${index + 1}`}
                    className={`h-8 flex-1 rounded-lg text-[10px] font-bold transition ${
                      caption?.id === item.id
                        ? 'bg-[#263138] text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    key={item.id}
                    onClick={() => {
                      setCaptionId(item.id);
                      setCaptionDraft(item.text);
                    }}
                    type="button"
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <textarea
                aria-label="字幕文本"
                className="editor-textarea mt-2"
                onChange={(event) => setCaptionDraft(event.target.value)}
                rows={3}
                value={captionDraft}
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
                <span>建议每行不超过 16 个汉字</span>
                <span>{captionDraft.length} / 2000</span>
              </div>
              <button
                className="editor-primary-button mt-2 w-full"
                disabled={!caption || !captionDraft.trim()}
                onClick={() => {
                  if (!caption) return;
                  execute({
                    type: 'update-caption',
                    clipId: caption.id,
                    text: captionDraft,
                  });
                  notify('字幕已更新');
                }}
                type="button"
              >
                应用字幕
              </button>
            </div>
          </div>
        )}

        {tab === 'cta' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#fff7ec] p-3 text-[11px] leading-5 text-[#875b37]">
              CTA 只允许修改已批准的酒店信息，不会自动补写价格、电话或预订承诺。
            </div>
            <label className="block">
              <span className="editor-label">行动文案</span>
              <textarea
                aria-label="CTA 文案"
                className="editor-textarea mt-2"
                onChange={(event) => setCtaText(event.target.value)}
                rows={3}
                value={ctaText}
              />
            </label>
            <label className="block">
              <span className="editor-label">目标地址</span>
              <input
                aria-label="CTA 目标地址"
                className="editor-input mt-2"
                onChange={(event) => setCtaDestination(event.target.value)}
                value={ctaDestination}
              />
            </label>
            <button
              className="editor-primary-button w-full"
              disabled={!project.cta || !ctaText.trim()}
              onClick={() => {
                if (!project.cta) return;
                execute({
                  type: 'update-cta',
                  text: ctaText,
                  action: project.cta.action,
                  destination: ctaDestination.trim() || null,
                });
                notify('CTA 已更新');
              }}
              type="button"
            >
              应用 CTA
            </button>
          </div>
        )}

        {tab === 'music' && (
          <div className="space-y-2">
            <div className="mb-3 rounded-2xl bg-[#eef7f5] p-3">
              <p className="text-[11px] font-bold text-[#3b746c]">背景音乐将自动铺满时间线</p>
              <p className="mt-1 text-[10px] leading-4 text-[#5f817c]">
                替换后保留原音量、循环分段和首尾淡化。
              </p>
            </div>
            {audioAssets.map((asset) => (
              <button
                aria-label={`选择音乐 ${asset.name}`}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                  currentMusicId === asset.id
                    ? 'border-[#4f8d83] bg-[#f1f8f7] shadow-sm'
                    : 'border-slate-200 hover:border-slate-400'
                }`}
                key={asset.id}
                onClick={() => {
                  execute({ type: 'replace-music', assetId: asset.id });
                  notify('背景音乐已替换');
                }}
                type="button"
              >
                <div
                  className="grid h-11 w-11 place-items-center rounded-xl text-white"
                  style={{
                    background: `linear-gradient(135deg, ${asset.colors[0]}, ${asset.colors[1]})`,
                  }}
                >
                  <Icon className="h-5 w-5" name="music" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-700">{asset.name}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{asset.detail}</p>
                </div>
                {currentMusicId === asset.id && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#4f8d83] text-white">
                    <Icon className="h-3.5 w-3.5" name="check" />
                  </span>
                )}
              </button>
            ))}
            {audioAssets.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-3 text-[10px] leading-4 text-slate-500">
                当前酒店没有可用于替换的已就绪音频素材。
              </p>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
