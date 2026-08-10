import { z } from 'zod';

const clipCommandShape = {
  clipId: z.uuid(),
};

export const replaceClipAssetCommandSchema = z
  .object({
    type: z.literal('replace-clip-asset'),
    ...clipCommandShape,
    assetId: z.uuid(),
  })
  .strict();

export const trimVideoCommandSchema = z
  .object({
    type: z.literal('trim-video'),
    ...clipCommandShape,
    sourceStartFrame: z.number().int().nonnegative(),
    sourceDurationFrames: z.number().int().positive(),
  })
  .strict();

/** Moves a clip on its existing track without changing its duration. */
export const moveClipCommandSchema = z
  .object({
    type: z.literal('move-clip'),
    ...clipCommandShape,
    startFrame: z.number().int().nonnegative(),
  })
  .strict();

/** Changes an editorial clip's duration while keeping its timeline start. */
export const resizeClipCommandSchema = z
  .object({
    type: z.literal('resize-clip'),
    ...clipCommandShape,
    durationFrames: z.number().int().positive(),
  })
  .strict();

/** Sets the volume of an A-roll/B-roll or audio clip. */
export const updateClipVolumeCommandSchema = z
  .object({
    type: z.literal('update-clip-volume'),
    ...clipCommandShape,
    volume: z.number().min(0).max(2),
    muted: z.boolean().optional(),
  })
  .strict();

export const updateCaptionCommandSchema = z
  .object({
    type: z.literal('update-caption'),
    ...clipCommandShape,
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const updateTitleCommandSchema = z
  .object({
    type: z.literal('update-title'),
    ...clipCommandShape,
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const updateCtaCommandSchema = z
  .object({
    type: z.literal('update-cta'),
    text: z.string().trim().min(1).max(300),
    action: z.enum(['booking', 'contact', 'navigate', 'follow', 'custom']),
    destination: z.string().trim().max(500).nullable(),
  })
  .strict();

export const replaceMusicCommandSchema = z
  .object({
    type: z.literal('replace-music'),
    assetId: z.uuid(),
  })
  .strict();

export const editorCommandSchema = z.discriminatedUnion('type', [
  replaceClipAssetCommandSchema,
  trimVideoCommandSchema,
  moveClipCommandSchema,
  resizeClipCommandSchema,
  updateClipVolumeCommandSchema,
  updateCaptionCommandSchema,
  updateTitleCommandSchema,
  updateCtaCommandSchema,
  replaceMusicCommandSchema,
]);

export type EditorCommand = z.infer<typeof editorCommandSchema>;
