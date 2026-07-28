import {
  applyHistoryCommand,
  createEditorHistory,
  redoHistory,
  undoHistory,
  type EditorCommand,
  type EditorHistory,
} from '@hotelcut/editor';
import type { HotelVideoProjectV1 } from '@hotelcut/timeline';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export type SaveProjectRevision = (
  project: HotelVideoProjectV1,
  baseRevision: number,
) => Promise<number>;

interface SessionState {
  history: EditorHistory;
  changeVersion: number;
}

type SessionAction =
  { type: 'command'; command: EditorCommand } | { type: 'undo' } | { type: 'redo' };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'command') {
    return {
      history: applyHistoryCommand(state.history, action.command),
      changeVersion: state.changeVersion + 1,
    };
  }
  if (action.type === 'undo') {
    const history = undoHistory(state.history);
    return history === state.history ? state : { history, changeVersion: state.changeVersion + 1 };
  }
  const history = redoHistory(state.history);
  return history === state.history ? state : { history, changeVersion: state.changeVersion + 1 };
}

export function useProjectEditor(
  initialProject: HotelVideoProjectV1,
  saveProjectRevision: SaveProjectRevision,
  initialRevision = 1,
  autosaveDelayMs = 800,
) {
  const [session, dispatch] = useReducer(sessionReducer, {
    history: createEditorHistory(initialProject),
    changeVersion: 0,
  });
  const [revision, setRevision] = useState(initialRevision);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const historyRef = useRef(session.history);
  const changeVersionRef = useRef(session.changeVersion);
  const revisionRef = useRef(initialRevision);
  const savedVersionRef = useRef(0);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    historyRef.current = session.history;
    changeVersionRef.current = session.changeVersion;
  }, [session]);

  const flushSave = useCallback(async () => {
    if (saveInFlightRef.current || changeVersionRef.current === savedVersionRef.current) {
      return;
    }
    saveInFlightRef.current = true;
    const savingVersion = changeVersionRef.current;
    const document = historyRef.current.present;
    const baseRevision = revisionRef.current;
    let saved = false;
    setSaveState('saving');
    setSaveError(null);

    try {
      const nextRevision = await saveProjectRevision(document, baseRevision);
      revisionRef.current = nextRevision;
      savedVersionRef.current = savingVersion;
      saved = true;
      setRevision(nextRevision);
      setLastSavedAt(new Date());
      setSaveState(savingVersion === changeVersionRef.current ? 'saved' : 'pending');
    } catch (error) {
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : '项目保存失败');
    } finally {
      saveInFlightRef.current = false;
      if (saved && savedVersionRef.current !== changeVersionRef.current) {
        setRetryTick((value) => value + 1);
      }
    }
  }, [saveProjectRevision]);

  useEffect(() => {
    if (session.changeVersion === savedVersionRef.current) {
      return;
    }
    setSaveState((current) => (current === 'saving' ? current : 'pending'));
    const timer = window.setTimeout(() => {
      void flushSave();
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, flushSave, retryTick, session.changeVersion]);

  return {
    project: session.history.present,
    revision,
    saveState,
    saveError,
    lastSavedAt,
    canUndo: session.history.past.length > 0,
    canRedo: session.history.future.length > 0,
    execute: (command: EditorCommand) => dispatch({ type: 'command', command }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    retrySave: () => setRetryTick((value) => value + 1),
  };
}
