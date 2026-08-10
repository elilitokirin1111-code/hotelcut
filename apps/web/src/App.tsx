import { getEditorScenes } from '@hotelcut/editor';
import type { Clip, HotelVideoProjectV1 } from '@hotelcut/timeline';
import { useEffect, useMemo, useState } from 'react';

import type { EditorAsset } from './editor/editor-asset';
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
  assets: readonly EditorAsset[];
  initialProject: HotelVideoProjectV1;
  initialRevision: number;
  autosaveDelayMs?: number;
  onSaveRevision: SaveProjectRevision;
}

export interface ProjectStudioProps {
  assets: readonly EditorAsset[];
  autosaveDelayMs?: number;
  embedded?: boolean;
  initialProject: HotelVideoProjectV1;
  initialRevision: number;
  onClose?: () => void;
  onReload?: () => void | Promise<void>;
  onSaveRevision: SaveProjectRevision;
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

export function ProjectStudio({
  assets,
  initialProject,
  initialRevision,
  autosaveDelayMs = 800,
  onSaveRevision,
  embedded = false,
  onClose,
  onReload,
}: ProjectStudioProps) {
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const hasCommandKey = event.metaKey || event.ctrlKey;
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((playing) => !playing);
      } else if (hasCommandKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void editor.saveNow();
      } else if (hasCommandKey && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        editor.redo();
      } else if (hasCommandKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        editor.undo();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClipId) {
        event.preventDefault();
        editor.execute({ type: 'delete-clip', clipId: selectedClipId });
        setSelectedClipId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, selectedClipId]);

  const selectClip = (clip: Clip) => {
    setSelectedClipId(clip.id);
    setCurrentFrame(clip.startFrame);
  };

  return (
    <main
      aria-label="HotelCut Studio"
      className={`hotelcut-studio ${embedded ? 'min-h-[720px] rounded-[22px]' : 'min-h-screen'} overflow-hidden`}
    >
      <div className={`flex ${embedded ? 'min-h-[720px]' : 'min-h-screen'}`}>
        <nav
          aria-label="主导航"
          className={`${embedded ? 'hidden' : 'sticky top-0 hidden lg:flex'} h-screen w-[82px] shrink-0 flex-col items-center border-r border-white/70 bg-[#24343c] py-5 text-white shadow-[12px_0_40px_rgba(27,42,48,.12)]`}
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
          <header className="studio-topbar flex min-h-[66px] items-center justify-between px-5 xl:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <span>视频项目</span>
                <Icon className="h-3 w-3" name="chevron" />
                <span className="truncate text-slate-500">{editor.project.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <h1
                  aria-label="HotelCut Studio"
                  className="truncate text-xl font-black tracking-[-0.025em] text-[#263138]"
                >
                  {editor.project.name}
                </h1>
                <span className="rounded-full bg-[#edf6f3] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#3f7c73]">
                  {embedded ? 'Production Editor' : 'M5 Editor'}
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
              {editor.isDirty ? (
                <button
                  className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-400 md:block"
                  onClick={() => void editor.saveNow()}
                  type="button"
                >
                  立即保存
                </button>
              ) : null}
              <button
                aria-label={onClose ? '返回项目列表' : '完成编辑'}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#263138] text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#172126] disabled:cursor-wait disabled:opacity-45 md:h-auto md:w-auto md:px-4 md:py-2.5 md:text-xs md:font-bold"
                disabled={Boolean(onClose) && editor.isDirty}
                onClick={onClose}
                title={
                  onClose
                    ? editor.isDirty
                      ? '请等待修改保存后返回'
                      : '返回自动剪辑项目列表'
                    : '渲染将在 M6 开放'
                }
                type="button"
              >
                <Icon
                  className={`h-[18px] w-[18px] md:hidden ${onClose ? 'rotate-180' : ''}`}
                  name={onClose ? 'chevron' : 'check'}
                />
                <span className="hidden md:inline">{onClose ? '返回项目列表' : '完成编辑'}</span>
              </button>
            </div>
          </header>

          <div className="studio-workspace p-3 xl:p-4">
            <div className="studio-commandbar" aria-label="剪辑快捷工具">
              <div>
                <button onClick={() => setIsPlaying((playing) => !playing)} type="button">
                  <Icon className="h-4 w-4" name={isPlaying ? 'pause' : 'play'} />
                  {isPlaying ? '暂停' : '播放'}
                </button>
                <span />
                <button
                  disabled={!selectedClipId}
                  onClick={() => {
                    if (!selectedClipId) return;
                    editor.execute({ type: 'delete-clip', clipId: selectedClipId });
                    setSelectedClipId(null);
                  }}
                  type="button"
                >
                  <Icon className="h-4 w-4" name="scissors" />
                  删除片段
                </button>
              </div>
              <div className="studio-commandbar-shortcuts">
                <span>
                  <kbd>Space</kbd> 播放
                </span>
                <span>
                  <kbd>⌘ Z</kbd> 撤销
                </span>
                <span>
                  <kbd>⌘ S</kbd> 保存
                </span>
              </div>
            </div>
            <div className="studio-editor-grid grid min-h-[590px] gap-3 xl:grid-cols-[264px_minmax(360px,1fr)_316px]">
              <SceneRail
                assets={assets}
                onSelect={(clipId, startFrame) => {
                  setSelectedClipId(clipId);
                  setCurrentFrame(startFrame);
                }}
                project={editor.project}
                selectedClipId={selectedClipId}
              />

              <StudioPreview
                assets={assets}
                currentFrame={currentFrame}
                isPlaying={isPlaying}
                onScrub={setCurrentFrame}
                onTogglePlayback={() => setIsPlaying((playing) => !playing)}
                project={editor.project}
              />

              <Inspector
                assets={assets}
                currentFrame={currentFrame}
                execute={editor.execute}
                project={editor.project}
                selectedClipId={selectedClipId}
              />
            </div>

            <div className="studio-timeline-wrap mt-3">
              <SimpleTimeline
                assets={assets}
                currentFrame={currentFrame}
                onMoveClip={(clip, startFrame) => {
                  editor.execute({ type: 'move-clip', clipId: clip.id, startFrame });
                  setCurrentFrame(startFrame);
                }}
                onScrub={setCurrentFrame}
                onSelectClip={selectClip}
                project={editor.project}
                selectedClipId={selectedClipId}
              />
            </div>

            <div className="studio-footer mt-3 flex flex-wrap items-center justify-between gap-3 px-2 text-[10px]">
              <div className="flex flex-wrap items-center gap-2">
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
                {editor.saveState === 'error' ? (
                  <>
                    <button
                      className="rounded-lg bg-rose-50 px-2.5 py-1 font-bold text-rose-700"
                      onClick={editor.retrySave}
                      type="button"
                    >
                      重试保存
                    </button>
                    {onReload ? (
                      <button
                        className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700"
                        onClick={() => void onReload()}
                        type="button"
                      >
                        加载服务器最新修订
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
              <p className="font-semibold">HotelVideoProject v{editor.project.schemaVersion}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function App({
  assets,
  initialProject,
  initialRevision,
  autosaveDelayMs = 800,
  onSaveRevision,
}: AppProps) {
  return (
    <ProjectStudio
      assets={assets}
      autosaveDelayMs={autosaveDelayMs}
      initialProject={initialProject}
      initialRevision={initialRevision}
      onSaveRevision={onSaveRevision}
    />
  );
}
