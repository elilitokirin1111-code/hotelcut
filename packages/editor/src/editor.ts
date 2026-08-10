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
    case 'move-clip':
      return '移动时间线片段';
    case 'resize-clip':
      return '调整时间线片段时长';
    case 'update-clip-volume':
      return '调整片段音量';
    case 'update-audio-mix':
      return '调整音频混音';
    case 'update-visual-effects':
      return '调整画面调色';
    case 'update-clip-transition':
      return '调整片段转场';
    case 'upsert-transform-keyframe':
      return '设置画面关键帧';
    case 'delete-clip':
      return '删除片段';
    case 'split-visual-clip':
      return '拆分画面片段';
    case 'insert-video-clip':
    case 'insert-image-clip':
      return '插入素材片段';
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

function assertTimelinePlacement(
  project: HotelVideoProjectV1,
  clipId: string,
  startFrame: number,
  durationFrames: number,
): void {
  const track = project.tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === clipId),
  );
  if (!track) {
    throw new EditorCommandError(`Clip ${clipId} was not found`);
  }
  assertTrackPlacement(project, track, clipId, startFrame, durationFrames);
}

function assertTrackPlacement(
  project: HotelVideoProjectV1,
  track: Track,
  clipId: string,
  startFrame: number,
  durationFrames: number,
): void {
  if (track.locked) {
    throw new EditorCommandError(`Track ${track.name} is locked`);
  }
  if (startFrame + durationFrames > project.output.durationFrames) {
    throw new EditorCommandError('The clip would end after the project duration');
  }
  const ordered = track.clips.map((clip) =>
    clip.id === clipId ? { id: clip.id, startFrame, durationFrames } : clip,
  );
  const candidateAlreadyExists = track.clips.some((clip) => clip.id === clipId);
  const positioned = (
    candidateAlreadyExists ? ordered : [...ordered, { id: clipId, startFrame, durationFrames }]
  ).sort((left, right) => left.startFrame - right.startFrame || compareStrings(left.id, right.id));
  let previousEnd = 0;
  for (const clip of positioned) {
    if (clip.startFrame < previousEnd) {
      throw new EditorCommandError('The adjusted clip overlaps another clip on the same track');
    }
    previousEnd = clip.startFrame + clip.durationFrames;
  }
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

function moveClip(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'move-clip' }>,
): HotelVideoProjectV1 {
  const existing = project.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.id === command.clipId);
  if (!existing) {
    throw new EditorCommandError(`Clip ${command.clipId} was not found`);
  }
  assertTimelinePlacement(project, command.clipId, command.startFrame, existing.durationFrames);
  return updateClip(project, command.clipId, (clip) => ({
    ...clip,
    startFrame: command.startFrame,
    metadata: { ...clip.metadata, editedBy: 'move-clip' },
  }));
}

function resizeClip(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'resize-clip' }>,
): HotelVideoProjectV1 {
  const existing = project.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.id === command.clipId);
  if (!existing) {
    throw new EditorCommandError(`Clip ${command.clipId} was not found`);
  }
  if (existing.kind === 'audio') {
    throw new EditorCommandError(
      'Use source editing for audio clips; timeline resizing is not supported',
    );
  }
  if (existing.kind === 'video' && existing.sourceDurationFrames / command.durationFrames > 8) {
    throw new EditorCommandError('The selected duration would exceed 8x playback speed');
  }
  assertTimelinePlacement(project, command.clipId, existing.startFrame, command.durationFrames);
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind === 'audio') {
      throw new EditorCommandError('Audio clips cannot be resized by this command');
    }
    return {
      ...clip,
      durationFrames: command.durationFrames,
      ...(clip.kind === 'video'
        ? { playbackRate: clip.sourceDurationFrames / command.durationFrames }
        : {}),
      ...(clip.kind === 'caption' ? { words: [] } : {}),
      metadata: { ...clip.metadata, editedBy: 'resize-clip' },
    };
  });
}

function updateClipVolume(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-clip-volume' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind === 'video') {
      return {
        ...clip,
        volume: command.volume,
        ...(command.muted === undefined ? {} : { muted: command.muted }),
        metadata: { ...clip.metadata, editedBy: 'update-clip-volume' },
      };
    }
    if (clip.kind === 'audio') {
      return {
        ...clip,
        volume: command.volume,
        metadata: { ...clip.metadata, editedBy: 'update-clip-volume' },
      };
    }
    throw new EditorCommandError('Only video or audio clips have an editable volume');
  });
}

