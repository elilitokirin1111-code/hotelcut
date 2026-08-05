import {
  parseHotelVideoProject,
  type Clip,
  type HotelVideoProjectV1,
  type Track,
} from '@hotelcut/timeline';

import { editorCommandSchema, type EditorCommand } from './schema.js';

export class EditorCommandError extends Error {
  readonly code = 'EDITOR_COMMAND_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'EditorCommandError';
  }
}

export interface AppliedAiReviewCommand {
  command: EditorCommand;
  project: HotelVideoProjectV1;
  reason: string;
}

export interface EditorScene {
  clipId: string;
  trackId: string;
  trackName: string;
  kind: 'video' | 'image';
  assetId: string;
  startFrame: number;
  durationFrames: number;
  label: string;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function commandLabel(command: EditorCommand): string {
  switch (command.type) {
    case 'replace-clip-asset':
      return '替换镜头';
    case 'trim-video':
      return '调整镜头入点和出点';
    case 'update-caption':
      return '修改字幕';
    case 'update-title':
      return '修改标题';
    case 'update-cta':
      return '修改 CTA';
    case 'replace-music':
      return '替换音乐';
  }
}

function updateClip(
  project: HotelVideoProjectV1,
  clipId: string,
  update: (clip: Clip, track: Track) => Clip,
): HotelVideoProjectV1 {
  let found = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }
      found = true;
      return update(clip, track);
    }),
  }));

  if (!found) {
    throw new EditorCommandError(`Clip ${clipId} was not found`);
  }
  return parseHotelVideoProject({ ...project, tracks });
}

function replaceClipAsset(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'replace-clip-asset' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind !== 'video' && clip.kind !== 'image') {
      throw new EditorCommandError('Only video or image clips can replace a shot');
    }
    return {
      ...clip,
      assetId: command.assetId,
      metadata: {
        ...clip.metadata,
        editedBy: 'replace-clip-asset',
      },
    };
  });
}

function trimVideo(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'trim-video' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind !== 'video') {
      throw new EditorCommandError('Only video clips have editable source in and out points');
    }
    const playbackRate = command.sourceDurationFrames / clip.durationFrames;
    if (playbackRate > 8) {
      throw new EditorCommandError('The selected source range would exceed 8x playback speed');
    }
    return {
      ...clip,
      sourceStartFrame: command.sourceStartFrame,
      sourceDurationFrames: command.sourceDurationFrames,
      playbackRate,
      metadata: {
        ...clip.metadata,
        editedBy: 'trim-video',
      },
    };
  });
}

function updateCaption(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-caption' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind !== 'caption') {
      throw new EditorCommandError('The selected clip is not a caption');
    }
    return {
      ...clip,
      text: command.text,
      words: [],
      metadata: {
        ...clip.metadata,
        editedBy: 'update-caption',
      },
    };
  });
}

function updateTitle(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-title' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind !== 'text') {
      throw new EditorCommandError('The selected clip is not a title');
    }
    return {
      ...clip,
      text: command.text,
      metadata: {
        ...clip.metadata,
        editedBy: 'update-title',
      },
    };
  });
}

function updateCta(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-cta' }>,
): HotelVideoProjectV1 {
  if (!project.cta) {
    throw new EditorCommandError('This project does not have an approved CTA to edit');
  }
  return parseHotelVideoProject({
    ...project,
    cta: {
      ...project.cta,
      text: command.text,
      action: command.action,
      destination: command.destination,
    },
    metadata: {
      ...project.metadata,
      ctaEdited: true,
    },
  });
}

function replaceMusic(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'replace-music' }>,
): HotelVideoProjectV1 {
  let replacements = 0;
  const tracks = project.tracks.map((track) => {
    if (track.kind !== 'audio') {
      return track;
    }
    const isMusicTrack =
      track.metadata['compilerTrack'] === 'music' ||
      track.clips.some((clip) => clip.metadata['slotId'] === 'music');
    if (!isMusicTrack) {
      return track;
    }
    return {
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.kind !== 'audio') {
          return clip;
        }
        replacements += 1;
        return {
          ...clip,
          assetId: command.assetId,
          metadata: {
            ...clip.metadata,
            editedBy: 'replace-music',
          },
        };
      }),
    };
  });

  if (replacements === 0) {
    throw new EditorCommandError('No background music clips were found');
  }
  return parseHotelVideoProject({ ...project, tracks });
}

export function applyEditorCommand(
  project: HotelVideoProjectV1,
  rawCommand: unknown,
): HotelVideoProjectV1 {
  const command = editorCommandSchema.parse(rawCommand);
  const validatedProject = parseHotelVideoProject(project);

  switch (command.type) {
    case 'replace-clip-asset':
      return replaceClipAsset(validatedProject, command);
    case 'trim-video':
      return trimVideo(validatedProject, command);
    case 'update-caption':
      return updateCaption(validatedProject, command);
    case 'update-title':
      return updateTitle(validatedProject, command);
    case 'update-cta':
      return updateCta(validatedProject, command);
    case 'replace-music':
      return replaceMusic(validatedProject, command);
  }
}

/**
 * Converts a review command into the established strict EditorCommand shape.
 * The review-only `reason` is retained for audit history but never becomes a
 * timeline field, and command validation remains centralized in the editor.
 */
export function applyAiReviewCommand(
  project: HotelVideoProjectV1,
  rawCommand: unknown,
): AppliedAiReviewCommand {
  if (!rawCommand || typeof rawCommand !== 'object' || Array.isArray(rawCommand)) {
    throw new EditorCommandError('AI review command must be an object');
  }
  const { reason, ...candidate } = rawCommand as Record<string, unknown>;
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new EditorCommandError('AI review command requires a non-empty reason');
  }
  const command = editorCommandSchema.parse(candidate);
  return { command, project: applyEditorCommand(project, command), reason: reason.trim() };
}

export function describeEditorCommand(rawCommand: unknown): string {
  return commandLabel(editorCommandSchema.parse(rawCommand));
}

export function getEditorScenes(project: HotelVideoProjectV1): EditorScene[] {
  return project.tracks
    .flatMap((track) =>
      track.clips.flatMap((clip) => {
        if (clip.kind !== 'video' && clip.kind !== 'image') {
          return [];
        }
        const slotId = clip.metadata['slotId'];
        return [
          {
            clipId: clip.id,
            trackId: track.id,
            trackName: track.name,
            kind: clip.kind,
            assetId: clip.assetId,
            startFrame: clip.startFrame,
            durationFrames: clip.durationFrames,
            label: typeof slotId === 'string' ? slotId : track.name,
          },
        ];
      }),
    )
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        compareStrings(left.trackName, right.trackName) ||
        compareStrings(left.clipId, right.clipId),
    );
}

export function getActiveClips(project: HotelVideoProjectV1, frame: number): Clip[] {
  return project.tracks
    .filter((track) => track.enabled)
    .sort((left, right) => left.zIndex - right.zIndex)
    .flatMap((track) =>
      track.clips.filter(
        (clip) => clip.startFrame <= frame && frame < clip.startFrame + clip.durationFrames,
      ),
    );
}
