import type { EditorCommand } from '@hotelcut/editor';
import type {
  AudioClip,
  CaptionClip,
  Clip,
  HotelVideoProjectV1,
  TextClip,
} from '@hotelcut/timeline';
import { useEffect, useMemo, useState } from 'react';

import { findEditorAsset, type EditorAsset } from './editor-asset';
import { Icon, type IconName } from './icon';
import { PreviewArtwork } from './preview-artwork';

type InspectorTab = 'shot' | 'timing' | 'look' | 'motion' | 'copy' | 'cta' | 'sound' | 'music';

interface InspectorProps {
  assets: readonly EditorAsset[];
  project: HotelVideoProjectV1;
  currentFrame: number;
  selectedClipId: string | null;
  execute: (command: EditorCommand) => void;
}

const tabs: Array<{ id: InspectorTab; label: string; icon: IconName }> = [
  { id: 'look', label: '调色', icon: 'replace' },
  { id: 'motion', label: '运动', icon: 'play' },
  { id: 'timing', label: '时长', icon: 'scissors' },
  { id: 'sound', label: '音量', icon: 'music' },
  { id: 'shot', label: '镜头', icon: 'scissors' },
  { id: 'copy', label: '文案', icon: 'copy' },
  { id: 'cta', label: 'CTA', icon: 'replace' },
  { id: 'music', label: '音乐', icon: 'music' },
];

function allClips(project: HotelVideoProjectV1): Clip[] {
  return project.tracks.flatMap((track) => track.clips);
}

