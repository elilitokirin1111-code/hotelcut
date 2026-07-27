import {
  templateInputSchema,
  templateMediaCandidateSchema,
  templateWarningSchema,
} from '@hotelcut/template-sdk';
import { hotelVideoProjectV1Schema } from '@hotelcut/timeline';
import { z } from 'zod';

export const COMPILER_SCHEMA_VERSION = '1.0.0' as const;
export const COMPILER_VERSION = '1.0.0' as const;

export const compilerWordSchema = z
  .object({
    text: z.string().min(1).max(200),
    startOffsetFrame: z.number().int().nonnegative(),
    durationFrames: z.number().int().positive(),
  })
  .strict();

export const compilerMediaSegmentSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['scene', 'speech', 'vad', 'manual']),
    startFrame: z.number().int().nonnegative(),
    durationFrames: z.number().int().positive(),
    label: z.string().max(160).nullable(),
    tags: z.array(z.string().min(1).max(80)).default([]),
    scoreBasisPoints: z.number().int().min(0).max(10_000).nullable().default(null),
    transcript: z.string().max(4_000).nullable().default(null),
    words: z.array(compilerWordSchema).default([]),
  })
  .strict()
  .superRefine((segment, context) => {
    segment.words.forEach((word, index) => {
      if (word.startOffsetFrame + word.durationFrames > segment.durationFrames) {
        context.addIssue({
          code: 'custom',
          path: ['words', index, 'durationFrames'],
          message: 'Word timing exceeds the media segment',
        });
      }
    });
  });

export const compilerMediaCandidateSchema = templateMediaCandidateSchema
  .extend({
    availability: z.enum(['ready', 'failed', 'processing']).default('ready'),
    contentFingerprint: z
      .string()
      .regex(/^[0-9A-Fa-f]{64}$/)
      .nullable()
      .default(null),
    analysis: z
      .object({
        width: z.number().int().positive().nullable().default(null),
        height: z.number().int().positive().nullable().default(null),
        frameRate: z.number().positive().max(240).nullable().default(null),
        hasAudio: z.boolean().default(false),
        silenceRatioBasisPoints: z.number().int().min(0).max(10_000).default(0),
        qualityBasisPoints: z.number().int().min(0).max(10_000).default(5_000),
      })
      .strict(),
    segments: z.array(compilerMediaSegmentSchema).default([]),
  })
  .superRefine((candidate, context) => {
    if (
      candidate.durationFrames === null &&
      candidate.kind !== 'image' &&
      candidate.kind !== 'logo'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['durationFrames'],
        message: `${candidate.kind} media requires durationFrames`,
      });
    }
    const mediaDurationFrames = candidate.durationFrames;
    if (mediaDurationFrames !== null) {
      candidate.segments.forEach((segment, index) => {
        if (segment.startFrame + segment.durationFrames > mediaDurationFrames) {
          context.addIssue({
            code: 'custom',
            path: ['segments', index, 'durationFrames'],
            message: 'Segment timing exceeds the media duration',
          });
        }
      });
    }
  });

export const compilerInputSchema = templateInputSchema.safeExtend({
  media: z.array(compilerMediaCandidateSchema).min(1),
  previousProject: hotelVideoProjectV1Schema.nullable().default(null),
  lockedClipIds: z.array(z.uuid()).default([]),
});

export const scoreComponentSchema = z
  .object({
    name: z.enum([
      'base',
      'quality',
      'required-tags',
      'preferred-tags',
      'duration',
      'orientation',
      'speech',
      'silence',
      'deduplication',
      'tie-break',
    ]),
    value: z.number().int().min(-20_000).max(20_000),
    detail: z.string().min(1).max(300),
  })
  .strict();

export const mediaScoreRecordSchema = z
  .object({
    slotId: z.string().min(1).max(120),
    candidateId: z.string().min(1).max(240),
    assetId: z.uuid(),
    segmentId: z.uuid().nullable(),
    eligible: z.boolean(),
    selected: z.boolean(),
    totalScore: z.number().int().min(-100_000).max(100_000),
    components: z.array(scoreComponentSchema),
    reasons: z.array(z.string().min(1).max(300)),
  })
  .strict();

export const generationExplanationSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    stage: z.enum([
      'filter',
      'score',
      'select',
      'layout',
      'caption',
      'cta',
      'music',
      'lock',
      'replace',
      'complete',
    ]),
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(500),
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const manifestSlotSchema = z
  .object({
    slotId: z.string().min(1).max(120),
    role: z.enum(['a-roll', 'b-roll', 'montage', 'music']),
    startFrame: z.number().int().nonnegative(),
    durationFrames: z.number().int().positive(),
    clipId: z.uuid().nullable(),
    assetId: z.uuid().nullable(),
    segmentId: z.uuid().nullable(),
    score: z.number().int().nullable(),
    locked: z.boolean(),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const generationManifestSchema = z
  .object({
    schemaVersion: z.literal(COMPILER_SCHEMA_VERSION),
    compilerVersion: z.literal(COMPILER_VERSION),
    operation: z.enum(['initial', 'regenerate', 'replace']),
    projectId: z.uuid(),
    template: z
      .object({
        id: z.string().min(1).max(120),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
      })
      .strict(),
    seed: z.number().int().min(0).max(4_294_967_295),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/),
    slots: z.array(manifestSlotSchema),
    usedAssetIds: z.array(z.uuid()),
    lockedClipIds: z.array(z.uuid()),
    explanationLog: z.array(generationExplanationSchema),
  })
  .strict();

export const compilationResultSchema = z
  .object({
    schemaVersion: z.literal(COMPILER_SCHEMA_VERSION),
    project: hotelVideoProjectV1Schema,
    manifest: generationManifestSchema,
    scoreRecords: z.array(mediaScoreRecordSchema),
    warnings: z.array(templateWarningSchema),
  })
  .strict();

export const replaceClipRequestSchema = z
  .object({
    clipId: z.uuid(),
    assetId: z.uuid(),
    segmentId: z.uuid().nullable().default(null),
  })
  .strict();

export type CompilerWord = z.infer<typeof compilerWordSchema>;
export type CompilerMediaSegment = z.infer<typeof compilerMediaSegmentSchema>;
export type CompilerMediaCandidate = z.infer<typeof compilerMediaCandidateSchema>;
export type CompilerInput = z.infer<typeof compilerInputSchema>;
export type ScoreComponent = z.infer<typeof scoreComponentSchema>;
export type MediaScoreRecord = z.infer<typeof mediaScoreRecordSchema>;
export type GenerationExplanation = z.infer<typeof generationExplanationSchema>;
export type ManifestSlot = z.infer<typeof manifestSlotSchema>;
export type GenerationManifest = z.infer<typeof generationManifestSchema>;
export type CompilationResult = z.infer<typeof compilationResultSchema>;
export type ReplaceClipRequest = z.infer<typeof replaceClipRequestSchema>;
