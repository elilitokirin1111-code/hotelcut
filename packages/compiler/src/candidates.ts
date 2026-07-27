import { createHash } from 'node:crypto';

import type {
  CompilerMediaCandidate,
  CompilerMediaSegment,
  MediaScoreRecord,
  ScoreComponent,
} from './schema.js';
import type { ResolvedTemplateSlot } from './template.js';

export interface SourceCandidate {
  candidateId: string;
  media: CompilerMediaCandidate;
  segment: CompilerMediaSegment | null;
  sourceStartFrame: number;
  availableDurationFrames: number | null;
  tags: readonly string[];
  transcript: string | null;
  duplicateOfAssetId: string | null;
}

export interface CandidateUsage {
  candidateIds: ReadonlySet<string>;
  assetIds: ReadonlySet<string>;
}

interface ScoredCandidate {
  source: SourceCandidate;
  record: MediaScoreRecord;
}

function normalizedTags(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].sort();
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableRank(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return ((digest[0] ?? 0) << 8) + (digest[1] ?? 0);
}

function mediaPreference(media: CompilerMediaCandidate): number {
  return (media.scoreBasisPoints ?? 5_000) + media.analysis.qualityBasisPoints;
}

export function findDuplicateAssets(
  media: readonly CompilerMediaCandidate[],
): ReadonlyMap<string, string> {
  const winnersByFingerprint = new Map<string, CompilerMediaCandidate>();
  const duplicates = new Map<string, string>();

  [...media]
    .filter((candidate) => candidate.contentFingerprint !== null)
    .sort((left, right) => compareStrings(left.assetId, right.assetId))
    .forEach((candidate) => {
      const fingerprint = candidate.contentFingerprint;
      if (!fingerprint) {
        return;
      }
      const winner = winnersByFingerprint.get(fingerprint);
      if (!winner) {
        winnersByFingerprint.set(fingerprint, candidate);
        return;
      }
      if (mediaPreference(candidate) > mediaPreference(winner)) {
        duplicates.set(winner.assetId, candidate.assetId);
        winnersByFingerprint.set(fingerprint, candidate);
      } else {
        duplicates.set(candidate.assetId, winner.assetId);
      }
    });

  return duplicates;
}

function relevantSegments(
  media: CompilerMediaCandidate,
  role: ResolvedTemplateSlot['role'],
): CompilerMediaSegment[] {
  if (role === 'a-roll') {
    const speech = media.segments.filter(
      (segment) => segment.kind === 'speech' || segment.kind === 'manual',
    );
    return speech.length > 0 ? speech : [];
  }
  const visual = media.segments.filter(
    (segment) => segment.kind === 'scene' || segment.kind === 'manual',
  );
  return visual.length > 0 ? visual : [];
}

export function splitARollRange(
  startFrame: number,
  durationFrames: number,
  maximumDurationFrames: number,
): Array<{ startFrame: number; durationFrames: number }> {
  const ranges: Array<{ startFrame: number; durationFrames: number }> = [];
  let cursor = startFrame;
  let remaining = durationFrames;
  while (remaining > 0) {
    const duration = Math.min(remaining, maximumDurationFrames);
    ranges.push({ startFrame: cursor, durationFrames: duration });
    cursor += duration;
    remaining -= duration;
  }
  return ranges;
}

