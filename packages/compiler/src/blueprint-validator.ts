import { editBlueprintSchema, type EditBlueprint } from '@hotelcut/schemas';

export interface BlueprintValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface BlueprintValidationResult {
  valid: boolean;
  errors: BlueprintValidationIssue[];
  warnings: BlueprintValidationIssue[];
  normalizedBlueprint: EditBlueprint | null;
}

export function validateEditBlueprint(input: unknown): BlueprintValidationResult {
  const parsed = editBlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join('.'),
        message: issue.message,
      })),
      warnings: [],
      normalizedBlueprint: null,
    };
  }
  const blueprint = {
    ...parsed.data,
    beats: [...parsed.data.beats].sort((a, b) => a.sequence - b.sequence),
  };
  const errors: BlueprintValidationIssue[] = [];
  const warnings: BlueprintValidationIssue[] = [];
  const durationMs = blueprint.durationSeconds * 1_000;
  let expectedStart = 0;
  blueprint.beats.forEach((beat, index) => {
    const path = `beats.${index}`;
    if (beat.startMs !== expectedStart) {
      errors.push({
        code: 'BEAT_COVERAGE',
        path,
        message: 'Beats must be contiguous and cover the full video.',
      });
    }
    if (beat.endMs > durationMs) {
      errors.push({
        code: 'BEAT_OUT_OF_RANGE',
        path,
        message: 'Beat exceeds the target duration.',
      });
    }
    const beatDurationMs = beat.endMs - beat.startMs;
    const shotCount = Math.ceil(beatDurationMs / beat.maximumShotDurationMs);
    if (beatDurationMs / shotCount < beat.minimumShotDurationMs) {
      errors.push({
        code: 'SHOT_DURATION_UNSATISFIABLE',
        path,
        message: 'Beat cannot be split while respecting both minimum and maximum shot duration.',
      });
    }
    if (beat.caption && beat.caption.length > 80) {
      warnings.push({
        code: 'CAPTION_LONG',
        path,
        message: 'Caption exceeds the recommended 80-character limit.',
      });
    }
    if (beat.requiredTags.length === 0 && beat.preferredTags.length === 0) {
      warnings.push({
        code: 'NO_TAG_GUIDANCE',
        path,
        message: 'Beat has no semantic asset guidance.',
      });
    }
    expectedStart = beat.endMs;
  });
  if (expectedStart !== durationMs) {
    errors.push({
      code: 'DURATION_COVERAGE',
      path: 'beats',
      message: 'Beats do not end at the target duration.',
    });
  }
  return { valid: errors.length === 0, errors, warnings, normalizedBlueprint: blueprint };
}
