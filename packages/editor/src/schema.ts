import { z } from 'zod';

import {
  colorAdjustmentsSchema,
  transformKeyframeSchema,
  transitionSchema,
} from '@hotelcut/timeline';

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

export const updateAudioMixCommandSchema = z
  .object({
    type: z.literal('update-audio-mix'),
    ...clipCommandShape,
    volume: z.number().min(0).max(2),
    fadeInFrames: z.number().int().nonnegative(),
    fadeOutFrames: z.number().int().nonnegative(),
  })
  .strict();

export const updateVisualEffectsCommandSchema = z
  .object({
    type: z.literal('update-visual-effects'),
    ...clipCommandShape,
    colorAdjustments: colorAdjustmentsSchema,
  })
  .strict();

export const updateClipTransitionCommandSchema = z
  .object({
    type: z.literal('update-clip-transition'),
    ...clipCommandShape,
    edge: z.enum(['in', 'out']),
    transition: transitionSchema.nullable(),
  })
  .strict();

export const upsertTransformKeyframeCommandSchema = z
  .object({
    type: z.literal('upsert-transform-keyframe'),
    ...clipCommandShape,
    keyframe: transformKeyframeSchema,
  })
  .strict();

export const deleteClipCommandSchema = z
  .object({
    type: z.literal('delete-clip'),
    ...clipCommandShape,
  })
  .strict();

export const splitVisualClipCommandSchema = z
  .object({
    type: z.literal('split-visual-clip'),
    ...clipCommandShape,
    atFrame: z.number().int().nonnegative(),
    newClipId: z.uuid(),
  })
  .strict();

const insertVideoClipCommandSchema = z
  .object({
    type: z.literal('insert-video-clip'),
    id: z.uuid(),
    trackId: z.uuid(),
    assetId: z.uuid(),
    startFrame: z.number().int().nonnegative(),
    durationFrames: z.number().int().positive(),
    sourceStartFrame: z.number().int().nonnegative().default(0),
    sourceDurationFrames: z.number().int().positive(),
  })
  .strict();

const insertImageClipCommandSchema = z
  .object({
    type: z.literal('insert-image-clip'),
    id: z.uuid(),
    trackId: z.uuid(),
    assetId: z.uuid(),
    startFrame: z.number().int().nonnegative(),
    durationFrames: z.number().int().positive(),
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
  updateAudioMixCommandSchema,
  updateVisualEffectsCommandSchema,
  updateClipTransitionCommandSchema,
  upsertTransformKeyframeCommandSchema,
  deleteClipCommandSchema,
  splitVisualClipCommandSchema,
  insertVideoClipCommandSchema,
  insertImageClipCommandSchema,
  updateCaptionCommandSchema,
  updateTitleCommandSchema,
  updateCtaCommandSchema,
  replaceMusicCommandSchema,
]);

export type EditorCommand = z.infer<typeof editorCommandSchema>;
