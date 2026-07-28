import { z } from 'zod';

export const idSchema = z.uuid();
export const dateTimeSchema = z.iso.datetime({ offset: true });
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a six-digit hexadecimal color');

export const organizationRoleSchema = z.enum(['owner', 'admin', 'member']);
export const userStatusSchema = z.enum(['active', 'disabled']);
export const assetKindSchema = z.enum(['video', 'image', 'audio', 'logo', 'font']);
export const assetStatusSchema = z.enum(['registered', 'uploaded', 'analyzing', 'ready', 'failed']);
export const assetUploadStatusSchema = z.enum(['initiated', 'completed', 'aborted', 'expired']);
export const assetDerivativeKindSchema = z.enum(['proxy', 'thumbnail', 'audio']);
export const assetSegmentKindSchema = z.enum(['scene', 'speech', 'vad', 'manual']);
export const assetSegmentSourceSchema = z.enum(['automatic', 'manual']);
export const analysisJobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
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
    kind: assetSegmentKindSchema,
    source: assetSegmentSourceSchema,
    scoreBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    createdByUserId: idSchema.nullable(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .refine((segment) => segment.endMs > segment.startMs, {
    message: 'Segment end must be after its start',
    path: ['endMs'],
  });

export const assetUploadSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  providerUploadId: z.string().min(1),
  partSize: z
    .number()
    .int()
    .min(5 * 1024 * 1024),
  partCount: z.number().int().min(1).max(10_000),
  status: assetUploadStatusSchema,
  expiresAt: dateTimeSchema,
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const assetDerivativeSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  kind: assetDerivativeKindSchema,
  storageBucket: z.string().min(1).max(120),
  storageKey: z.string().min(1).max(500),
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  checksumSha256: z
    .string()
    .regex(/^[0-9A-Fa-f]{64}$/)
    .nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const analysisLogEntrySchema = z.object({
  at: dateTimeSchema,
  level: z.enum(['info', 'warning', 'error']),
  message: z.string().min(1).max(500),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const analysisJobSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  status: analysisJobStatusSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().min(1).max(10),
  logs: z.array(analysisLogEntrySchema),
  errorCode: z.string().max(100).nullable(),
  errorMessage: z.string().nullable(),
  startedAt: dateTimeSchema.nullable(),
  finishedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const assetDetailSchema = assetSchema.extend({
  derivatives: z.array(assetDerivativeSchema),
  segments: z.array(assetSegmentSchema),
  analysisJobs: z.array(analysisJobSchema),
});

export const createAssetUploadSchema = z.object({
  kind: z.literal('video'),
  originalFilename: z.string().trim().min(1).max(260),
  contentType: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => value.startsWith('video/'), 'M2 accepts video media uploads'),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[0-9A-Fa-f]{64}$/),
  partSize: z
    .number()
    .int()
    .min(5 * 1024 * 1024)
    .max(128 * 1024 * 1024)
    .default(8 * 1024 * 1024),
});

export const uploadPartSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
  etag: z.string().trim().min(1).max(200),
});

export const completeAssetUploadSchema = z.object({
  uploadId: z.string().min(1),
  parts: z.array(uploadPartSchema).min(1).max(10_000),
});

export const createManualSegmentSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    label: z.string().trim().min(1).max(160),
    scoreBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((segment) => segment.endMs > segment.startMs, {
    message: 'Segment end must be after its start',
    path: ['endMs'],
  });

export const assetIdParamsSchema = z.object({ assetId: idSchema });
export const assetDerivativeParamsSchema = z.object({
  assetId: idSchema,
  kind: assetDerivativeKindSchema,
});

export const createAssetUploadResponseSchema = z.object({
  asset: assetSchema,
  upload: assetUploadSchema,
  parts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      url: z.url(),
      expiresAt: dateTimeSchema,
    }),
  ),
});

export const completeAssetUploadResponseSchema = z.object({
  assetId: idSchema,
  analysisJobId: idSchema,
  status: z.literal('queued'),
});

export const analysisRetryResponseSchema = completeAssetUploadResponseSchema;

export const derivativeDownloadSchema = z.object({
  url: z.url(),
  expiresInSeconds: z.number().int().positive(),
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

export const createVideoProjectSchema = z.object({
  id: idSchema,
  videoBriefId: idSchema,
  name: z.string().trim().min(1).max(160),
  templateKey: z.string().trim().min(1).max(120),
  projectDocument: z.record(z.string(), z.unknown()),
});

export const saveProjectRevisionSchema = z.object({
  baseRevision: z.number().int().positive(),
  projectDocument: z.record(z.string(), z.unknown()),
});

export const videoProjectDetailSchema = z.object({
  project: videoProjectSchema,
  currentRevision: projectRevisionSchema,
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
export type AssetUpload = z.infer<typeof assetUploadSchema>;
export type AssetDerivative = z.infer<typeof assetDerivativeSchema>;
export type AnalysisJob = z.infer<typeof analysisJobSchema>;
export type AnalysisLogEntry = z.infer<typeof analysisLogEntrySchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type CreateAssetUploadInput = z.infer<typeof createAssetUploadSchema>;
export type CompleteAssetUploadInput = z.infer<typeof completeAssetUploadSchema>;
export type CreateManualSegmentInput = z.infer<typeof createManualSegmentSchema>;
export type AssetDerivativeKind = z.infer<typeof assetDerivativeKindSchema>;
export type VideoProject = z.infer<typeof videoProjectSchema>;
export type ProjectRevision = z.infer<typeof projectRevisionSchema>;
export type CreateVideoProjectInput = z.infer<typeof createVideoProjectSchema>;
export type SaveProjectRevisionInput = z.infer<typeof saveProjectRevisionSchema>;
export type VideoProjectDetail = z.infer<typeof videoProjectDetailSchema>;
export type RenderJob = z.infer<typeof renderJobSchema>;
export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;
export type RenderArtifact = z.infer<typeof renderArtifactSchema>;
export type QualityReport = z.infer<typeof qualityReportSchema>;