function updateAudioMix(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-audio-mix' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind !== 'audio') {
      throw new EditorCommandError('Only audio clips support fades and mix controls');
    }
    if (command.fadeInFrames + command.fadeOutFrames > clip.durationFrames) {
      throw new EditorCommandError('Audio fades cannot exceed the clip duration');
    }
    return {
      ...clip,
      volume: command.volume,
      fadeInFrames: command.fadeInFrames,
      fadeOutFrames: command.fadeOutFrames,
      metadata: { ...clip.metadata, editedBy: 'update-audio-mix' },
    };
  });
}

function updateVisualEffects(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-visual-effects' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind !== 'video' && clip.kind !== 'image') {
      throw new EditorCommandError('Only video or image clips have editable color adjustments');
    }
    return {
      ...clip,
      colorAdjustments: command.colorAdjustments,
      metadata: { ...clip.metadata, editedBy: 'update-visual-effects' },
    };
  });
}

function updateClipTransition(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'update-clip-transition' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind === 'audio') {
      throw new EditorCommandError('Audio clips do not have visual transitions');
    }
    return {
      ...clip,
      ...(command.edge === 'in'
        ? { transitionIn: command.transition }
        : { transitionOut: command.transition }),
      metadata: { ...clip.metadata, editedBy: 'update-clip-transition' },
    };
  });
}

function upsertTransformKeyframe(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'upsert-transform-keyframe' }>,
): HotelVideoProjectV1 {
  return updateClip(project, command.clipId, (clip) => {
    if (clip.kind === 'audio') {
      throw new EditorCommandError('Audio clips do not have transform keyframes');
    }
    if (command.keyframe.frame >= clip.durationFrames) {
      throw new EditorCommandError('A keyframe must be inside the clip duration');
    }
    const keyframes = [
      ...clip.keyframes.filter((item) => item.frame !== command.keyframe.frame),
      command.keyframe,
    ].sort((left, right) => left.frame - right.frame);
    return {
      ...clip,
      keyframes,
      metadata: { ...clip.metadata, editedBy: 'upsert-transform-keyframe' },
    };
  });
}

function deleteClip(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'delete-clip' }>,
): HotelVideoProjectV1 {
  const track = project.tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === command.clipId),
  );
  if (!track) throw new EditorCommandError(`Clip ${command.clipId} was not found`);
  if (track.locked) throw new EditorCommandError(`Track ${track.name} is locked`);
  if (project.tracks.reduce((count, candidate) => count + candidate.clips.length, 0) <= 1) {
    throw new EditorCommandError('A project must keep at least one clip');
  }
  return parseHotelVideoProject({
    ...project,
    tracks: project.tracks.map((candidate) =>
      candidate.id === track.id
        ? { ...candidate, clips: candidate.clips.filter((clip) => clip.id !== command.clipId) }
        : candidate,
    ),
  });
}

