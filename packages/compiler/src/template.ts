import { z } from 'zod';

const stableKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/);

export const templateSlotSchema = z
  .object({
    id: stableKeySchema,
    track: z.enum(['main', 'broll']),
    role: z.enum(['a-roll', 'b-roll', 'montage']),
    startBasisPoints: z.number().int().min(0).max(9_999),
    endBasisPoints: z.number().int().min(1).max(10_000),
    acceptedKinds: z.array(z.enum(['video', 'image'])).min(1),
    requiredTags: z.array(z.string().min(1).max(80)).default([]),
    preferredTags: z.array(z.string().min(1).max(80)).default([]),
    required: z.boolean().default(true),
    allowAssetReuse: z.boolean().default(false),
    audioPolicy: z.enum(['keep', 'mute']),
    transition: z.enum(['cut', 'dissolve', 'fade']).default('cut'),
  })
  .strict()
  .refine((slot) => slot.endBasisPoints > slot.startBasisPoints, {
    path: ['endBasisPoints'],
    message: 'Slot end must be after its start',
  });

const captionLayoutSchema = z
  .object({
    safeAreaId: stableKeySchema,
    fontToken: stableKeySchema,
    colorToken: stableKeySchema,
    backgroundColorToken: stableKeySchema.optional(),
    fontSize: z.number().positive().max(500),
    maxVisualWidth: z.number().int().positive().max(80).default(16),
    maxLines: z.number().int().min(1).max(4).default(2),
  })
  .strict();

const titleLayoutSchema = z
  .object({
    startBasisPoints: z.number().int().min(0).max(9_999),
    endBasisPoints: z.number().int().min(1).max(10_000),
    safeAreaId: stableKeySchema.optional(),
    fontToken: stableKeySchema,
    colorToken: stableKeySchema,
    backgroundColorToken: stableKeySchema.optional(),
    fontSize: z.number().positive().max(500),
  })
  .strict()
  .refine((layout) => layout.endBasisPoints > layout.startBasisPoints, {
    path: ['endBasisPoints'],
    message: 'Title end must be after its start',
  });

const ctaLayoutSchema = z
  .object({
    startBasisPoints: z.number().int().min(0).max(9_999),
    endBasisPoints: z.number().int().min(1).max(10_000),
  })
  .strict()
  .refine((layout) => layout.endBasisPoints > layout.startBasisPoints, {
    path: ['endBasisPoints'],
    message: 'CTA end must be after its start',
  });

const musicLayoutSchema = z
  .object({
    requiredTags: z.array(z.string().min(1).max(80)).min(1),
    preferredTags: z.array(z.string().min(1).max(80)).default([]),
    volume: z.number().min(0).max(2),
    fadeDurationFrames: z.number().int().nonnegative().max(300),
  })
  .strict();

export const compilationTemplateSchema = z
  .object({
    id: stableKeySchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1).max(160),
    minDurationSeconds: z.number().int().positive().max(180),
    maxDurationSeconds: z.number().int().positive().max(180),
    slots: z.array(templateSlotSchema).min(1),
    captions: captionLayoutSchema.nullable(),
    title: titleLayoutSchema.nullable(),
    cta: ctaLayoutSchema.nullable(),
    music: musicLayoutSchema.nullable(),
  })
  .strict()
  .superRefine((template, context) => {
    if (template.maxDurationSeconds < template.minDurationSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['maxDurationSeconds'],
        message: 'Maximum duration must be at least the minimum duration',
      });
    }

    const ids = new Set<string>();
    template.slots.forEach((slot, index) => {
      if (ids.has(slot.id)) {
        context.addIssue({
          code: 'custom',
          path: ['slots', index, 'id'],
          message: `Duplicate slot id "${slot.id}"`,
        });
      }
      ids.add(slot.id);
    });

    for (const track of ['main', 'broll'] as const) {
      const slots = template.slots
        .filter((slot) => slot.track === track)
        .sort((left, right) => left.startBasisPoints - right.startBasisPoints);
      let previousEnd = 0;
      slots.forEach((slot) => {
        if (slot.startBasisPoints < previousEnd) {
          const index = template.slots.findIndex((candidate) => candidate.id === slot.id);
          context.addIssue({
            code: 'custom',
            path: ['slots', index, 'startBasisPoints'],
            message: `Slot overlaps a previous ${track} slot`,
          });
        }
        previousEnd = slot.endBasisPoints;
      });
    }
  });

export type TemplateSlot = z.infer<typeof templateSlotSchema>;
export type CompilationTemplate = z.infer<typeof compilationTemplateSchema>;

export function defineCompilationTemplate(input: CompilationTemplate): CompilationTemplate {
  return Object.freeze(compilationTemplateSchema.parse(input));
}

export interface ResolvedTemplateSlot extends TemplateSlot {
  startFrame: number;
  durationFrames: number;
}

export function resolveTemplateSlots(
  template: CompilationTemplate,
  durationFrames: number,
): ResolvedTemplateSlot[] {
  return template.slots.map((slot) => {
    const startFrame = Math.round((durationFrames * slot.startBasisPoints) / 10_000);
    const endFrame = Math.round((durationFrames * slot.endBasisPoints) / 10_000);
    return {
      ...slot,
      startFrame,
      durationFrames: Math.max(1, endFrame - startFrame),
    };
  });
}

export function basisPointRangeToFrames(
  startBasisPoints: number,
  endBasisPoints: number,
  durationFrames: number,
): { startFrame: number; durationFrames: number } {
  const startFrame = Math.round((durationFrames * startBasisPoints) / 10_000);
  const endFrame = Math.round((durationFrames * endBasisPoints) / 10_000);
  return {
    startFrame,
    durationFrames: Math.max(1, endFrame - startFrame),
  };
}
