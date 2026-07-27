import { z } from 'zod';

export const HOTEL_VIDEO_PROJECT_SCHEMA_VERSION = '1.0.0' as const;

const metadataSchema = z.record(z.string(), z.unknown()).default({});
const uuidSchema = z.uuid();
const keySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/, 'Expected a stable alphanumeric key');
const frameSchema = z.number().int().nonnegative();
const durationFramesSchema = z.number().int().positive();
const normalizedSchema = z.number().min(0).max(1);
const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, 'Expected a hexadecimal RGB or RGBA color');

export const frameRangeSchema = z
  .object({
    startFrame: frameSchema,
    durationFrames: durationFramesSchema,
  })
  .strict();

export const transformSchema = z
  .object({
    x: normalizedSchema.default(0.5),
    y: normalizedSchema.default(0.5),
    scaleX: z.number().positive().max(20).default(1),
    scaleY: z.number().positive().max(20).default(1),
    rotationDegrees: z.number().min(-360).max(360).default(0),
    opacity: normalizedSchema.default(1),
    fit: z.enum(['cover', 'contain', 'fill', 'none']).default('cover'),
    crop: z
      .object({
        x: normalizedSchema,
        y: normalizedSchema,
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .strict()
      .superRefine((crop, context) => {
        if (crop.x + crop.width > 1) {
          context.addIssue({
            code: 'custom',
            path: ['width'],
            message: 'Crop rectangle exceeds the normalized canvas width',
          });
        }
        if (crop.y + crop.height > 1) {
          context.addIssue({
            code: 'custom',
            path: ['height'],
            message: 'Crop rectangle exceeds the normalized canvas height',
          });
        }
      })
      .optional(),
  })
  .strict();

export const transitionSchema = z
  .object({
    type: z.enum(['cut', 'dissolve', 'fade', 'wipe']),
    durationFrames: frameSchema,
    easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']).default('linear'),
  })
  .strict()
  .superRefine((transition, context) => {
    if (transition.type === 'cut' && transition.durationFrames !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['durationFrames'],
        message: 'A cut transition must have zero duration',
      });
    }
    if (transition.type !== 'cut' && transition.durationFrames === 0) {
      context.addIssue({
        code: 'custom',
        path: ['durationFrames'],
        message: `${transition.type} transition must have a positive duration`,
      });
    }
  });

export const safeAreaSchema = z
  .object({
    id: keySchema,
    name: z.string().min(1).max(120),
    kind: z.enum(['content', 'caption', 'cta', 'custom']),
    x: normalizedSchema,
    y: normalizedSchema,
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .superRefine((safeArea, context) => {
    if (safeArea.x + safeArea.width > 1) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Safe area exceeds the normalized canvas width',
      });
    }
    if (safeArea.y + safeArea.height > 1) {
      context.addIssue({
        code: 'custom',
        path: ['height'],
        message: 'Safe area exceeds the normalized canvas height',
      });
    }
  });

const colorBrandTokenSchema = z
  .object({
    key: keySchema,
    type: z.literal('color'),
    value: hexColorSchema,
  })
  .strict();

const fontBrandTokenSchema = z
  .object({
    key: keySchema,
    type: z.literal('font'),
    family: z.string().min(1).max(160),
    weight: z.number().int().min(100).max(900).default(400),
    style: z.enum(['normal', 'italic']).default('normal'),
  })
  .strict();

const textBrandTokenSchema = z
  .object({
    key: keySchema,
    type: z.literal('text'),
    value: z.string().max(500),
  })
  .strict();

const numberBrandTokenSchema = z
  .object({
    key: keySchema,
    type: z.literal('number'),
    value: z.number().finite(),
    unit: z.enum(['px', 'percent', 'frames', 'unitless']).default('unitless'),
  })
  .strict();

export const brandTokenSchema = z.discriminatedUnion('type', [
  colorBrandTokenSchema,
  fontBrandTokenSchema,
  textBrandTokenSchema,
  numberBrandTokenSchema,
]);

export const textStyleSchema = z
  .object({
    fontToken: keySchema,
    colorToken: keySchema,
    backgroundColorToken: keySchema.optional(),
    fontSize: z.number().positive().max(500),
    lineHeight: z.number().positive().max(5).default(1.2),
    align: z.enum(['left', 'center', 'right']).default('center'),
    maxLines: z.number().int().positive().max(20).default(3),
  })
  .strict();