function splitVisualClip(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'split-visual-clip' }>,
): HotelVideoProjectV1 {
  const track = project.tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === command.clipId),
  );
  const clip = track?.clips.find((candidate) => candidate.id === command.clipId);
  if (!track || !clip) throw new EditorCommandError(`Clip ${command.clipId} was not found`);
  if (track.locked) throw new EditorCommandError(`Track ${track.name} is locked`);
  if (clip.kind !== 'video' && clip.kind !== 'image') {
    throw new EditorCommandError('Only video or image clips can be split');
  }
  if (
    command.newClipId === clip.id ||
    project.tracks.some((candidate) =>
      candidate.clips.some((item) => item.id === command.newClipId),
    )
  ) {
    throw new EditorCommandError('The new clip id is already in use');
  }
  if (
    command.atFrame <= clip.startFrame ||
    command.atFrame >= clip.startFrame + clip.durationFrames
  ) {
    throw new EditorCommandError('Split point must be inside the selected clip');
  }
  const firstDuration = command.atFrame - clip.startFrame;
  const secondDuration = clip.durationFrames - firstDuration;
  const firstKeyframes = clip.keyframes.filter((keyframe) => keyframe.frame < firstDuration);
  const secondKeyframes = clip.keyframes
    .filter((keyframe) => keyframe.frame >= firstDuration)
    .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - firstDuration }));
  const first = {
    ...clip,
    durationFrames: firstDuration,
    transitionOut: null,
    keyframes: firstKeyframes,
    metadata: { ...clip.metadata, editedBy: 'split-visual-clip' },
  };
  const secondBase = {
    ...clip,
    id: command.newClipId,
    startFrame: command.atFrame,
    durationFrames: secondDuration,
    transitionIn: null,
    keyframes: secondKeyframes,
    metadata: { ...clip.metadata, editedBy: 'split-visual-clip' },
  };
  const second =
    clip.kind === 'video'
      ? (() => {
          const firstSourceDuration = Math.max(1, Math.round(firstDuration * clip.playbackRate));
          const sourceDurationFrames = clip.sourceDurationFrames - firstSourceDuration;
          if (sourceDurationFrames <= 0) {
            throw new EditorCommandError('The source range is too short to split at this frame');
          }
          return {
            ...secondBase,
            sourceStartFrame: clip.sourceStartFrame + firstSourceDuration,
            sourceDurationFrames,
          };
        })()
      : secondBase;
  return parseHotelVideoProject({
    ...project,
    tracks: project.tracks.map((candidate) =>
      candidate.id === track.id
        ? {
            ...candidate,
            clips: candidate.clips.flatMap((item) =>
              item.id === clip.id ? [first, second] : [item],
            ),
          }
        : candidate,
    ),
  });
}

function insertVisualClip(
  project: HotelVideoProjectV1,
  command: Extract<EditorCommand, { type: 'insert-video-clip' | 'insert-image-clip' }>,
): HotelVideoProjectV1 {
  const track = project.tracks.find((candidate) => candidate.id === command.trackId);
  if (!track) throw new EditorCommandError(`Track ${command.trackId} was not found`);
  if (track.locked) throw new EditorCommandError(`Track ${track.name} is locked`);
  if (track.kind !== 'video' && track.kind !== 'overlay') {
    throw new EditorCommandError('Visual clips can only be inserted on video or overlay tracks');
  }
  if (track.kind === 'video' && command.type !== 'insert-video-clip') {
    throw new EditorCommandError('Only video clips can be inserted on a video track');
  }
  if (track.kind === 'overlay' && command.type !== 'insert-image-clip') {
    throw new EditorCommandError('Only image clips can be inserted on an overlay track');
  }
  if (project.tracks.some((candidate) => candidate.clips.some((clip) => clip.id === command.id))) {
    throw new EditorCommandError('The new clip id is already in use');
  }
  assertTrackPlacement(project, track, command.id, command.startFrame, command.durationFrames);
  const visualBase = {
    id: command.id,
    assetId: command.assetId,
    startFrame: command.startFrame,
    durationFrames: command.durationFrames,
    transform: {},
    transitionIn: null,
    transitionOut: null,
    colorAdjustments: {},
    keyframes: [],
    metadata: { editedBy: 'insert-visual-clip' },
  };
  const clip =
    command.type === 'insert-video-clip'
      ? {
          ...visualBase,
          kind: 'video' as const,
          sourceStartFrame: command.sourceStartFrame,
          sourceDurationFrames: command.sourceDurationFrames,
          volume: 1,
          muted: true,
          playbackRate: command.sourceDurationFrames / command.durationFrames,
        }
      : { ...visualBase, kind: 'image' as const };
  return parseHotelVideoProject({
    ...project,
    tracks: project.tracks.map((candidate) =>
      candidate.id === track.id ? { ...candidate, clips: [...candidate.clips, clip] } : candidate,
    ),
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
    case 'move-clip':
      return moveClip(validatedProject, command);
    case 'resize-clip':
      return resizeClip(validatedProject, command);
    case 'update-clip-volume':
      return updateClipVolume(validatedProject, command);
    case 'update-audio-mix':
      return updateAudioMix(validatedProject, command);
    case 'update-visual-effects':
      return updateVisualEffects(validatedProject, command);
    case 'update-clip-transition':
      return updateClipTransition(validatedProject, command);
    case 'upsert-transform-keyframe':
      return upsertTransformKeyframe(validatedProject, command);
    case 'delete-clip':
      return deleteClip(validatedProject, command);
    case 'split-visual-clip':
      return splitVisualClip(validatedProject, command);
    case 'insert-video-clip':
    case 'insert-image-clip':
      return insertVisualClip(validatedProject, command);
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
