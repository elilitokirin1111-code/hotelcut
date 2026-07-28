import { parseHotelVideoProject, type HotelVideoProjectV1 } from '@hotelcut/timeline';

import { applyEditorCommand } from './editor.js';
import type { EditorCommand } from './schema.js';

export interface EditorHistory {
  readonly past: readonly HotelVideoProjectV1[];
  readonly present: HotelVideoProjectV1;
  readonly future: readonly HotelVideoProjectV1[];
  readonly limit: number;
}

export function createEditorHistory(project: HotelVideoProjectV1, limit = 50): EditorHistory {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError('Editor history limit must be an integer from 1 to 500');
  }
  return {
    past: [],
    present: parseHotelVideoProject(project),
    future: [],
    limit,
  };
}

export function applyHistoryCommand(history: EditorHistory, command: EditorCommand): EditorHistory {
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: applyEditorCommand(history.present, command),
    future: [],
  };
}

export function undoHistory(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1);
  if (!previous) {
    return history;
  }
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: EditorHistory): EditorHistory {
  const next = history.future[0];
  if (!next) {
    return history;
  }
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: history.future.slice(1),
  };
}
