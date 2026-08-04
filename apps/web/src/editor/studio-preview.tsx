import { getActiveClips } from '@hotelcut/editor';
import type { CaptionClip, HotelVideoProjectV1, TextClip } from '@hotelcut/timeline';

import { findEditorAsset, type EditorAsset } from './editor-asset';
import { Icon } from './icon';
import { PreviewArtwork } from './preview-artwork';

interface StudioPreviewProps {
  assets: readonly EditorAsset[];
  project: HotelVideoProjectV1;
  currentFrame: number;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onScrub: (frame: number) => void;
}

function formatTime(frame: number, frameRate: number): string {
  const totalSeconds = frame / frameRate;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export function StudioPreview({
  assets,
  project,
  currentFrame,
  isPlaying,
  onTogglePlayback,
  onScrub,
}: StudioPreviewProps) {
  const activeClips = getActiveClips(project, currentFrame);
  const activeVisual = activeClips
    .filter((clip) => clip.kind === 'video' || clip.kind === 'image')
    .at(-1);
  const activeCaption = activeClips.find((clip): clip is CaptionClip => clip.kind === 'caption');
  const activeTitle = activeClips.find((clip): clip is TextClip => clip.kind === 'text');
  const asset =
    activeVisual && 'assetId' in activeVisual
      ? findEditorAsset(activeVisual.assetId, assets)
      : undefined;
  const ctaActive =
    project.cta &&
    project.cta.startFrame <= currentFrame &&
    currentFrame < project.cta.startFrame + project.cta.durationFrames;

  return (
    <section
      aria-label="视频预览"
      className="studio-preview-stage flex min-w-0 flex-col items-center rounded-[16px] p-4"
    >
      <div className="mb-3 flex w-full items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Preview
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">9:16 · 1080 × 1920</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          实时预览
        </div>
      </div>

      <div className="relative aspect-[9/16] h-[min(53vh,560px)] min-h-[430px] overflow-hidden rounded-[24px] bg-slate-900 shadow-[0_20px_48px_rgba(12,22,28,0.26)] ring-1 ring-black/10">
        {asset ? (
          <PreviewArtwork artwork={asset.artwork} colors={asset.colors} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-500 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,15,18,.16),transparent_30%,transparent_62%,rgba(6,15,18,.68))]" />
        <div className="absolute left-5 right-5 top-5 flex items-center justify-between text-[10px] font-semibold tracking-[0.14em] text-white/80">
          <span>HotelCut</span>
          <span className="rounded-full bg-black/20 px-2 py-1 backdrop-blur-md">M5 PREVIEW</span>
        </div>

        {activeTitle && (
          <div className="absolute left-6 right-6 top-[16%] text-center">
            <p className="text-[29px] font-black leading-[1.16] tracking-[-0.04em] text-white drop-shadow-lg">
              {activeTitle.text}
            </p>
            <div className="mx-auto mt-3 h-0.5 w-10 rounded-full bg-[#e7b779]" />
          </div>
        )}

        <div className="absolute bottom-5 left-5 right-5">
          {activeCaption && (
            <p
              aria-live="polite"
              className="mx-auto mb-3 w-fit max-w-full rounded-lg bg-black/58 px-3 py-1.5 text-center text-[15px] font-bold leading-6 text-white shadow-lg backdrop-blur-sm"
            >
              {activeCaption.text}
            </p>
          )}
          {ctaActive && project.cta && (
            <div className="flex items-center justify-between rounded-xl bg-[#e3b276] px-3.5 py-2.5 text-[#263138] shadow-xl">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-60">
                  Weekend
                </p>
                <p className="mt-0.5 text-[13px] font-black">{project.cta.text}</p>
              </div>
              <span className="rounded-lg bg-[#263138] px-2.5 py-1.5 text-[10px] font-bold text-white">
                立即查看
              </span>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 h-[3px] bg-white/20 right-0">
          <div
            className="h-full rounded-r-full bg-[#e7b779]"
            style={{ width: `${(currentFrame / project.output.durationFrames) * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex w-full items-center gap-3">
        <button
          aria-label={isPlaying ? '暂停预览' : '播放预览'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#263138] text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#11191d]"
          onClick={onTogglePlayback}
          type="button"
        >
          <Icon className="h-4 w-4" name={isPlaying ? 'pause' : 'play'} />
        </button>
        <span className="w-[52px] text-xs font-semibold tabular-nums text-slate-600">
          {formatTime(currentFrame, project.output.frameRate)}
        </span>
        <input
          aria-label="预览进度"
          className="preview-range min-w-0 flex-1"
          max={project.output.durationFrames - 1}
          min={0}
          onChange={(event) => onScrub(Number(event.target.value))}
          type="range"
          value={currentFrame}
        />
        <span className="w-[52px] text-right text-xs font-semibold tabular-nums text-slate-400">
          {formatTime(project.output.durationFrames, project.output.frameRate)}
        </span>
      </div>
      <p className="mt-2 max-w-[340px] truncate text-center text-xs font-medium text-slate-500">
        {asset?.name ?? '等待画面'}
      </p>
    </section>
  );
}
