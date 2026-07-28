import type { CaptionClip, HotelVideoProjectV1 } from '@hotelcut/timeline';

export const qualityCheckNames = [
  'output_exists',
  'ffprobe_readable',
  'vertical_resolution',
  'frame_rate',
  'duration',
  'audio_track',
  'caption_safe_area',
  'asset_completeness',
  'black_frames',
  'abnormal_silence',
  'cta_completeness',
] as const;

export type QualityCheckName = (typeof qualityCheckNames)[number];
export type QualityCheckStatus = 'passed' | 'warning' | 'failed';
export type QualityReportStatus = 'passed' | 'warning' | 'failed';

export interface DetectionRange {
  startSeconds: number;
  endSeconds: number;
}

export interface MediaProbe {
  readable: boolean;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  durationSeconds: number | null;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

export interface QualityControlInput {
  project: HotelVideoProjectV1;
  outputExists: boolean;
  probe: MediaProbe | null;
  missingAssetIds: readonly string[];
  blackSegments: readonly DetectionRange[];
  silentSegments: readonly DetectionRange[];
}

export interface QualityCheckResult {
  name: QualityCheckName;
  status: QualityCheckStatus;
  message: string;
  expected?: unknown;
  observed?: unknown;
}

export interface QualityControlResult {
  status: QualityReportStatus;
  scoreBasisPoints: number;
  checks: QualityCheckResult[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

function check(
  name: QualityCheckName,
  passed: boolean,
  message: string,
  expected?: unknown,
  observed?: unknown,
): QualityCheckResult {
  return {
    name,
    status: passed ? 'passed' : 'failed',
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(observed === undefined ? {} : { observed }),
  };
}

function longestRange(ranges: readonly DetectionRange[]): number {
  return ranges.reduce(
    (longest, range) => Math.max(longest, Math.max(0, range.endSeconds - range.startSeconds)),
    0,
  );
}

function captionFitsSafeArea(
  project: HotelVideoProjectV1,
  caption: CaptionClip,
): { fits: boolean; reason: string } {
  if (!caption.safeAreaId) {
    return { fits: false, reason: `Caption ${caption.id} has no safe area` };
  }
  const safeArea = project.safeAreas.find((candidate) => candidate.id === caption.safeAreaId);
  if (!safeArea) {
    return { fits: false, reason: `Caption ${caption.id} references a missing safe area` };
  }

  const availableWidth = safeArea.width * project.output.width;
  const availableHeight = safeArea.height * project.output.height;
  const lineHeight = caption.style.fontSize * caption.style.lineHeight;
  const explicitLines = caption.text.split(/\r?\n/u);
  const estimatedCharactersPerLine = Math.max(
    1,
    Math.floor(availableWidth / Math.max(1, caption.style.fontSize)),
  );
  const estimatedLines = explicitLines.reduce(
    (total, line) => total + Math.max(1, Math.ceil([...line].length / estimatedCharactersPerLine)),
    0,
  );
  const renderedLines = Math.min(estimatedLines, caption.style.maxLines);
  if (estimatedLines > caption.style.maxLines) {
    return {
      fits: false,
      reason: `Caption ${caption.id} requires ${estimatedLines} lines but allows ${caption.style.maxLines}`,
    };
  }
  if (renderedLines * lineHeight > availableHeight) {
    return {
      fits: false,
      reason: `Caption ${caption.id} requires ${Math.ceil(renderedLines * lineHeight)}px but has ${Math.floor(availableHeight)}px`,
    };
  }
  return { fits: true, reason: `Caption ${caption.id} fits ${caption.safeAreaId}` };
}

function captionsFit(project: HotelVideoProjectV1): { fits: boolean; reasons: string[] } {
  const captions = project.tracks.flatMap((track) =>
    track.clips.filter((clip): clip is CaptionClip => clip.kind === 'caption'),
  );
  const results = captions.map((caption) => captionFitsSafeArea(project, caption));
  return {
    fits: results.every((result) => result.fits),
    reasons: results.filter((result) => !result.fits).map((result) => result.reason),
  };
}

function ctaIsComplete(project: HotelVideoProjectV1): boolean {
  const cta = project.cta;
  if (!cta) {
    return true;
  }
  const safeAreaExists = project.safeAreas.some((safeArea) => safeArea.id === cta.safeAreaId);
  const requiredDestination = ['booking', 'contact', 'navigate'].includes(cta.action);
  return (
    cta.text.trim().length > 0 &&
    safeAreaExists &&
    cta.fontToken.length > 0 &&
    cta.textColorToken.length > 0 &&
    cta.backgroundColorToken.length > 0 &&
    (!requiredDestination || Boolean(cta.destination?.trim()))
  );
}

export function runQualityControl(input: QualityControlInput): QualityControlResult {
  const expectedDuration = input.project.output.durationFrames / input.project.output.frameRate;
  const durationTolerance = Math.max(0.15, 2 / input.project.output.frameRate);
  const probe = input.probe;
  const captionResult = captionsFit(input.project);
  const longestBlack = longestRange(input.blackSegments);
  const longestSilence = longestRange(input.silentSegments);
  const blackThreshold = Math.max(2, expectedDuration * 0.08);
  const silenceThreshold = Math.max(5, expectedDuration * 0.2);

  const checks: QualityCheckResult[] = [
    check('output_exists', input.outputExists, 'Rendered MP4 exists', true, input.outputExists),
    check(
      'ffprobe_readable',
      probe?.readable === true,
      'Rendered MP4 is readable by ffprobe',
      true,
      probe?.readable ?? false,
    ),
    check(
      'vertical_resolution',
      probe?.width === 1080 && probe.height === 1920,
      'Output resolution is 1080x1920',
      { width: 1080, height: 1920 },
      { width: probe?.width ?? null, height: probe?.height ?? null },
    ),
    check(
      'frame_rate',
      probe?.frameRate !== null &&
        probe?.frameRate !== undefined &&
        Math.abs(probe.frameRate - input.project.output.frameRate) <= 0.01,
      'Output frame rate matches the project',
      input.project.output.frameRate,
      probe?.frameRate ?? null,
    ),
    check(
      'duration',
      probe?.durationSeconds !== null &&
        probe?.durationSeconds !== undefined &&
        Math.abs(probe.durationSeconds - expectedDuration) <= durationTolerance,
      'Output duration is within two frames of the project',
      expectedDuration,
      probe?.durationSeconds ?? null,
    ),
    check(
      'audio_track',
      probe?.hasAudio === true,
      'Output contains an audio track',
      true,
      probe?.hasAudio ?? false,
    ),
    check(
      'caption_safe_area',
      captionResult.fits,
      captionResult.fits ? 'All captions fit their safe areas' : captionResult.reasons.join('; '),
      true,
      captionResult.fits,
    ),
    check(
      'asset_completeness',
      input.missingAssetIds.length === 0,
      'Every referenced media asset was resolved',
      [],
      [...input.missingAssetIds],
    ),
    check(
      'black_frames',
      longestBlack < blackThreshold,
      'No unexpected long black section was detected',
      { maximumSeconds: blackThreshold },
      { longestSeconds: longestBlack },
    ),
    check(
      'abnormal_silence',
      longestSilence < silenceThreshold,
      'No unexpected long silent section was detected',
      { maximumSeconds: silenceThreshold },
      { longestSeconds: longestSilence },
    ),
    check(
      'cta_completeness',
      ctaIsComplete(input.project),
      'CTA fields and destination are complete when required',
      true,
      ctaIsComplete(input.project),
    ),
  ];

  const summary = {
    passed: checks.filter((result) => result.status === 'passed').length,
    warnings: checks.filter((result) => result.status === 'warning').length,
    failed: checks.filter((result) => result.status === 'failed').length,
  };
  const scoreBasisPoints = Math.round(
    ((summary.passed + summary.warnings * 0.5) / checks.length) * 10_000,
  );

  return {
    status: summary.failed > 0 ? 'failed' : summary.warnings > 0 ? 'warning' : 'passed',
    scoreBasisPoints,
    checks,
    summary,
  };
}