export function buildSourceCandidates(
  mediaList: readonly CompilerMediaCandidate[],
  slot: ResolvedTemplateSlot,
): SourceCandidate[] {
  const duplicates = findDuplicateAssets(mediaList);
  const sources: SourceCandidate[] = [];

  mediaList.forEach((media) => {
    const duplicateOfAssetId = duplicates.get(media.assetId) ?? null;
    if (media.kind === 'image') {
      sources.push({
        candidateId: `${media.assetId}:whole`,
        media,
        segment: null,
        sourceStartFrame: 0,
        availableDurationFrames: null,
        tags: normalizedTags(media.tags),
        transcript: null,
        duplicateOfAssetId,
      });
      return;
    }
    if (media.kind !== 'video') {
      return;
    }

    const segments = relevantSegments(media, slot.role);
    if (segments.length === 0) {
      sources.push({
        candidateId: `${media.assetId}:whole`,
        media,
        segment: null,
        sourceStartFrame: 0,
        availableDurationFrames: media.durationFrames,
        tags: normalizedTags(media.tags),
        transcript: null,
        duplicateOfAssetId,
      });
      return;
    }

    segments.forEach((segment) => {
      const ranges =
        slot.role === 'a-roll'
          ? splitARollRange(
              segment.startFrame,
              segment.durationFrames,
              Math.max(slot.durationFrames * 2, slot.durationFrames),
            )
          : [{ startFrame: segment.startFrame, durationFrames: segment.durationFrames }];
      ranges.forEach((range, rangeIndex) => {
        sources.push({
          candidateId: `${media.assetId}:${segment.id}:${rangeIndex}`,
          media,
          segment,
          sourceStartFrame: range.startFrame,
          availableDurationFrames: range.durationFrames,
          tags: normalizedTags([
            ...media.tags,
            ...segment.tags,
            ...(segment.label ? [segment.label] : []),
          ]),
          transcript: segment.transcript,
          duplicateOfAssetId,
        });
      });
    });
  });

  return sources.sort((left, right) => compareStrings(left.candidateId, right.candidateId));
}

function scoreSource(
  source: SourceCandidate,
  slot: ResolvedTemplateSlot,
  usage: CandidateUsage,
  seed: number,
): ScoredCandidate {
  const components: ScoreComponent[] = [];
  const reasons: string[] = [];
  let eligible = true;

  const add = (component: ScoreComponent): void => {
    components.push(component);
  };

  if (source.media.availability !== 'ready') {
    eligible = false;
    reasons.push(`Asset is ${source.media.availability}`);
  }
  if (!slot.acceptedKinds.includes(source.media.kind as 'video' | 'image')) {
    eligible = false;
    reasons.push(`${source.media.kind} is not accepted by this slot`);
  }
  if (
    source.availableDurationFrames !== null &&
    source.availableDurationFrames < slot.durationFrames
  ) {
    eligible = false;
    reasons.push(
      `Available duration ${source.availableDurationFrames} is shorter than ${slot.durationFrames}`,
    );
  }
  if (source.duplicateOfAssetId) {
    eligible = false;
    reasons.push(`Duplicate of higher-quality asset ${source.duplicateOfAssetId}`);
    add({
      name: 'deduplication',
      value: -10_000,
      detail: `Fingerprint duplicates ${source.duplicateOfAssetId}`,
    });
  }
  if (usage.candidateIds.has(source.candidateId)) {
    eligible = false;
    reasons.push('Candidate source range is already used');
  }
  if (!slot.allowAssetReuse && usage.assetIds.has(source.media.assetId)) {
    eligible = false;
    reasons.push('Asset is already used by another slot');
  }

  const tagSet = new Set(source.tags);
  const requiredMatches = slot.requiredTags.filter((tag) => tagSet.has(tag.toLowerCase()));
  if (slot.requiredTags.length > 0 && requiredMatches.length === 0) {
    eligible = false;
    reasons.push(`None of the required tags matched: ${slot.requiredTags.join(', ')}`);
  }

  const base = source.segment?.scoreBasisPoints ?? source.media.scoreBasisPoints ?? 5_000;
  add({
    name: 'base',
    value: base,
    detail: source.segment?.scoreBasisPoints
      ? 'Analyzed segment base score'
      : 'Candidate analysis base score',
  });
  add({
    name: 'quality',
    value: Math.round((source.media.analysis.qualityBasisPoints - 5_000) / 2),
    detail: `Technical quality ${source.media.analysis.qualityBasisPoints}`,
  });
  add({
    name: 'required-tags',
    value: requiredMatches.length * 1_200,
    detail:
      requiredMatches.length > 0
        ? `Matched ${requiredMatches.join(', ')}`
        : 'No required tag bonus',
  });
  const preferredMatches = slot.preferredTags.filter((tag) => tagSet.has(tag.toLowerCase()));
  add({
    name: 'preferred-tags',
    value: preferredMatches.length * 500,
    detail:
      preferredMatches.length > 0
        ? `Matched ${preferredMatches.join(', ')}`
        : 'No preferred tag bonus',
  });

  const durationSlack =
    source.availableDurationFrames === null
      ? slot.durationFrames
      : source.availableDurationFrames - slot.durationFrames;
  add({
    name: 'duration',
    value: Math.max(0, Math.min(800, durationSlack)),
    detail:
      source.availableDurationFrames === null
        ? 'Still image can fill the slot'
        : `${Math.max(0, durationSlack)} spare frames`,
  });

  const width = source.media.analysis.width;
  const height = source.media.analysis.height;
  const orientationValue = width !== null && height !== null && height >= width ? 300 : -200;
  add({
    name: 'orientation',
    value: orientationValue,
    detail: orientationValue > 0 ? 'Portrait-compatible media' : 'Landscape crop required',
  });

  if (slot.role === 'a-roll') {
    if (source.media.kind !== 'video') {
      eligible = false;
      reasons.push('A-roll requires video');
    }
    if (!source.media.analysis.hasAudio) {
      eligible = false;
      reasons.push('A-roll requires an audio track');
    }
    if (source.media.analysis.silenceRatioBasisPoints > 8_000) {
      eligible = false;
      reasons.push('A-roll is predominantly silent');
    }
    add({
      name: 'speech',
      value: source.transcript ? 1_000 : -500,
      detail: source.transcript ? 'Speech transcript is available' : 'No speech transcript',
    });
    add({
      name: 'silence',
      value: -Math.round(source.media.analysis.silenceRatioBasisPoints / 5),
      detail: `Silence ratio ${source.media.analysis.silenceRatioBasisPoints}`,
    });
  }

  const tieBreak = stableRank(`${seed}:${slot.id}:${source.candidateId}`) % 100;
  add({
    name: 'tie-break',
    value: tieBreak,
    detail: 'Seeded deterministic tie-break',
  });

  const totalScore = components.reduce((total, component) => total + component.value, 0);
  if (eligible) {
    reasons.push('Eligible after filtering and duration matching');
  }

  return {
    source,
    record: {
      slotId: slot.id,
      candidateId: source.candidateId,
      assetId: source.media.assetId,
      segmentId: source.segment?.id ?? null,
      eligible,
      selected: false,
      totalScore,
      components,
      reasons,
    },
  };
}

