import { getEditorScenes } from '@hotelcut/editor';
import type { Clip, HotelVideoProjectV1 } from '@hotelcut/timeline';
import { useEffect, useMemo, useState } from 'react';

import { demoProject } from './editor/demo-data';
import { Icon, type IconName } from './editor/icon';
import { Inspector } from './editor/inspector';
import { SceneRail } from './editor/scene-rail';
import { SimpleTimeline } from './editor/simple-timeline';
import { StudioPreview } from './editor/studio-preview';
import {
  useProjectEditor,
  type SaveProjectRevision,
  type SaveState,
} from './editor/use-project-editor';

interface AppProps {
  initialProject?: HotelVideoProjectV1;
  initialRevision?: number;
  autosaveDelayMs?: number;
  onSaveRevision?: SaveProjectRevision;
}

const navigation: Array<{ label: string; icon: IconName; active?: boolean }> = [
  { label: '项目', icon: 'projects', active: true },
  { label: '素材', icon: 'assets' },
  { label: '模板', icon: 'templates' },
  { label: '品牌', icon: 'brand' },
];

const saveLabels: Record<SaveState, string> = {
  saved: '所有修改已保存',
  pending: '等待自动保存',
  saving: '正在自动保存',
  error: '保存失败',
};

async function saveDemoRevision(
  _project: HotelVideoProjectV1,
  baseRevision: number,
): Promise<number> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 140));
  return baseRevision + 1;
}

export function App({
  initialProject = demoProject,
  initialRevision = 1,
  autosaveDelayMs = 800,
  onSaveRevision = saveDemoRevision,
}: AppProps) {
  const editor = useProjectEditor(initialProject, onSaveRevision, initialRevision, autosaveDelayMs);
  const scenes = useMemo(() => getEditorScenes(editor.project), [editor.project]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    () => scenes[0]?.clipId ?? null,
  );
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const interval = window.setInterval(() => {
      setCurrentFrame((frame) => {
        const next = frame + Math.max(1, Math.round(editor.project.output.frameRate / 10));
        return next >= editor.project.output.durationFrames ? 0 : next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [editor.project.output.durationFrames, editor.project.output.frameRate, isPlaying]);

  const selectClip = (clip: Clip) => {
    setSelectedClipId(clip.id);
    setCurrentFrame(clip.startFrame);
  };

  return (
    <main className="min-h-screen bg-[#eef1ef] text-[#263138]">
      <div className="flex min-h-screen">
        <nav
          aria-label="主导航"
          className="sticky top-0 hidden h-screen w-[82px] shrink-0 flex-col items-center border-r border-white/70 bg-[#24343c] py-5 text-white shadow-[12px_0_40px_rgba(27,42,48,.12)] lg:flex"
        >
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e2b174] text-xl font-black text-[#263138] shadow-lg">
            H
          </div>
          <div className="mt-10 flex w-full flex-col items-center gap-2 px-2">
            {navigation.map((item) => (
              <button
                aria-current={item.active ? 'page' : undefined}
                aria-label={item.label}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl py-3 text-[10px] font-bold transition ${
                  item.active
                    ? 'bg-white/12 text-white'
                    : 'text-white/45 hover:bg-white/5 hover:text-white/80'
                }`}
                key={item.label}
                type="button"
              >
                <Icon className="h-[19px] w-[19px]" name={item.icon} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-auto">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-[#49626b] text-xs font-black">
              云
            </div>
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <header className="flex min-h-[76px] items-center justify-between border-b border-white/80 bg-white/60 px-5 backdrop-blur-xl xl:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <span>视频项目</span>
                <Icon className="h-3 w-3" name="chevron" />
                <span className="truncate text-slate-500">{editor.project.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <h1 className="truncate text-xl font-black tracking-[-0.025em] text-[#263138]">
                  HotelCut Studio
                </h1>
                <span className="rounded-full bg-[#edf6f3] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#3f7c73]">
                  M5 Editor
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 sm:flex">
                <Icon
                  className={`h-4 w-4 ${
                    editor.saveState === 'error'
                      ? 'text-rose-500'
                      : editor.saveState === 'saved'
                        ? 'text-emerald-600'
                        : 'text-amber-500'
                  }`}
                  name={editor.saveState === 'saved' ? 'check' : 'cloud'}
                />
                <div className="leading-none">
                  <p className="text-[10px] font-bold text-slate-600">
                    {saveLabels[editor.saveState]}
                  </p>
                  <p className="mt-1 text-[9px] text-slate-400">修订 {editor.revision}</p>
                </div>
              </div>
              <button
                aria-label="撤销"
                className="topbar-icon-button"
                disabled={!editor.canUndo}
                onClick={editor.undo}
                type="button"
              >
                <Icon className="h-[18px] w-[18px]" name="undo" />
              </button>
              <button
                aria-label="重做"
                className="topbar-icon-button"
                disabled={!editor.canRedo}
                onClick={editor.redo}
                type="button"
              >
                <Icon className="h-[18px] w-[18px]" name="redo" />
              </button>
              <button
                className="hidden rounded-xl bg-[#263138] px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#172126] md:block"
                title="渲染将在 M6 开放"
                type="button"
              >
                完成编辑
              </button>
            </div>
          </header>

          <div className="p-4 xl:p-6">
            <div className="grid min-h-[620px] gap-4 xl:grid-cols-[260px_minmax(360px,1fr)_340px]">
              <SceneRail
                onSelect={(clipId, startFrame) => {
                  setSelectedClipId(clipId);
                  setCurrentFrame(startFrame);
                }}
                project={editor.project}
                selectedClipId={selectedClipId}
              />

              <StudioPreview
                currentFrame={currentFrame}
                isPlaying={isPlaying}
                onScrub={setCurrentFrame}
                onTogglePlayback={() => setIsPlaying((playing) => !playing)}
                project={editor.project}
              />

              <Inspector
                currentFrame={currentFrame}
                execute={editor.execute}
                project={editor.project}
                selectedClipId={selectedClipId}
              />
            </div>

            <div className="mt-4">
              <SimpleTimeline
                currentFrame={currentFrame}
                onScrub={setCurrentFrame}
                onSelectClip={selectClip}
                project={editor.project}
                selectedClipId={selectedClipId}
              />
            </div>

            <div className="mt-3 flex items-center justify-between px-2 text-[10px] text-slate-400">
              <p>
                {editor.saveError ??
                  (editor.lastSavedAt
                    ? `上次保存 ${editor.lastSavedAt.toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}`
                    : '修改将在停止操作后自动保存')}
              </p>
              <p className="font-semibold">HotelVideoProject v{editor.project.schemaVersion}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
