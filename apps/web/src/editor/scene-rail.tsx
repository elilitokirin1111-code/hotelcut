import { getEditorScenes } from '@hotelcut/editor';
import type { HotelVideoProjectV1 } from '@hotelcut/timeline';

import { findEditorAsset } from './demo-data';
import { PreviewArtwork } from './preview-artwork';

interface SceneRailProps {
  project: HotelVideoProjectV1;
  selectedClipId: string | null;
  onSelect: (clipId: string, startFrame: number) => void;
}

const slotNames: Record<string, string> = {
  'host.welcome': '开场问候',
  'host.room': '客房介绍',
  'host.booking': '入住邀请',
  'broll.exterior': '酒店外观',
  'broll.room': '湖景客房',
  'broll.breakfast': '早餐氛围',
};

function formatDuration(frames: number, frameRate: number): string {
  return `${(frames / frameRate).toFixed(1)}s`;
}

export function SceneRail({ project, selectedClipId, onSelect }: SceneRailProps) {
  const scenes = getEditorScenes(project);

  return (
    <aside
      aria-label="场景列表"
      className="flex min-h-0 flex-col rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_70px_rgba(38,48,52,0.09)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Scenes</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-[#263138]">场景列表</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
          {scenes.length}
        </span>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 studio-scrollbar">
        {scenes.map((scene, index) => {
          const asset = findEditorAsset(scene.assetId);
          const selected = scene.clipId === selectedClipId;
          return (
            <button
              aria-label={`选择镜头 ${index + 1} ${asset?.name ?? scene.label}`}
              className={`group flex w-full gap-3 rounded-2xl border p-2 text-left transition ${
                selected
                  ? 'border-[#d6a76d] bg-[#fff9f0] shadow-[0_8px_24px_rgba(151,104,57,.12)]'
                  : 'border-transparent bg-white/55 hover:border-slate-200 hover:bg-white'
              }`}
              key={scene.clipId}
              onClick={() => onSelect(scene.clipId, scene.startFrame)}
              type="button"
            >
              <div className="relative h-[66px] w-[76px] shrink-0 overflow-hidden rounded-xl bg-slate-800">
                {asset && <PreviewArtwork artwork={asset.artwork} colors={asset.colors} />}
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13px] font-bold text-slate-800">
                    {slotNames[scene.label] ?? scene.label}
                  </p>
                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">
                    {formatDuration(scene.durationFrames, project.output.frameRate)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">{asset?.name}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      scene.label.startsWith('broll') ? 'bg-[#d69c62]' : 'bg-[#4e8580]'
                    }`}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    {scene.label.startsWith('broll') ? 'B-roll' : 'A-roll'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
