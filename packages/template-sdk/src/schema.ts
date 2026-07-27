import {
  brandTokenSchema,
  callToActionSchema,
  hotelVideoProjectV1Schema,
  safeAreaSchema,
  videoOutputSchema,
} from '@hotelcut/timeline';
import { z } from 'zod';

export const TEMPLATE_INPUT_SCHEMA_VERSION = '1.0.0' as const;
export const TEMPLATE_OUTPUT_SCHEMA_VERSION = '1.0.0' as const;

const templateReferenceSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict();

export const templateMediaCandidateSchema = z
  .object({
    assetId: z.uuid(),
    kind: z.enum(['video', 'image', 'audio', 'logo']),
    durationFrames: z.number().int().positive().nullable(),
    tags: z.array(z.string().min(1).max(80)).default([]),
    scoreBasisPoints: z.number().int().min(0).max(10_000).nullable().default(null),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const templateInputSchema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_INPUT_SCHEMA_VERSION),
    projectId: z.uuid(),
    hotelId: z.uuid(),
    template: templateReferenceSchema,
    seed: z.number().int().min(0).max(4_294_967_295),
    brief: z
      .object({
        id: z.uuid(),
        title: z.string().min(1).max(160),
        platform: z.enum(['douyin', 'xiaohongshu', 'wechat_channels', 'other']),
        durationFrames: z.number().int().positive(),
        tone: z.string().min(1).max(80),
        language: z.string().min(2).max(20),
        objective: z.string().max(300).nullable(),
        targetAudience: z.string().max(200).nullable(),
      })
      .strict(),
    output: videoOutputSchema,
    brandTokens: z.array(brandTokenSchema),
    safeAreas: z.array(safeAreaSchema),
    cta: callToActionSchema.nullable(),
    media: z.array(templateMediaCandidateSchema).min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.brief.durationFrames !== input.output.durationFrames) {
      context.addIssue({
        code: 'custom',
        path: ['brief', 'durationFrames'],
        message: 'Brief and output durationFrames must match',
      });
    }
  });

export const templateWarningSchema = z
  .object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(500),
    severity: z.enum(['info', 'warning']),
    path: z.string().min(1).optional(),
  })
  .strict();

export const templateOutputSchema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_OUTPUT_SCHEMA_VERSION),
    project: hotelVideoProjectV1Schema,
    warnings: z.array(templateWarningSchema).default([]),
  })
  .strict();

export type TemplateMediaCandidate = z.infer<typeof templateMediaCandidateSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type TemplateWarning = z.infer<typeof templateWarningSchema>;
export type TemplateOutput = z.infer<typeof templateOutputSchema>;
export type TemplateOutputInput = z.input<typeof templateOutputSchema>;