export function rankSlotCandidates(
  media: readonly CompilerMediaCandidate[],
  slot: ResolvedTemplateSlot,
  usage: CandidateUsage,
  seed: number,
): { selected: SourceCandidate | null; records: MediaScoreRecord[] } {
  const scored = buildSourceCandidates(media, slot).map((source) =>
    scoreSource(source, slot, usage, seed),
  );
  const ranked = scored
    .filter((entry) => entry.record.eligible)
    .sort(
      (left, right) =>
        right.record.totalScore - left.record.totalScore ||
        compareStrings(left.source.candidateId, right.source.candidateId),
    );
  const selected = ranked[0]?.source ?? null;
  if (selected) {
    const selectedRecord = scored.find(
      (entry) => entry.source.candidateId === selected.candidateId,
    );
    if (selectedRecord) {
      selectedRecord.record.selected = true;
      selectedRecord.record.reasons.push('Highest deterministic score for slot');
    }
  }

  return {
    selected,
    records: scored.map((entry) => entry.record),
  };
}

export function deterministicSourceStart(
  source: SourceCandidate,
  durationFrames: number,
  seed: number,
  slotId: string,
): number {
  const slack = Math.max(0, (source.availableDurationFrames ?? durationFrames) - durationFrames);
  if (slack === 0 || source.segment?.kind === 'speech') {
    return source.sourceStartFrame;
  }
  return source.sourceStartFrame + (stableRank(`${seed}:${slotId}:source`) % (slack + 1));
}