const visualClipBaseShape = {
  id: uuidSchema,
  startFrame: frameSchema,
  durationFrames: durationFramesSchema,
  transform: transformSchema.default({
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotationDegrees: 0,
    opacity: 1,
    fit: 'cover',
  }),
  transitionIn: transitionSchema.nullable().default(null),
  transitionOut: transitionSchema.nullable().default(null),
  metadata: metadataSchema,
};

export const videoClipSchema = z
  .object({
    ...visualClipBaseShape,
    kind: z.literal('video'),
    assetId: uuidSchema,
    sourceStartFrame: frameSchema,
    sourceDurationFrames: durationFramesSchema,
    volume: z.number().min(0).max(2).default(1),
    muted: z.boolean().default(false),
    playbackRate: z.number().positive().max(8).default(1),
  })
  .strict();

export const imageClipSchema = z
  .object({
    ...visualClipBaseShape,
    kind: z.literal('image'),
    assetId: uuidSchema,
  })
  .strict();

export const audioClipSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('audio'),
    assetId: uuidSchema,
    startFrame: frameSchema,
    durationFrames: durationFramesSchema,
    sourceStartFrame: frameSchema,
    sourceDurationFrames: durationFramesSchema,
    volume: z.number().min(0).max(2).default(1),
    fadeInFrames: frameSchema.default(0),
    fadeOutFrames: frameSchema.default(0),
    metadata: metadataSchema,
  })
  .strict();

export const textClipSchema = z
  .object({
    ...visualClipBaseShape,
    kind: z.literal('text'),
    text: z.string().min(1).max(2_000),
    style: textStyleSchema,
    safeAreaId: keySchema.optional(),
  })
  .strict();

export const captionWordSchema = z
  .object({
    text: z.string().min(1).max(200),
    startOffsetFrame: frameSchema,
    durationFrames: durationFramesSchema,
  })
  .strict();

export const captionClipSchema = z
  .object({
    ...visualClipBaseShape,
    kind: z.literal('caption'),
    text: z.string().min(1).max(2_000),
    words: z.array(captionWordSchema).default([]),
    style: textStyleSchema,
    safeAreaId: keySchema.optional(),
  })
  .strict();

export const clipSchema = z.discriminatedUnion('kind', [
  videoClipSchema,
  imageClipSchema,
  audioClipSchema,
  textClipSchema,
  captionClipSchema,
]);

export const trackSchema = z
  .object({
    id: uuidSchema,
    kind: z.enum(['video', 'audio', 'overlay', 'caption']),
    name: z.string().min(1).max(120),
    enabled: z.boolean().default(true),
    locked: z.boolean().default(false),
    muted: z.boolean().default(false),
    zIndex: z.number().int().min(-1_000).max(1_000),
    clips: z.array(clipSchema),
    metadata: metadataSchema,
  })
  .strict();

export const callToActionSchema = z
  .object({
    id: uuidSchema,
    startFrame: frameSchema,
    durationFrames: durationFramesSchema,
    text: z.string().min(1).max(300),
    action: z.enum(['booking', 'contact', 'navigate', 'follow', 'custom']),
    destination: z.string().max(500).nullable(),
    safeAreaId: keySchema,
    fontToken: keySchema,
    textColorToken: keySchema,
    backgroundColorToken: keySchema,
  })
  .strict();

export const videoOutputSchema = z
  .object({
    width: z.number().int().positive().max(8_192),
    height: z.number().int().positive().max(8_192),
    frameRate: z.number().int().min(1).max(120),
    durationFrames: durationFramesSchema,
    audioSampleRate: z.number().int().min(8_000).max(192_000).default(48_000),
    backgroundColor: hexColorSchema.default('#000000'),
  })
  .strict();

const templateReferenceSchema = z
  .object({
    id: keySchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Expected a semantic version'),
  })
  .strict();

const generationSchema = z
  .object({
    compilerVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Expected a semantic version'),
    seed: z.number().int().min(0).max(4_294_967_295),
  })
  .strict();

