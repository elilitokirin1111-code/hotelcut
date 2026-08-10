import { z } from 'zod';

const templateIdSchema = z.uuid();
const templateDateTimeSchema = z.iso.datetime({ offset: true });

export const aiTemplateAudioPolicySchema = z.enum(['dialogue', 'music', 'ambient', 'mute']);
export const aiTemplateTransitionSchema = z.enum(['cut', 'dissolve', 'fade']);

export const aiTemplateBeatSchema = z
  .object({
    sequence: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    purpose: z.string().trim().min(1).max(240),
    visual: z.string().trim().min(1).max(500),
    requiredTags: z.array(z.string().trim().min(1).max(80)).max(12),
    preferredTags: z.array(z.string().trim().min(1).max(80)).max(12),
    preferredShotTypes: z.array(z.string().trim().min(1).max(80)).max(8),
    preferredMotionTypes: z.array(z.string().trim().min(1).max(80)).max(8),
    maximumShotDurationMs: z.number().int().positive(),
    maximumAssetReuse: z.number().int().positive().max(10),
    audioPolicy: aiTemplateAudioPolicySchema,
    caption: z.string().max(240).nullable(),
    transitionOut: aiTemplateTransitionSchema.nullable(),
  })
  .strict()
  .refine((beat) => beat.endMs > beat.startMs, 'Beat must have positive duration');

export const aiTemplateSpecSchema = z
  .object({
    durationSeconds: z.number().int().min(5).max(180),
    beats: z.array(aiTemplateBeatSchema).min(1).max(60),
    globalRules: z.array(z.string().trim().min(1).max(120)).max(20),
  })
  .strict()
  .refine((spec) => {
    const first = spec.beats[0];
    const last = spec.beats[spec.beats.length - 1];
    return first !== undefined && last !== undefined && first.startMs === 0 && last.endMs > 0;
  }, 'Beats must cover the template timeline');

export const aiTemplateSchema = z
  .object({
    id: templateIdSchema,
    hotelId: templateIdSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    durationSeconds: z.number().int().min(5).max(180),
    spec: aiTemplateSpecSchema,
    createdByUserId: templateIdSchema,
    createdAt: templateDateTimeSchema,
    updatedAt: templateDateTimeSchema,
  })
  .strict();

export const generateAiTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    objective: z.string().trim().min(1).max(500).optional(),
    durationSeconds: z.number().int().min(5).max(180).optional(),
  })
  .strict();

export const aiTemplateGenerationOutputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    durationSeconds: z.number().int().min(5).max(180),
    spec: aiTemplateSpecSchema,
  })
  .strict();

export const createAiTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    durationSeconds: z.number().int().min(5).max(180),
    spec: aiTemplateSpecSchema,
  })
  .strict();

export const aiTemplateIdParamsSchema = z
  .object({
    hotelId: templateIdSchema,
    aiTemplateId: templateIdSchema,
  })
  .strict();

export type AiTemplateBeat = z.infer<typeof aiTemplateBeatSchema>;
export type AiTemplateSpec = z.infer<typeof aiTemplateSpecSchema>;
export type AiTemplate = z.infer<typeof aiTemplateSchema>;
export type GenerateAiTemplateInput = z.infer<typeof generateAiTemplateSchema>;
export type AiTemplateGenerationOutput = z.infer<typeof aiTemplateGenerationOutputSchema>;
export type CreateAiTemplateInput = z.infer<typeof createAiTemplateSchema>;
