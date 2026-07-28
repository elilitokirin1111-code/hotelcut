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
  updateCaptionCommandSchema,
  updateTitleCommandSchema,
  updateCtaCommandSchema,
  replaceMusicCommandSchema,
]);

export type EditorCommand = z.infer<typeof editorCommandSchema>;