const clipKindsByTrack = {
  video: new Set(['video', 'image']),
  audio: new Set(['audio']),
  overlay: new Set(['image', 'text']),
  caption: new Set(['caption']),
} satisfies Record<string, ReadonlySet<string>>;

function addDuplicateIssues(
  values: readonly string[],
  context: z.RefinementCtx,
  pathPrefix: readonly (string | number)[],
  label: string,
): void {
  const firstIndexByValue = new Map<string, number>();
  values.forEach((value, index) => {
    const firstIndex = firstIndexByValue.get(value);
    if (firstIndex === undefined) {
      firstIndexByValue.set(value, index);
      return;
    }
    context.addIssue({
      code: 'custom',
      path: [...pathPrefix, index],
      message: `${label} "${value}" duplicates index ${firstIndex}`,
    });
  });
}

export const hotelVideoProjectV1Schema = z
  .object({
    schemaVersion: z.literal(HOTEL_VIDEO_PROJECT_SCHEMA_VERSION),
    id: uuidSchema,
    hotelId: uuidSchema,
    name: z.string().min(1).max(160),
    template: templateReferenceSchema,
    output: videoOutputSchema,
    safeAreas: z.array(safeAreaSchema),
    brandTokens: z.array(brandTokenSchema),
    cta: callToActionSchema.nullable(),
    tracks: z.array(trackSchema).min(1),
    generation: generationSchema,
    metadata: metadataSchema,
  })
  .strict()
  .superRefine((project, context) => {
    addDuplicateIssues(
      project.safeAreas.map((safeArea) => safeArea.id),
      context,
      ['safeAreas'],
      'Safe area id',
    );
    addDuplicateIssues(
      project.brandTokens.map((token) => token.key),
      context,
      ['brandTokens'],
      'Brand token key',
    );
    addDuplicateIssues(
      project.tracks.map((track) => track.id),
      context,
      ['tracks'],
      'Track id',
    );

    const safeAreaIds = new Set(project.safeAreas.map((safeArea) => safeArea.id));
    const tokens = new Map(project.brandTokens.map((token) => [token.key, token] as const));
    const firstClipPathById = new Map<string, string>();
    let clipCount = 0;

    const requireToken = (
      key: string,
      expectedType: 'color' | 'font',
      path: readonly (string | number)[],
    ): void => {
      const token = tokens.get(key);
      if (!token) {
        context.addIssue({
          code: 'custom',
          path: [...path],
          message: `Brand token "${key}" does not exist`,
        });
      } else if (token.type !== expectedType) {
        context.addIssue({
          code: 'custom',
          path: [...path],
          message: `Brand token "${key}" must be a ${expectedType} token`,
        });
      }
    };

    project.tracks.forEach((track, trackIndex) => {
      const orderedClips = [...track.clips].sort(
        (left, right) => left.startFrame - right.startFrame,
      );
      let previousEnd = 0;

      track.clips.forEach((clip, clipIndex) => {
        clipCount += 1;
        const clipPath = ['tracks', trackIndex, 'clips', clipIndex] as const;
        const clipPathLabel = `tracks[${trackIndex}].clips[${clipIndex}]`;
        const firstClipPath = firstClipPathById.get(clip.id);
        if (firstClipPath) {
          context.addIssue({
            code: 'custom',
            path: [...clipPath, 'id'],
            message: `Clip id "${clip.id}" duplicates ${firstClipPath}`,
          });
        } else {
          firstClipPathById.set(clip.id, clipPathLabel);
        }
        const endFrame = clip.startFrame + clip.durationFrames;

        if (!clipKindsByTrack[track.kind].has(clip.kind)) {
          context.addIssue({
            code: 'custom',
            path: [...clipPath, 'kind'],
            message: `${clip.kind} clip is not compatible with a ${track.kind} track`,
          });
        }
        if (endFrame > project.output.durationFrames) {
          context.addIssue({
            code: 'custom',
            path: [...clipPath, 'durationFrames'],
            message: `Clip ends at frame ${endFrame}, after project frame ${project.output.durationFrames}`,
          });
        }
        if ('transitionIn' in clip && clip.transitionIn) {
          if (clip.transitionIn.durationFrames > clip.durationFrames) {
            context.addIssue({
              code: 'custom',
              path: [...clipPath, 'transitionIn', 'durationFrames'],
              message: 'Transition duration cannot exceed clip duration',
            });
          }
        }
        if ('transitionOut' in clip && clip.transitionOut) {
          if (clip.transitionOut.durationFrames > clip.durationFrames) {
            context.addIssue({
              code: 'custom',
              path: [...clipPath, 'transitionOut', 'durationFrames'],
              message: 'Transition duration cannot exceed clip duration',
            });
          }
        }
        if (clip.kind === 'audio') {
          if (clip.fadeInFrames + clip.fadeOutFrames > clip.durationFrames) {
            context.addIssue({
              code: 'custom',
              path: [...clipPath, 'fadeOutFrames'],
              message: 'Audio fades cannot exceed the clip duration',
            });
          }
        }
        if (clip.kind === 'text' || clip.kind === 'caption') {
          requireToken(clip.style.fontToken, 'font', [...clipPath, 'style', 'fontToken']);
          requireToken(clip.style.colorToken, 'color', [...clipPath, 'style', 'colorToken']);
          if (clip.style.backgroundColorToken) {
            requireToken(clip.style.backgroundColorToken, 'color', [
              ...clipPath,
              'style',
              'backgroundColorToken',
            ]);
          }
          if (clip.safeAreaId && !safeAreaIds.has(clip.safeAreaId)) {
            context.addIssue({
              code: 'custom',
              path: [...clipPath, 'safeAreaId'],
              message: `Safe area "${clip.safeAreaId}" does not exist`,
            });
          }
        }
        if (clip.kind === 'caption') {
          clip.words.forEach((word, wordIndex) => {
            if (word.startOffsetFrame + word.durationFrames > clip.durationFrames) {
              context.addIssue({
                code: 'custom',
                path: [...clipPath, 'words', wordIndex, 'durationFrames'],
                message: 'Caption word timing exceeds the caption clip duration',
              });
            }
          });
        }
      });

      orderedClips.forEach((clip) => {
        if (clip.startFrame < previousEnd) {
          const originalIndex = track.clips.findIndex((candidate) => candidate.id === clip.id);
          context.addIssue({
            code: 'custom',
            path: ['tracks', trackIndex, 'clips', originalIndex, 'startFrame'],
            message: `Clip overlaps a previous clip ending at frame ${previousEnd}`,
          });
        }
        previousEnd = Math.max(previousEnd, clip.startFrame + clip.durationFrames);
      });
    });

    if (clipCount === 0) {
      context.addIssue({
        code: 'custom',
        path: ['tracks'],
        message: 'A project must contain at least one clip',
      });
    }
    if (project.cta) {
      const ctaEndFrame = project.cta.startFrame + project.cta.durationFrames;
      if (ctaEndFrame > project.output.durationFrames) {
        context.addIssue({
          code: 'custom',
          path: ['cta', 'durationFrames'],
          message: `CTA ends at frame ${ctaEndFrame}, after the project duration`,
        });
      }
      if (!safeAreaIds.has(project.cta.safeAreaId)) {
        context.addIssue({
          code: 'custom',
          path: ['cta', 'safeAreaId'],
          message: `Safe area "${project.cta.safeAreaId}" does not exist`,
        });
      }
      requireToken(project.cta.fontToken, 'font', ['cta', 'fontToken']);
      requireToken(project.cta.textColorToken, 'color', ['cta', 'textColorToken']);
      requireToken(project.cta.backgroundColorToken, 'color', ['cta', 'backgroundColorToken']);
    }
  });

export type FrameRange = z.infer<typeof frameRangeSchema>;
export type VideoOutput = z.infer<typeof videoOutputSchema>;
export type Transform = z.infer<typeof transformSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type SafeArea = z.infer<typeof safeAreaSchema>;
export type BrandToken = z.infer<typeof brandTokenSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type ImageClip = z.infer<typeof imageClipSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type TextClip = z.infer<typeof textClipSchema>;
export type CaptionClip = z.infer<typeof captionClipSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Track = z.infer<typeof trackSchema>;
export type CTA = z.infer<typeof callToActionSchema>;
export type HotelVideoProjectV1 = z.infer<typeof hotelVideoProjectV1Schema>;
