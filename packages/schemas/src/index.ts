import { z } from 'zod';

export const idSchema = z.uuid();
export const dateTimeSchema = z.iso.datetime();
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a six-digit hexadecimal color');

export const organizationRoleSchema = z.enum(['owner', 'admin', 'member']);
export const userStatusSchema = z.enum(['active', 'disabled']);
export const assetKindSchema = z.enum(['video', 'image', 'audio', 'logo', 'font']);
export const assetStatusSchema = z.enum(['registered', 'uploaded', 'analyzing', 'ready', 'failed']);
export const videoProjectStatusSchema = z.enum(['draft', 'rendering', 'completed', 'archived']);
export const renderJobStatusSchema = z.enum([
  'queued',
  'preprocessing',
  'rendering',
  'validating',
  'succeeded',
  'failed',
  'cancelled',
]);
export const renderArtifactKindSchema = z.enum(['video', 'thumbnail', 'captions', 'report']);
export const qualityReportStatusSchema = z.enum(['passed', 'warning', 'failed']);
export const videoPlatformSchema = z.enum(['douyin', 'xiaohongshu', 'wechat_channels', 'other']);

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(80),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const userSchema = z.object({
  id: idSchema,
  externalSubject: z.string().min(1).max(200),
  email: z.email().nullable(),
  displayName: z.string().min(1).max(120),
  status: userStatusSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const membershipSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  userId: idSchema,
  role: organizationRoleSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const hotelSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(160),
  city: z.string().min(1).max(100),
  address: z.string().max(300).nullable(),
  timezone: z.string().min(1).max(80),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const createHotelSchema = z.object({
  organizationId: idSchema,
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(300).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).default('Asia/Shanghai'),
});

export const updateHotelSchema = createHotelSchema
  .omit({ organizationId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied');

export const brandKitSchema = z.object({
  id: idSchema,
  hotelId: idSchema,
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  fontFamily: z.string().min(1).max(120),
  subtitleStyle: z.string().min(1).max(80),
  endingText: z.string().max(300),
  contactText: z.string().max(200).nullable(),
  logoAssetId: idSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const upsertBrandKitSchema = brandKitSchema
  .omit({
    id: true,
    hotelId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    contactText: z.string().trim().max(200).nullable().optional(),
    logoAssetId: idSchema.nullable().optional(),
  });

export const videoBriefSchema = z.object({
  id: idSchema,
  hotelId: idSchema,
  title: z.string().min(1).max(160),
  platform: videoPlatformSchema,
  durationSeconds: z.number().int().min(5).max(180),
  aspectRatio: z.literal('9:16'),
  tone: z.string().min(1).max(80),
  language: z.string().min(2).max(20),
  objective: z.string().max(300).nullable(),
  targetAudience: z.string().max(200).nullable(),
  callToAction: z.string().max(200).nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const createVideoBriefSchema = videoBriefSchema
  .omit({
    id: true,
    hotelId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    aspectRatio: z.literal('9:16').default('9:16'),
    language: z.string().trim().min(2).max(20).default('zh-CN'),
    objective: z.string().trim().max(300).nullable().optional(),
    targetAudience: z.string().trim().max(200).nullable().optional(),
    callToAction: z.string().trim().max(200).nullable().optional(),
  });

export const assetSchema = z.object({
  id: idSchema,
  hotelId: idSchema,
  kind: assetKindSchema,
  status: assetStatusSchema,
  originalFilename: z.string().min(1).max(260),
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  storageBucket: z.string().min(1).max(120),
  storageKey: z.string().min(1).max(500),
  checksumSha256: z
    .string()
    .regex(/^[0-9A-Fa-f]{64}$/)
    .nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const assetSegmentSchema = z
  .object({
    id: idSchema,
    assetId: idSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    label: z.string().max(160).nullable(),
    scoreBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .refine((segment) => segment.endMs > segment.startMs, {
    message: 'Segment end must be after its start',
    path: ['endMs'],
  });

export const videoProjectSchema = z.object({
  id: idSchema,
  hotelId: idSchema,
  videoBriefId: idSchema,
  name: z.string().min(1).max(160),
  templateKey: z.string().min(1).max(120),
  status: videoProjectStatusSchema,
  currentRevision: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const projectRevisionSchema = z.object({
  id: idSchema,
  videoProjectId: idSchema,
  revision: z.number().int().positive(),
  schemaVersion: z.string().min(1).max(30),
  projectDocument: z.record(z.string(), z.unknown()),
  createdByUserId: idSchema,
  createdAt: dateTimeSchema,
});

export const renderJobSchema = z.object({
  id: idSchema,
  videoProjectId: idSchema,
  projectRevisionId: idSchema,
  requestedByUserId: idSchema,
  status: renderJobStatusSchema,
  attempt: z.number().int().nonnegative(),
  errorCode: z.string().max(100).nullable(),
  errorMessage: z.string().nullable(),
  startedAt: dateTimeSchema.nullable(),
  finishedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const renderArtifactSchema = z.object({
  id: idSchema,
  renderJobId: idSchema,
  kind: renderArtifactKindSchema,
  storageBucket: z.string().min(1).max(120),
  storageKey: z.string().min(1).max(500),
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  checksumSha256: z
    .string()
    .regex(/^[0-9A-Fa-f]{64}$/)
    .nullable(),
  createdAt: dateTimeSchema,
});

export const qualityReportSchema = z.object({
  id: idSchema,
  renderJobId: idSchema,
  status: qualityReportStatusSchema,
  scoreBasisPoints: z.number().int().min(0).max(10_000),
  details: z.record(z.string(), z.unknown()),
  createdAt: dateTimeSchema,
});

export const actorHeadersSchema = z.object({
  'x-user-id': idSchema,
});

export const idParamsSchema = z.object({ id: idSchema });
export const hotelIdParamsSchema = z.object({ hotelId: idSchema });
export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type User = z.infer<typeof userSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Hotel = z.infer<typeof hotelSchema>;
export type CreateHotelInput = z.infer<typeof createHotelSchema>;
export type UpdateHotelInput = z.infer<typeof updateHotelSchema>;
export type BrandKit = z.infer<typeof brandKitSchema>;
export type UpsertBrandKitInput = z.infer<typeof upsertBrandKitSchema>;
export type VideoBrief = z.infer<typeof videoBriefSchema>;
export type CreateVideoBriefInput = z.infer<typeof createVideoBriefSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetSegment = z.infer<typeof assetSegmentSchema>;
export type VideoProject = z.infer<typeof videoProjectSchema>;
export type ProjectRevision = z.infer<typeof projectRevisionSchema>;
export type RenderJob = z.infer<typeof renderJobSchema>;
export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;
export type RenderArtifact = z.infer<typeof renderArtifactSchema>;
export type QualityReport = z.infer<typeof qualityReportSchema>;