export function Inspector({
  assets,
  project,
  currentFrame,
  selectedClipId,
  execute,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('shot');
  const selectedClip = allClips(project).find((clip) => clip.id === selectedClipId);
  const selectedVideo = selectedClip?.kind === 'video' ? selectedClip : null;
  const selectedTrack = project.tracks.find((track) =>
    track.clips.some((clip) => clip.id === selectedClipId),
  );
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
  const [timelineStart, setTimelineStart] = useState(0);
  const [timelineDuration, setTimelineDuration] = useState(1);
  const [clipVolume, setClipVolume] = useState(1);
  const [clipMuted, setClipMuted] = useState(false);
  const [fadeInFrames, setFadeInFrames] = useState(0);
  const [fadeOutFrames, setFadeOutFrames] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [hueRotateDegrees, setHueRotateDegrees] = useState(0);
  const [blurPx, setBlurPx] = useState(0);
  const [transitionType, setTransitionType] = useState<'cut' | 'dissolve' | 'fade' | 'wipe'>('cut');
  const [transitionDuration, setTransitionDuration] = useState(12);
  const [keyframeX, setKeyframeX] = useState(0.5);
  const [keyframeY, setKeyframeY] = useState(0.5);
  const [keyframeScale, setKeyframeScale] = useState(1);
  const [keyframeRotation, setKeyframeRotation] = useState(0);
  const [keyframeOpacity, setKeyframeOpacity] = useState(1);
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

  useEffect(() => {
    if (!selectedClip) return;
    setTimelineStart(selectedClip.startFrame);
    setTimelineDuration(selectedClip.durationFrames);
    if (selectedClip.kind === 'video' || selectedClip.kind === 'audio') {
      setClipVolume(selectedClip.volume);
      setClipMuted(selectedClip.kind === 'video' ? selectedClip.muted : false);
      if (selectedClip.kind === 'audio') {
        setFadeInFrames(selectedClip.fadeInFrames);
        setFadeOutFrames(selectedClip.fadeOutFrames);
      }
    }
    if (selectedClip.kind !== 'audio') {
      setBrightness(selectedClip.colorAdjustments.brightness);
      setContrast(selectedClip.colorAdjustments.contrast);
      setSaturation(selectedClip.colorAdjustments.saturation);
      setHueRotateDegrees(selectedClip.colorAdjustments.hueRotateDegrees);
      setBlurPx(selectedClip.colorAdjustments.blurPx);
      setTransitionType(selectedClip.transitionOut?.type ?? 'cut');
      setTransitionDuration(selectedClip.transitionOut?.durationFrames ?? 12);
      setKeyframeX(selectedClip.transform.x);
      setKeyframeY(selectedClip.transform.y);
      setKeyframeScale(selectedClip.transform.scaleX);
      setKeyframeRotation(selectedClip.transform.rotationDegrees);
      setKeyframeOpacity(selectedClip.transform.opacity);
    }
  }, [selectedClip?.id]);

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

      <div className="mt-4 grid grid-cols-3 rounded-xl bg-slate-100 p-1">
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

        {tab === 'shot' && selectedTrack ? (
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <p className="editor-label">插入素材到播放头</p>
            <p className="text-[10px] leading-4 text-slate-400">
              只会插入到当前选中轨道的空白时间段，不会覆盖已有片段。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {visualAssets
                .filter((asset) =>
                  selectedTrack.kind === 'video' ? asset.kind === 'video' : asset.kind === 'image',
                )
                .slice(0, 6)
                .map((asset) => {
                  const durationFrames = Math.min(asset.durationFrames, 90);
                  return (
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-left text-[10px] font-bold text-slate-600 hover:border-[#d6a76d]"
                      key={`insert-${asset.id}`}
                      onClick={() => {
                        if (selectedTrack.kind !== 'video' && selectedTrack.kind !== 'overlay')
                          return;
                        const id = crypto.randomUUID();
                        if (asset.kind === 'video') {
                          execute({
                            type: 'insert-video-clip',
                            id,
                            trackId: selectedTrack.id,
                            assetId: asset.id,
                            startFrame: currentFrame,
                            durationFrames,
                            sourceStartFrame: 0,
                            sourceDurationFrames: durationFrames,
                          });
                        } else {
                          execute({
                            type: 'insert-image-clip',
                            id,
                            trackId: selectedTrack.id,
                            assetId: asset.id,
                            startFrame: currentFrame,
                            durationFrames,
                          });
                        }
                        notify('素材已插入播放头');
                      }}
                      type="button"
                    >
                      <span className="block truncate">＋ {asset.name}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        ) : null}

        {tab === 'timing' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#eef7f5] p-3 text-[11px] leading-5 text-[#3b746c]">
              在时间线上拖动片段可调整位置；这里可精确输入帧数。系统会阻止同一轨道的片段重叠。
            </div>
            <label className="editor-field">
              <span>时间线起点（帧）</span>
              <input
                aria-label="时间线起点"
                min={0}
                onChange={(event) => setTimelineStart(Number(event.target.value))}
                type="number"
                value={timelineStart}
              />
            </label>
            <button
              className="editor-secondary-button w-full"
              disabled={!selectedClip || timelineStart === selectedClip.startFrame}
              onClick={() => {
                if (!selectedClip) return;
                execute({ type: 'move-clip', clipId: selectedClip.id, startFrame: timelineStart });
                notify('片段位置已更新');
              }}
              type="button"
            >
              应用位置
            </button>
            <label className="editor-field">
              <span>片段时长（帧）</span>
              <input
                aria-label="片段时长"
                min={1}
                onChange={(event) => setTimelineDuration(Number(event.target.value))}
                type="number"
                value={timelineDuration}
              />
            </label>
            <p className="text-[10px] leading-4 text-slate-400">
              视频调整时长会自动换算播放速度；字幕调整时长会清除过期的逐词时间码。
            </p>
            <button
              className="editor-secondary-button w-full"
              disabled={
                !selectedClip ||
                selectedClip.kind === 'audio' ||
                timelineDuration === selectedClip.durationFrames
              }
              onClick={() => {
                if (!selectedClip || selectedClip.kind === 'audio') return;
                execute({
                  type: 'resize-clip',
                  clipId: selectedClip.id,
                  durationFrames: timelineDuration,
                });
                notify('片段时长已更新');
              }}
              type="button"
            >
              应用时长
            </button>
          </div>
        )}

        {tab === 'timing' && selectedClip ? (
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <button
              className="editor-secondary-button w-full"
              disabled={
                (selectedClip.kind !== 'video' && selectedClip.kind !== 'image') ||
                currentFrame <= selectedClip.startFrame ||
                currentFrame >= selectedClip.startFrame + selectedClip.durationFrames
              }
              onClick={() => {
                if (selectedClip.kind !== 'video' && selectedClip.kind !== 'image') return;
                execute({
                  type: 'split-visual-clip',
                  clipId: selectedClip.id,
                  atFrame: currentFrame,
                  newClipId: crypto.randomUUID(),
                });
                notify('片段已在播放头拆分');
              }}
              type="button"
            >
              在播放头拆分片段
            </button>
            <button
              className="editor-secondary-button w-full text-rose-600"
              onClick={() => {
                execute({ type: 'delete-clip', clipId: selectedClip.id });
                notify('片段已删除');
              }}
              type="button"
            >
              删除当前片段
            </button>
          </div>
        ) : null}

        {tab === 'look' && (
          <div className="space-y-4">
            {selectedClip?.kind === 'video' || selectedClip?.kind === 'image' ? (
              <>
                <div className="rounded-2xl bg-[#fff7ec] p-3 text-[11px] leading-5 text-[#875b37]">
                  调色与转场会写入项目时间线，并由最终 Remotion 渲染器真实执行。
                </div>
                {[
                  ['亮度', brightness, setBrightness, -1, 1, 0.05],
                  ['对比度', contrast, setContrast, 0, 3, 0.05],
                  ['饱和度', saturation, setSaturation, 0, 3, 0.05],
                  ['色相', hueRotateDegrees, setHueRotateDegrees, -180, 180, 1],
                  ['模糊', blurPx, setBlurPx, 0, 40, 0.5],
                ].map(([label, value, setter, min, max, step]) => (
                  <label className="editor-field" key={String(label)}>
                    <span>{String(label)}</span>
                    <input
                      aria-label={String(label)}
                      max={Number(max)}
                      min={Number(min)}
                      onChange={(event) =>
                        (setter as (value: number) => void)(Number(event.target.value))
                      }
                      step={Number(step)}
                      type="range"
                      value={Number(value)}
                    />
                    <strong className="mt-1 block text-right text-xs text-slate-600">
                      {Number(value).toFixed(2)}
                    </strong>
                  </label>
                ))}
                <button
                  className="editor-primary-button w-full"
                  onClick={() => {
                    if (
                      !selectedClip ||
                      (selectedClip.kind !== 'video' && selectedClip.kind !== 'image')
                    )
                      return;
                    execute({
                      type: 'update-visual-effects',
                      clipId: selectedClip.id,
                      colorAdjustments: {
                        brightness,
                        contrast,
                        saturation,
                        hueRotateDegrees,
                        blurPx,
                      },
                    });
                    notify('调色已更新');
                  }}
                  type="button"
                >
                  应用调色
                </button>
                <label className="editor-field">
                  <span>片段出场转场</span>
                  <select
                    aria-label="片段出场转场"
                    onChange={(event) =>
                      setTransitionType(event.target.value as typeof transitionType)
                    }
                    value={transitionType}
                  >
                    <option value="cut">硬切</option>
                    <option value="dissolve">叠化</option>
                    <option value="fade">淡入淡出</option>
                    <option value="wipe">擦除</option>
                  </select>
                </label>
                {transitionType !== 'cut' ? (
                  <label className="editor-field">
                    <span>转场时长（帧）</span>
                    <input
                      aria-label="转场时长"
                      min={1}
                      onChange={(event) => setTransitionDuration(Number(event.target.value))}
                      type="number"
                      value={transitionDuration}
                    />
                  </label>
                ) : null}
                <button
                  className="editor-secondary-button w-full"
                  onClick={() => {
                    if (
                      !selectedClip ||
                      (selectedClip.kind !== 'video' && selectedClip.kind !== 'image')
                    )
                      return;
                    execute({
                      type: 'update-clip-transition',
                      clipId: selectedClip.id,
                      edge: 'out',
                      transition:
                        transitionType === 'cut'
                          ? { type: 'cut', durationFrames: 0, easing: 'linear' }
                          : {
                              type: transitionType,
                              durationFrames: transitionDuration,
                              easing: 'ease-in-out',
                            },
                    });
                    notify('转场已更新');
                  }}
                  type="button"
                >
                  应用转场
                </button>
              </>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                请选择视频或图片片段。
              </p>
            )}
          </div>
        )}

        {tab === 'motion' && (
          <div className="space-y-4">
            {selectedClip && selectedClip.kind !== 'audio' ? (
              <>
                <div className="rounded-2xl bg-[#eef7f5] p-3 text-[11px] leading-5 text-[#3b746c]">
                  在当前播放头位置新增或覆盖关键帧。关键帧控制位置、缩放、旋转和透明度，并在最终渲染中插值。
                </div>
                <label className="editor-field">
                  <span>X 位置</span>
                  <input
                    aria-label="关键帧 X 位置"
                    max={1}
                    min={0}
                    onChange={(event) => setKeyframeX(Number(event.target.value))}
                    step={0.01}
                    type="range"
                    value={keyframeX}
                  />
                </label>
                <label className="editor-field">
                  <span>Y 位置</span>
                  <input
                    aria-label="关键帧 Y 位置"
                    max={1}
                    min={0}
                    onChange={(event) => setKeyframeY(Number(event.target.value))}
                    step={0.01}
                    type="range"
                    value={keyframeY}
                  />
                </label>
                <label className="editor-field">
                  <span>缩放</span>
                  <input
                    aria-label="关键帧缩放"
                    max={4}
                    min={0.1}
                    onChange={(event) => setKeyframeScale(Number(event.target.value))}
                    step={0.01}
                    type="range"
                    value={keyframeScale}
                  />
                </label>
                <label className="editor-field">
                  <span>旋转</span>
                  <input
                    aria-label="关键帧旋转"
                    max={360}
                    min={-360}
                    onChange={(event) => setKeyframeRotation(Number(event.target.value))}
                    step={1}
                    type="range"
                    value={keyframeRotation}
                  />
                </label>
                <label className="editor-field">
                  <span>透明度</span>
                  <input
                    aria-label="关键帧透明度"
                    max={1}
                    min={0}
                    onChange={(event) => setKeyframeOpacity(Number(event.target.value))}
                    step={0.01}
                    type="range"
                    value={keyframeOpacity}
                  />
                </label>
                <button
                  className="editor-primary-button w-full"
                  disabled={
                    currentFrame < selectedClip.startFrame ||
                    currentFrame >= selectedClip.startFrame + selectedClip.durationFrames
                  }
                  onClick={() => {
                    const frame = currentFrame - selectedClip.startFrame;
                    if (frame < 0 || frame >= selectedClip.durationFrames) return;
                    execute({
                      type: 'upsert-transform-keyframe',
                      clipId: selectedClip.id,
                      keyframe: {
                        frame,
                        x: keyframeX,
                        y: keyframeY,
                        scaleX: keyframeScale,
                        scaleY: keyframeScale,
                        rotationDegrees: keyframeRotation,
                        opacity: keyframeOpacity,
                      },
                    });
                    notify('关键帧已保存');
                  }}
                  type="button"
                >
                  在当前播放头添加关键帧
                </button>
              </>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                请选择视频、图片、标题或字幕片段。
              </p>
            )}
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

        {tab === 'sound' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#eef7f5] p-3 text-[11px] leading-5 text-[#3b746c]">
              可单独微调口播、原声或音乐片段音量；最终渲染仍会经过现有的音频质量检测。
            </div>
            {selectedClip?.kind === 'video' || selectedClip?.kind === 'audio' ? (
              <>
                <label className="editor-field">
                  <span>音量（0–200%）</span>
                  <input
                    aria-label="片段音量"
                    max={2}
                    min={0}
                    onChange={(event) => setClipVolume(Number(event.target.value))}
                    step={0.05}
                    type="range"
                    value={clipVolume}
                  />
                  <strong className="mt-1 block text-right text-xs text-slate-600">
                    {Math.round(clipVolume * 100)}%
                  </strong>
                </label>
                {selectedClip.kind === 'video' ? (
                  <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                    静音原声
                    <input
                      aria-label="静音原声"
                      checked={clipMuted}
                      onChange={(event) => setClipMuted(event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                ) : null}
                {selectedClip.kind === 'audio' ? (
                  <>
                    <label className="editor-field">
                      <span>淡入（帧）</span>
                      <input
                        aria-label="淡入帧数"
                        min={0}
                        onChange={(event) => setFadeInFrames(Number(event.target.value))}
                        type="number"
                        value={fadeInFrames}
                      />
                    </label>
                    <label className="editor-field">
                      <span>淡出（帧）</span>
                      <input
                        aria-label="淡出帧数"
                        min={0}
                        onChange={(event) => setFadeOutFrames(Number(event.target.value))}
                        type="number"
                        value={fadeOutFrames}
                      />
                    </label>
                  </>
                ) : null}
                <button
                  className="editor-primary-button w-full"
                  onClick={() => {
                    if (
                      !selectedClip ||
                      (selectedClip.kind !== 'video' && selectedClip.kind !== 'audio')
                    )
                      return;
                    if (selectedClip.kind === 'audio') {
                      execute({
                        type: 'update-audio-mix',
                        clipId: selectedClip.id,
                        volume: clipVolume,
                        fadeInFrames,
                        fadeOutFrames,
                      });
                    } else {
                      execute({
                        type: 'update-clip-volume',
                        clipId: selectedClip.id,
                        volume: clipVolume,
                        muted: clipMuted,
                      });
                    }
                    notify('片段音量已更新');
                  }}
                  type="button"
                >
                  应用音量
                </button>
              </>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                请从时间线选择视频或音频片段后再调整音量。
              </p>
            )}
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
