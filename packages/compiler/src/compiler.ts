import { createDeterministicTemplateContext } from '@hotelcut/template-sdk';
import {
  parseHotelVideoProject,
  type AudioClip,
  type CaptionClip,
  type Clip,
  type HotelVideoProjectV1,
  type ImageClip,
  type TextClip,
  type Track,
  type Transition,
  type VideoClip,
} from '@hotelcut/timeline';
import type { ZodError } from 'zod';

import {
  deterministicSourceStart,
  findDuplicateAssets,
  rankSlotCandidates,
  type CandidateUsage,
  type SourceCandidate,
} from './candidates.js';
import { paginateCaptionLines, splitCaptionLines } from './captions.js';
import {
  COMPILER_SCHEMA_VERSION,
  COMPILER_VERSION,
  compilationResultSchema,
  compilerInputSchema,
  replaceClipRequestSchema,
  type CompilationResult,
  type CompilerInput,
  type GenerationExplanation,
  type ManifestSlot,
  type MediaScoreRecord,
  type ReplaceClipRequest,
} from './schema.js';
import {
  basisPointRangeToFrames,
  compilationTemplateSchema,
  resolveTemplateSlots,
  type CompilationTemplate,
  type ResolvedTemplateSlot,
} from './template.js';

export class CompilerError extends Error {
  readonly code = 'COMPILATION_FAILED';

  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CompilerError';
  }
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '$'}: ${issue.message}`)
    .join('; ');
}

const defaultTransform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotationDegrees: 0,
  opacity: 1,
  fit: 'cover' as const,
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface SelectedSlot {
  slot: ResolvedTemplateSlot;
  source: SourceCandidate | null;
  clip: VideoClip | ImageClip | null;
  score: number | null;
  locked: boolean;
  reason: string;
}

function transitionForSlot(slot: ResolvedTemplateSlot, edge: 'in' | 'out'): Transition | null {
  if (slot.transition === 'cut') {
    return null;
  }
  if (slot.track === 'main') {
    if (edge === 'in' && slot.startBasisPoints === 0) {
      return null;
    }
    if (edge === 'out' && slot.endBasisPoints === 10_000) {
      return null;
    }
  }
  const durationFrames = Math.max(1, Math.min(12, Math.floor(slot.durationFrames / 3)));
  return {
    type: slot.transition,
    durationFrames,
    easing: 'ease-in-out',
  };
}

function clipSlotId(clip: Clip): string | null {
  const value = clip.metadata['slotId'];
  return typeof value === 'string' ? value : null;
}

function findLockedClip(
  previousProject: HotelVideoProjectV1 | null,
  lockedClipIds: ReadonlySet<string>,
  slotId: string,
): VideoClip | ImageClip | null {
  if (!previousProject) {
    return null;
  }
  for (const track of previousProject.tracks) {
    for (const clip of track.clips) {
      if (
        lockedClipIds.has(clip.id) &&
        clipSlotId(clip) === slotId &&
        (clip.kind === 'video' || clip.kind === 'image')
      ) {
        return clip;
      }
    }
  }
  return null;
}

function assertTemplateReferences(input: CompilerInput, template: CompilationTemplate): void {
  const safeAreaIds = new Set(input.safeAreas.map((safeArea) => safeArea.id));
  const tokens = new Map(input.brandTokens.map((token) => [token.key, token.type] as const));
  const requireSafeArea = (id: string, usage: string): void => {
    if (!safeAreaIds.has(id)) {
      throw new CompilerError(`${usage} references missing safe area "${id}"`);
    }
  };
  const requireToken = (key: string, type: 'font' | 'color', usage: string): void => {
    if (tokens.get(key) !== type) {
      throw new CompilerError(`${usage} requires ${type} token "${key}"`);
    }
  };

  if (template.captions) {
    requireSafeArea(template.captions.safeAreaId, 'Caption layout');
    requireToken(template.captions.fontToken, 'font', 'Caption layout');
    requireToken(template.captions.colorToken, 'color', 'Caption layout');
    if (template.captions.backgroundColorToken) {
      requireToken(template.captions.backgroundColorToken, 'color', 'Caption layout background');
    }
  }
  if (template.title) {
    if (template.title.safeAreaId) {
      requireSafeArea(template.title.safeAreaId, 'Title layout');
    }
    requireToken(template.title.fontToken, 'font', 'Title layout');
    requireToken(template.title.colorToken, 'color', 'Title layout');
    if (template.title.backgroundColorToken) {
      requireToken(template.title.backgroundColorToken, 'color', 'Title background');
    }
  }
}

function validateDuration(input: CompilerInput, template: CompilationTemplate): void {
  const durationSeconds = input.output.durationFrames / input.output.frameRate;
  if (
    durationSeconds < template.minDurationSeconds ||
    durationSeconds > template.maxDurationSeconds
  ) {
    throw new CompilerError(
      `${template.id} accepts ${template.minDurationSeconds}-${template.maxDurationSeconds} seconds, received ${durationSeconds.toFixed(3)}`,
    );
  }
}

function createVisualClip(
  source: SourceCandidate,
  slot: ResolvedTemplateSlot,
  id: string,
  seed: number,
  score: number,
): VideoClip | ImageClip {
  const metadata = {
    slotId: slot.id,
    role: slot.role,
    candidateId: source.candidateId,
    segmentId: source.segment?.id ?? null,
    automaticScore: score,
    locked: false,
  };
  if (source.media.kind === 'image') {
    return {
      id,
      kind: 'image',
      assetId: source.media.assetId,
      startFrame: slot.startFrame,
      durationFrames: slot.durationFrames,
      transform: defaultTransform,
      transitionIn: transitionForSlot(slot, 'in'),
      transitionOut: transitionForSlot(slot, 'out'),
      metadata,
    };
  }
  return {
    id,
    kind: 'video',
    assetId: source.media.assetId,
    startFrame: slot.startFrame,
    durationFrames: slot.durationFrames,
    sourceStartFrame: deterministicSourceStart(source, slot.durationFrames, seed, slot.id),
    sourceDurationFrames: slot.durationFrames,
    transform: defaultTransform,
    transitionIn: transitionForSlot(slot, 'in'),
    transitionOut: transitionForSlot(slot, 'out'),
    volume: slot.audioPolicy === 'keep' ? 1 : 0,
    muted: slot.audioPolicy !== 'keep',
    playbackRate: 1,
    metadata,
  };
}

function preserveLockedClip(
  clip: VideoClip | ImageClip,
  slot: ResolvedTemplateSlot,
): VideoClip | ImageClip {
  const metadata = {
    ...clip.metadata,
    slotId: slot.id,
    role: slot.role,
    locked: true,
  };
  if (clip.kind === 'video') {
    return {
      ...clip,
      startFrame: slot.startFrame,
      durationFrames: slot.durationFrames,
      sourceDurationFrames: slot.durationFrames,
      metadata,
    };
  }
  return {
    ...clip,
    startFrame: slot.startFrame,
    durationFrames: slot.durationFrames,
    metadata,
  };
}

function createCaptionClips(
  selectedSlots: readonly SelectedSlot[],
  template: CompilationTemplate,
  id: (namespace?: string) => string,
  warnings: CompilationResult['warnings'],
  explain: (
    stage: GenerationExplanation['stage'],
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => void,
): CaptionClip[] {
  const layout = template.captions;
  if (!layout) {
    return [];
  }
  const clips: CaptionClip[] = [];
  selectedSlots
    .filter(
      (selection) => selection.clip && (selection.slot.caption || selection.slot.role === 'a-roll'),
    )
    .sort((left, right) => left.slot.startFrame - right.slot.startFrame)
    .forEach((selection) => {
      const captionText = selection.slot.caption ?? selection.source?.transcript;
      if (!captionText) {
        warnings.push({
          code: 'CAPTION_SOURCE_MISSING',
          message: `Slot ${selection.slot.id} has no transcript for captions`,
          severity: 'warning',
          path: `slots.${selection.slot.id}`,
        });
        return;
      }
      const pages = paginateCaptionLines(
        splitCaptionLines(captionText, layout.maxVisualWidth),
        layout.maxLines,
      );
      pages.forEach((text, pageIndex) => {
        const pageStart = Math.round((selection.slot.durationFrames * pageIndex) / pages.length);
        const pageEnd = Math.round(
          (selection.slot.durationFrames * (pageIndex + 1)) / pages.length,
        );
        clips.push({
          id: id(`caption:${selection.slot.id}:${pageIndex}`),
          kind: 'caption',
          startFrame: selection.slot.startFrame + pageStart,
          durationFrames: Math.max(1, pageEnd - pageStart),
          text,
          words: [],
          style: {
            fontToken: layout.fontToken,
            colorToken: layout.colorToken,
            ...(layout.backgroundColorToken
              ? { backgroundColorToken: layout.backgroundColorToken }
              : {}),
            fontSize: layout.fontSize,
            lineHeight: 1.2,
            align: 'center',
            maxLines: layout.maxLines,
          },
          safeAreaId: layout.safeAreaId,
          transform: defaultTransform,
          transitionIn: null,
          transitionOut: null,
          metadata: {
            slotId: selection.slot.id,
            generatedFrom: selection.source?.candidateId ?? null,
          },
        });
      });
    });

  explain('caption', 'CAPTIONS_LAYOUT_COMPLETE', `Generated ${clips.length} caption clips`, {
    clipCount: clips.length,
  });
  return clips;
}

function createTitleClip(
  input: CompilerInput,
  template: CompilationTemplate,
  id: (namespace?: string) => string,
): TextClip | null {
  if (!template.title) {
    return null;
  }
  const range = basisPointRangeToFrames(
    template.title.startBasisPoints,
    template.title.endBasisPoints,
    input.output.durationFrames,
  );
  return {
    id: id('title'),
    kind: 'text',
    startFrame: range.startFrame,
    durationFrames: range.durationFrames,
    text: input.brief.title,
    style: {
      fontToken: template.title.fontToken,
      colorToken: template.title.colorToken,
      ...(template.title.backgroundColorToken
        ? { backgroundColorToken: template.title.backgroundColorToken }
        : {}),
      fontSize: template.title.fontSize,
      lineHeight: 1.2,
      align: 'center',
      maxLines: 2,
    },
    ...(template.title.safeAreaId ? { safeAreaId: template.title.safeAreaId } : {}),
    transform: defaultTransform,
    transitionIn: {
      type: 'fade',
      durationFrames: Math.min(12, Math.max(1, Math.floor(range.durationFrames / 3))),
      easing: 'ease-out',
    },
    transitionOut: {
      type: 'fade',
      durationFrames: Math.min(12, Math.max(1, Math.floor(range.durationFrames / 3))),
      easing: 'ease-in',
    },
    metadata: {
      generatedFrom: 'brief.title',
    },
  };
}

function hasEligibleBackgroundMusic(input: CompilerInput, template: CompilationTemplate): boolean {
  if (!template.music) {
    return false;
  }
  const requiredTags = new Set(template.music.requiredTags.map((tag) => tag.toLowerCase()));
  const duplicateAssets = findDuplicateAssets(input.media);
  return input.media.some(
    (media) =>
      media.kind === 'audio' &&
      media.availability === 'ready' &&
      media.durationFrames !== null &&
      !duplicateAssets.has(media.assetId) &&
      media.tags.some((tag) => requiredTags.has(tag.toLowerCase())),
  );
}

function createMusic(
  input: CompilerInput,
  template: CompilationTemplate,
  selectedSlots: readonly SelectedSlot[],
  id: (namespace?: string) => string,
  warnings: CompilationResult['warnings'],
  scoreRecords: MediaScoreRecord[],
  explain: (
    stage: GenerationExplanation['stage'],
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => void,
): { clips: AudioClip[]; manifestSlot: ManifestSlot | null; trackName: string } {
  if (!template.music) {
    return { clips: [], manifestSlot: null, trackName: '背景音乐' };
  }
  const requiredTags = new Set(template.music.requiredTags.map((tag) => tag.toLowerCase()));
  const duplicateAssets = findDuplicateAssets(input.media);
  const candidates = input.media
    .filter((media) => media.kind === 'audio')
    .map((media) => {
      const tags = new Set(media.tags.map((tag) => tag.toLowerCase()));
      const matches = [...requiredTags].filter((tag) => tags.has(tag));
      const duplicateOf = duplicateAssets.get(media.assetId);
      const dedupScore = duplicateOf ? -10_000 : 0;
      const eligible =
        media.availability === 'ready' &&
        media.durationFrames !== null &&
        matches.length > 0 &&
        !duplicateOf;
      const totalScore =
        (media.scoreBasisPoints ?? 5_000) +
        Math.round((media.analysis.qualityBasisPoints - 5_000) / 2) +
        matches.length * 1_200 +
        dedupScore;
      const reasons: string[] = [];
      if (media.availability !== 'ready') {
        reasons.push(`Media availability is ${media.availability}`);
      }
      if (media.durationFrames === null) {
        reasons.push('Audio duration is unavailable');
      }
      if (matches.length === 0) {
        reasons.push(`None of the required tags matched: ${[...requiredTags].join(', ')}`);
      }
      if (duplicateOf) {
        reasons.push(`Duplicate content fingerprint; preferred asset is ${duplicateOf}`);
      }
      if (eligible) {
        reasons.push('Eligible background music');
      }
      const record: MediaScoreRecord = {
        slotId: 'music',
        candidateId: `${media.assetId}:whole`,
        assetId: media.assetId,
        segmentId: null,
        eligible,
        selected: false,
        totalScore,
        components: [
          {
            name: 'base',
            value: media.scoreBasisPoints ?? 5_000,
            detail: 'Music analysis base score',
          },
          {
            name: 'quality',
            value: Math.round((media.analysis.qualityBasisPoints - 5_000) / 2),
            detail: `Technical quality ${media.analysis.qualityBasisPoints}`,
          },
          {
            name: 'required-tags',
            value: matches.length * 1_200,
            detail: matches.length > 0 ? `Matched ${matches.join(', ')}` : 'No music tag matched',
          },
          {
            name: 'deduplication',
            value: dedupScore,
            detail: duplicateOf ? `Duplicate of ${duplicateOf}` : 'Unique content fingerprint',
          },
        ],
        reasons,
      };
      return { media, record };
    })
    .sort(
      (left, right) =>
        right.record.totalScore - left.record.totalScore ||
        compareStrings(left.media.assetId, right.media.assetId),
    );
  scoreRecords.push(...candidates.map((candidate) => candidate.record));
  const selected = candidates.find((candidate) => candidate.record.eligible);
  if (!selected || selected.media.durationFrames === null) {
    const ambienceAssetIds = new Set(
      selectedSlots
        .filter(
          (selection) => selection.slot.audioPolicy === 'duck' && selection.clip?.kind === 'video',
        )
        .map((selection) => selection.clip?.assetId)
        .filter((assetId): assetId is string => typeof assetId === 'string'),
    );
    const ambience = input.media
      .filter(
        (media) =>
          ambienceAssetIds.has(media.assetId) &&
          media.kind === 'video' &&
          media.availability === 'ready' &&
          media.durationFrames !== null &&
          media.analysis.hasAudio &&
          media.analysis.silenceRatioBasisPoints <= 8_000,
      )
      .sort(
        (left, right) =>
          left.analysis.silenceRatioBasisPoints - right.analysis.silenceRatioBasisPoints ||
          right.analysis.qualityBasisPoints - left.analysis.qualityBasisPoints ||
          (right.durationFrames ?? 0) - (left.durationFrames ?? 0) ||
          compareStrings(left.assetId, right.assetId),
      )[0];
    if (ambience?.durationFrames) {
      const clips: AudioClip[] = [];
      let cursor = 0;
      let index = 0;
      while (cursor < input.output.durationFrames) {
        const durationFrames = Math.min(
          ambience.durationFrames,
          input.output.durationFrames - cursor,
        );
        clips.push({
          id: id(`ambience:${index}`),
          kind: 'audio',
          assetId: ambience.assetId,
          startFrame: cursor,
          durationFrames,
          sourceStartFrame: 0,
          sourceDurationFrames: durationFrames,
          volume: 0.18,
          fadeInFrames: cursor === 0 ? Math.min(12, durationFrames) : 0,
          fadeOutFrames:
            cursor + durationFrames === input.output.durationFrames
              ? Math.min(12, durationFrames)
              : 0,
          metadata: {
            slotId: 'music',
            loopIndex: index,
            sourceType: 'ambience-fallback',
          },
        });
        cursor += durationFrames;
        index += 1;
      }
      warnings.push({
        code: 'BACKGROUND_MUSIC_MISSING',
        message: 'No eligible background music was available; source ambience fallback is active',
        severity: 'info',
        path: 'media',
      });
      explain(
        'music',
        'SOURCE_AMBIENCE_FALLBACK',
        'Filled the project audio bed with ambience from a selected video',
        { assetId: ambience.assetId, loopCount: clips.length, volume: 0.18 },
      );
      return {
        clips,
        manifestSlot: {
          slotId: 'music',
          role: 'music',
          startFrame: 0,
          durationFrames: input.output.durationFrames,
          clipId: clips[0]?.id ?? null,
          assetId: ambience.assetId,
          segmentId: null,
          score: ambience.scoreBasisPoints ?? ambience.analysis.qualityBasisPoints,
          locked: false,
          reason: 'Source ambience fallback fills the project',
        },
        trackName: '原视频环境声',
      };
    }
    warnings.push({
      code: 'BACKGROUND_MUSIC_MISSING',
      message: 'No eligible background music or source ambience was available',
      severity: 'warning',
      path: 'media',
    });
    explain('music', 'BACKGROUND_MUSIC_MISSING', 'No usable audio source was selected');
    return { clips: [], manifestSlot: null, trackName: '背景音乐' };
  }
  selected.record.selected = true;
  selected.record.reasons.push('Highest score for background music');

  const clips: AudioClip[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < input.output.durationFrames) {
    const durationFrames = Math.min(
      selected.media.durationFrames,
      input.output.durationFrames - cursor,
    );
    const fadeInFrames =
      cursor === 0 ? Math.min(template.music.fadeDurationFrames, durationFrames) : 0;
    const fadeOutFrames =
      cursor + durationFrames === input.output.durationFrames
        ? Math.min(template.music.fadeDurationFrames, Math.max(0, durationFrames - fadeInFrames))
        : 0;
    clips.push({
      id: id(`music:${index}`),
      kind: 'audio',
      assetId: selected.media.assetId,
      startFrame: cursor,
      durationFrames,
      sourceStartFrame: 0,
      sourceDurationFrames: durationFrames,
      volume: template.music.volume,
      fadeInFrames,
      fadeOutFrames,
      metadata: {
        slotId: 'music',
        loopIndex: index,
      },
    });
    cursor += durationFrames;
    index += 1;
  }
  explain('music', 'BACKGROUND_MUSIC_LAYOUT_COMPLETE', 'Background music fills the project', {
    assetId: selected.media.assetId,
    loopCount: clips.length,
  });
  return {
    clips,
    manifestSlot: {
      slotId: 'music',
      role: 'music',
      startFrame: 0,
      durationFrames: input.output.durationFrames,
      clipId: clips[0]?.id ?? null,
      assetId: selected.media.assetId,
      segmentId: null,
      score: selected.record.totalScore,
      locked: false,
      reason: 'Highest deterministic music score',
    },
    trackName: '背景音乐',
  };
}

export function compileVideo(rawInput: unknown, rawTemplate: unknown): CompilationResult {
  const inputResult = compilerInputSchema.safeParse(rawInput);
  if (!inputResult.success) {
    throw new CompilerError(`Invalid compiler input: ${formatZodError(inputResult.error)}`);
  }
  const templateResult = compilationTemplateSchema.safeParse(rawTemplate);
  if (!templateResult.success) {
    throw new CompilerError(`Invalid template: ${formatZodError(templateResult.error)}`);
  }
  const input = inputResult.data;
  const template = templateResult.data;
  if (input.template.id !== template.id || input.template.version !== template.version) {
    throw new CompilerError(
      `Input requests ${input.template.id}@${input.template.version}, received ${template.id}@${template.version}`,
    );
  }
  validateDuration(input, template);
  assertTemplateReferences(input, template);

  if (input.previousProject) {
    if (
      input.previousProject.id !== input.projectId ||
      input.previousProject.template.id !== template.id ||
      input.previousProject.template.version !== template.version ||
      input.previousProject.output.durationFrames !== input.output.durationFrames
    ) {
      throw new CompilerError(
        'Previous project identity, template and duration must match regeneration input',
      );
    }
  }

  const context = createDeterministicTemplateContext(
    template.id,
    template.version,
    input.seed,
    input,
  );
  const createId = (namespace?: string): string => context.id(namespace);
  const explanations: GenerationExplanation[] = [];
  const warnings: CompilationResult['warnings'] = [];
  const scoreRecords: MediaScoreRecord[] = [];
  const explain = (
    stage: GenerationExplanation['stage'],
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ): void => {
    explanations.push({
      sequence: explanations.length,
      stage,
      code,
      message,
      details,
    });
  };
  const lockedClipIds = new Set(input.lockedClipIds);
  const preservedLockedClipIds = new Set<string>();
  const usageCandidateIds = new Set<string>();
  const usageAssetIds = new Set<string>();
  const usage = (): CandidateUsage => ({
    candidateIds: usageCandidateIds,
    assetIds: usageAssetIds,
  });

  explain('filter', 'MEDIA_FILTER_STARTED', `Evaluating ${input.media.length} media assets`, {
    mediaCount: input.media.length,
  });
  const selectedSlots: SelectedSlot[] = [];
  const resolvedSlots = resolveTemplateSlots(template, input.output.durationFrames);
  const preferAudibleVisuals = !hasEligibleBackgroundMusic(input, template);

  resolvedSlots.forEach((slot) => {
    const lockedClip = findLockedClip(input.previousProject, lockedClipIds, slot.id);
    if (lockedClip) {
      const clip = preserveLockedClip(lockedClip, slot);
      preservedLockedClipIds.add(clip.id);
      const candidateId =
        typeof clip.metadata['candidateId'] === 'string'
          ? clip.metadata['candidateId']
          : `${clip.assetId}:locked`;
      usageCandidateIds.add(candidateId);
      usageAssetIds.add(clip.assetId);
      selectedSlots.push({
        slot,
        source: null,
        clip,
        score:
          typeof clip.metadata['automaticScore'] === 'number'
            ? clip.metadata['automaticScore']
            : null,
        locked: true,
        reason: 'Locked clip preserved from previous project',
      });
      explain('lock', 'LOCKED_CLIP_PRESERVED', `Preserved locked slot ${slot.id}`, {
        assetId: clip.assetId,
        clipId: clip.id,
      });
      const mediaAvailable = input.media.some(
        (media) => media.assetId === clip.assetId && media.availability === 'ready',
      );
      if (!mediaAvailable) {
        warnings.push({
          code: 'LOCKED_MEDIA_UNAVAILABLE',
          message: `Locked clip ${clip.id} references media that is no longer ready`,
          severity: 'warning',
          path: `lockedClipIds.${clip.id}`,
        });
      }
      return;
    }

    const ranking = rankSlotCandidates(
      input.media,
      slot,
      usage(),
      input.seed,
      preferAudibleVisuals,
    );
    scoreRecords.push(...ranking.records);
    const selectedRecord = ranking.records.find((record) => record.selected);
    if (!ranking.selected || !selectedRecord) {
      const severity = slot.required ? 'warning' : 'info';
      warnings.push({
        code: 'SLOT_REQUIREMENT_UNMET',
        message: `No eligible media for ${slot.id}`,
        severity,
        path: `slots.${slot.id}`,
      });
      selectedSlots.push({
        slot,
        source: null,
        clip: null,
        score: null,
        locked: false,
        reason: 'No eligible media candidate',
      });
      explain('select', 'SLOT_REQUIREMENT_UNMET', `No media selected for ${slot.id}`, {
        required: slot.required,
      });
      return;
    }
    const clip = createVisualClip(
      ranking.selected,
      slot,
      createId(`slot:${slot.id}`),
      input.seed,
      selectedRecord.totalScore,
    );
    usageCandidateIds.add(ranking.selected.candidateId);
    usageAssetIds.add(ranking.selected.media.assetId);
    selectedSlots.push({
      slot,
      source: ranking.selected,
      clip,
      score: selectedRecord.totalScore,
      locked: false,
      reason: selectedRecord.reasons.at(-1) ?? 'Highest deterministic score for slot',
    });
    explain('select', 'SLOT_MEDIA_SELECTED', `Selected media for ${slot.id}`, {
      assetId: ranking.selected.media.assetId,
      candidateId: ranking.selected.candidateId,
      score: selectedRecord.totalScore,
    });
  });

  lockedClipIds.forEach((clipId) => {
    if (!preservedLockedClipIds.has(clipId)) {
      warnings.push({
        code: 'LOCKED_CLIP_NOT_FOUND',
        message: `Locked clip ${clipId} was not found in a matching template slot`,
        severity: 'warning',
        path: `lockedClipIds.${clipId}`,
      });
      explain('lock', 'LOCKED_CLIP_NOT_FOUND', `Could not preserve locked clip ${clipId}`);
    }
  });

  const tracks: Track[] = [];
  for (const trackName of ['main', 'broll'] as const) {
    const clips = selectedSlots
      .filter((selection) => selection.slot.track === trackName && selection.clip)
      .map((selection) => selection.clip)
      .filter((clip): clip is VideoClip | ImageClip => clip !== null)
      .sort((left, right) => left.startFrame - right.startFrame);
    if (clips.length > 0) {
      tracks.push({
        id: createId(`track:${trackName}`),
        kind: 'video',
        name: trackName === 'main' ? '主画面' : 'B-roll',
        enabled: true,
        locked: false,
        muted: false,
        zIndex: trackName === 'main' ? 0 : 10,
        clips,
        metadata: {
          compilerTrack: trackName,
        },
      });
    }
  }
  explain('layout', 'VISUAL_LAYOUT_COMPLETE', `Created ${tracks.length} visual tracks`, {
    selectedSlots: selectedSlots.filter((selection) => selection.clip).length,
  });

  const titleClip = createTitleClip(input, template, createId);
  if (titleClip) {
    tracks.push({
      id: createId('track:title'),
      kind: 'overlay',
      name: '标题',
      enabled: true,
      locked: false,
      muted: false,
      zIndex: 20,
      clips: [titleClip],
      metadata: {
        compilerTrack: 'title',
      },
    });
  }

  const captionClips = createCaptionClips(selectedSlots, template, createId, warnings, explain);
  if (captionClips.length > 0) {
    tracks.push({
      id: createId('track:captions'),
      kind: 'caption',
      name: '字幕',
      enabled: true,
      locked: false,
      muted: false,
      zIndex: 30,
      clips: captionClips,
      metadata: {
        compilerTrack: 'captions',
      },
    });
  }

  const music = createMusic(
    input,
    template,
    selectedSlots,
    createId,
    warnings,
    scoreRecords,
    explain,
  );
  if (music.clips.length > 0) {
    tracks.push({
      id: createId('track:music'),
      kind: 'audio',
      name: music.trackName,
      enabled: true,
      locked: false,
      muted: false,
      zIndex: 0,
      clips: music.clips,
      metadata: {
        compilerTrack: 'music',
      },
    });
  }

  const cta =
    input.cta && template.cta
      ? {
          ...input.cta,
          ...basisPointRangeToFrames(
            template.cta.startBasisPoints,
            template.cta.endBasisPoints,
            input.output.durationFrames,
          ),
        }
      : null;
  if (template.cta && !input.cta) {
    warnings.push({
      code: 'CTA_NOT_CONFIGURED',
      message: 'Template expects a CTA, but no approved CTA was supplied',
      severity: 'warning',
      path: 'cta',
    });
    explain('cta', 'CTA_NOT_CONFIGURED', 'No CTA was generated');
  } else if (cta) {
    explain('cta', 'CTA_GENERATED', 'Generated CTA timing from approved input', {
      action: cta.action,
      startFrame: cta.startFrame,
      durationFrames: cta.durationFrames,
    });
  }

  if (tracks.every((track) => track.clips.length === 0)) {
    throw new CompilerError('Compilation produced no clips');
  }

  const operation = input.previousProject ? 'regenerate' : 'initial';
  const project = parseHotelVideoProject({
    schemaVersion: '1.0.0',
    id: input.projectId,
    hotelId: input.hotelId,
    name: input.brief.title,
    template: input.template,
    output: input.output,
    safeAreas: input.safeAreas,
    brandTokens: input.brandTokens,
    cta,
    tracks,
    generation: {
      compilerVersion: COMPILER_VERSION,
      seed: input.seed,
    },
    metadata: {
      compilation: {
        operation,
        inputHash: context.inputHash,
      },
    },
  });

  const manifestSlots: ManifestSlot[] = selectedSlots.map((selection) => ({
    slotId: selection.slot.id,
    role: selection.slot.role,
    startFrame: selection.slot.startFrame,
    durationFrames: selection.slot.durationFrames,
    clipId: selection.clip?.id ?? null,
    assetId: selection.clip?.assetId ?? null,
    segmentId: selection.source?.segment?.id ?? null,
    score: selection.score,
    locked: selection.locked,
    reason: selection.reason,
  }));
  if (music.manifestSlot) {
    manifestSlots.push(music.manifestSlot);
  }
  explain('complete', 'COMPILATION_COMPLETE', 'Compilation produced a valid project', {
    operation,
    trackCount: project.tracks.length,
    warningCount: warnings.length,
  });

  return compilationResultSchema.parse({
    schemaVersion: COMPILER_SCHEMA_VERSION,
    project,
    manifest: {
      schemaVersion: COMPILER_SCHEMA_VERSION,
      compilerVersion: COMPILER_VERSION,
      operation,
      projectId: input.projectId,
      template: input.template,
      seed: input.seed,
      inputHash: context.inputHash,
      slots: manifestSlots,
      usedAssetIds: [...new Set(manifestSlots.flatMap((slot) => slot.assetId ?? []))].sort(),
      lockedClipIds: [...lockedClipIds].sort(),
      explanationLog: explanations,
    },
    scoreRecords,
    warnings,
  });
}

export function replaceVideoClip(
  rawInput: unknown,
  rawTemplate: unknown,
  rawProject: unknown,
  rawRequest: unknown,
): CompilationResult {
  const inputResult = compilerInputSchema.safeParse(rawInput);
  if (!inputResult.success) {
    throw new CompilerError(`Invalid compiler input: ${formatZodError(inputResult.error)}`);
  }
  const templateResult = compilationTemplateSchema.safeParse(rawTemplate);
  if (!templateResult.success) {
    throw new CompilerError(`Invalid template: ${formatZodError(templateResult.error)}`);
  }
  const requestResult = replaceClipRequestSchema.safeParse(rawRequest);
  if (!requestResult.success) {
    throw new CompilerError(`Invalid replacement: ${formatZodError(requestResult.error)}`);
  }
  const input = inputResult.data;
  const template = templateResult.data;
  const request: ReplaceClipRequest = requestResult.data;
  const project = parseHotelVideoProject(rawProject);
  if (
    project.id !== input.projectId ||
    project.hotelId !== input.hotelId ||
    project.template.id !== template.id ||
    project.template.version !== template.version
  ) {
    throw new CompilerError('Replacement project does not match compiler input and template');
  }

  let target: VideoClip | ImageClip | null = null;
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === request.clipId);
    if (clip) {
      if (clip.kind !== 'video' && clip.kind !== 'image') {
        throw new CompilerError('Only visual video or image clips can be replaced');
      }
      target = clip;
      break;
    }
  }
  if (!target) {
    throw new CompilerError(`Clip ${request.clipId} was not found`);
  }
  const slotId = clipSlotId(target);
  if (!slotId) {
    throw new CompilerError('Replacement target has no compiler slotId metadata');
  }
  const slot = resolveTemplateSlots(template, project.output.durationFrames).find(
    (candidate) => candidate.id === slotId,
  );
  if (!slot) {
    throw new CompilerError(`Template slot ${slotId} no longer exists`);
  }

  const requestedMedia = input.media
    .filter((media) => media.assetId === request.assetId)
    .map((media) =>
      request.segmentId
        ? {
            ...media,
            segments: media.segments.filter((segment) => segment.id === request.segmentId),
          }
        : media,
    );
  if (requestedMedia.length === 0) {
    throw new CompilerError(`Replacement asset ${request.assetId} is not available`);
  }
  if (request.segmentId && requestedMedia.every((media) => media.segments.length === 0)) {
    throw new CompilerError(`Replacement segment ${request.segmentId} is not available`);
  }

  const ranking = rankSlotCandidates(
    requestedMedia,
    slot,
    {
      candidateIds: new Set(),
      assetIds: new Set(),
    },
    input.seed,
  );
  const selectedRecord = ranking.records.find((record) => record.selected);
  if (!ranking.selected || !selectedRecord) {
    const reasons = ranking.records.flatMap((record) => record.reasons);
    throw new CompilerError(
      `Replacement asset does not satisfy slot ${slot.id}: ${reasons.join('; ')}`,
    );
  }

  const replacement = createVisualClip(
    ranking.selected,
    slot,
    target.id,
    input.seed,
    selectedRecord.totalScore,
  );
  const common = {
    ...replacement,
    transform: target.transform,
    transitionIn: target.transitionIn,
    transitionOut: target.transitionOut,
    metadata: {
      ...target.metadata,
      ...replacement.metadata,
      replacedFromAssetId: target.assetId,
      locked: false,
    },
  };
  const replacementClip: VideoClip | ImageClip =
    replacement.kind === 'video'
      ? {
          ...common,
          kind: 'video',
          assetId: replacement.assetId,
          sourceStartFrame: replacement.sourceStartFrame,
          sourceDurationFrames: replacement.sourceDurationFrames,
          volume: replacement.volume,
          muted: replacement.muted,
          playbackRate: replacement.playbackRate,
        }
      : {
          ...common,
          kind: 'image',
          assetId: replacement.assetId,
        };

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => (clip.id === target.id ? replacementClip : clip)),
  }));
  const context = createDeterministicTemplateContext(
    template.id,
    template.version,
    input.seed,
    input,
  );
  const replacedProject = parseHotelVideoProject({
    ...project,
    tracks,
    metadata: {
      ...project.metadata,
      compilation: {
        operation: 'replace',
        inputHash: context.inputHash,
      },
    },
  });
  const warnings: CompilationResult['warnings'] =
    slot.role === 'a-roll'
      ? [
          {
            code: 'CAPTIONS_REQUIRE_REGENERATION',
            message: 'A-roll replacement may require caption regeneration',
            severity: 'warning',
            path: `clips.${target.id}`,
          },
        ]
      : [];

  const manifestSlots: ManifestSlot[] = [];
  replacedProject.tracks.forEach((track) => {
    track.clips.forEach((clip) => {
      if (clip.kind !== 'video' && clip.kind !== 'image' && clip.kind !== 'audio') {
        return;
      }
      const compiledSlotId = clipSlotId(clip);
      if (!compiledSlotId) {
        return;
      }
      const roleValue = clip.metadata['role'];
      const role =
        roleValue === 'a-roll' || roleValue === 'b-roll' || roleValue === 'montage'
          ? roleValue
          : 'music';
      const scoreValue = clip.metadata['automaticScore'];
      const segmentValue = clip.metadata['segmentId'];
      manifestSlots.push({
        slotId: compiledSlotId,
        role,
        startFrame: clip.startFrame,
        durationFrames: clip.durationFrames,
        clipId: clip.id,
        assetId: clip.assetId,
        segmentId: typeof segmentValue === 'string' ? segmentValue : null,
        score: typeof scoreValue === 'number' ? scoreValue : null,
        locked: clip.metadata['locked'] === true,
        reason: clip.id === target.id ? 'User-requested single clip replacement' : 'Unchanged',
      });
    });
  });
  manifestSlots.sort(
    (left, right) =>
      left.startFrame - right.startFrame || compareStrings(left.slotId, right.slotId),
  );

  return compilationResultSchema.parse({
    schemaVersion: COMPILER_SCHEMA_VERSION,
    project: replacedProject,
    manifest: {
      schemaVersion: COMPILER_SCHEMA_VERSION,
      compilerVersion: COMPILER_VERSION,
      operation: 'replace',
      projectId: project.id,
      template: project.template,
      seed: input.seed,
      inputHash: context.inputHash,
      slots: manifestSlots,
      usedAssetIds: [
        ...new Set(
          replacedProject.tracks.flatMap((track) =>
            track.clips.flatMap((clip) =>
              clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'audio'
                ? [clip.assetId]
                : [],
            ),
          ),
        ),
      ].sort(),
      lockedClipIds: input.lockedClipIds,
      explanationLog: [
        {
          sequence: 0,
          stage: 'replace',
          code: 'CLIP_REPLACED',
          message: `Replaced clip ${target.id}`,
          details: {
            fromAssetId: target.assetId,
            toAssetId: replacementClip.assetId,
            slotId,
          },
        },
        {
          sequence: 1,
          stage: 'complete',
          code: 'REPLACEMENT_COMPLETE',
          message: 'Single clip replacement produced a valid project',
          details: {},
        },
      ],
    },
    scoreRecords: ranking.records,
    warnings,
  });
}
