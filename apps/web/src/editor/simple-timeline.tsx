import type { Clip, HotelVideoProjectV1 } from '@hotelcut/timeline';

import { findEditorAsset } from './demo-data';

interface SimpleTimelineProps {
  project: HotelVideoProjectV1;
  currentFrame: number;
  selectedClipId: string | null;
  onSelectClip: (clip: Clip) => void;
  onScrub: (frame: number) => void;
}

function clipLabel(clip: Clip): string {
  if (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'audio') {
    return findEditorAsset(clip.assetId)?.name ?? clip.kind;
  }
  return clip.text;
}

function clipColor(clip: Clip): string {
  if (clip.kind === 'caption') {
    return 'from-[#8b73b9] to-[#7054a8]';
  }
  if (clip.kind === 'audio') {
    return 'from-[#4f8d83] to-[#3b746c]';
  }
  if (clip.kind === 'text') {
    return 'from-[#ca8a51] to-[#a9683c]';
  }
  if (clip.metadata['slotId']?.toString().startsWith('broll')) {
    return 'from-[#d39a61] to-[#b77744]';
  }
  return 'from-[#687c8d] to-[#526775]';
}

export function SimpleTimeline({
  project,
  currentFrame,
  selectedClipId,
  onSelectClip,
  onScrub,
}: SimpleTimelineProps) {
  const visibleTracks = project.tracks.filter((track) => track.enabled);

  return (
    <section
      aria-label="简化时间线"
      className="rounded-[24px] border border-white/70 bg-white/80 px-4 pb-4 pt-3 shadow-[0_18px_60px_rgba(38,48,52,0.09)] backdrop-blur-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Timeline
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {project.output.durationFrames / project.output.frameRate}s
          </span>
        </div>
        <p className="text-[10px] font-medium text-slate-400">拖动游标预览 · 点击片段编辑</p>
      </div>

      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <div />
        <div className="relative flex justify-between px-0.5 text-[9px] font-semibold text-slate-400">
          {[0, 5, 10, 15, 20, 25, 30].map((second) => (
            <span key={second}>{second}s</span>
          ))}
        </div>
        {visibleTracks.map((track) => (
          <div className="contents" key={track.id}>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  track.kind === 'audio'
                    ? 'bg-[#4f8d83]'
                    : track.kind === 'caption'
                      ? 'bg-[#8b73b9]'
                      : track.kind === 'overlay'
                        ? 'bg-[#ca8a51]'
                        : 'bg-[#71818d]'
                }`}
              />
              <span className="truncate">{track.name}</span>
            </div>
            <div className="relative h-8 overflow-hidden rounded-lg bg-slate-100/80 ring-1 ring-inset ring-slate-200/70">
              {track.clips.map((clip) => (
                <button
                  aria-label={`编辑片段 ${clipLabel(clip)}`}
                  className={`absolute top-1 h-6 overflow-hidden rounded-md bg-gradient-to-r px-2 text-left text-[9px] font-semibold text-white shadow-sm transition hover:brightness-110 ${clipColor(
                    clip,
                  )} ${selectedClipId === clip.id ? 'ring-2 ring-[#24343c] ring-offset-1' : ''}`}
                  key={clip.id}
                  onClick={() => onSelectClip(clip)}
                  style={{
                    left: `${(clip.startFrame / project.output.durationFrames) * 100}%`,
                    width: `${(clip.durationFrames / project.output.durationFrames) * 100}%`,
                  }}
                  title={clipLabel(clip)}
                  type="button"
                >
                  <span className="block truncate">{clipLabel(clip)}</span>
                </button>
              ))}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-[#e36d50] shadow-[0_0_0_1px_rgba(255,255,255,.7)]"
                style={{ left: `${(currentFrame / project.output.durationFrames) * 100}%` }}
              >
                <span className="absolute -left-[3px] -top-0.5 h-1.5 w-1.5 rotate-45 bg-[#e36d50]" />
              </div>
            </div>
          </div>
        ))}
        <div />
        <input
          aria-label="时间线游标"
          className="timeline-range mt-1 w-full"
          max={project.output.durationFrames - 1}
          min={0}
          onChange={(event) => onScrub(Number(event.target.value))}
          type="range"
          value={currentFrame}
        />
      </div>
    </section>
  );
}
