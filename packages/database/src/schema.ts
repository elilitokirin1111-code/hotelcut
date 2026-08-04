import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member']);
export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const assetKind = pgEnum('asset_kind', ['video', 'image', 'audio', 'logo', 'font']);
export const assetStatus = pgEnum('asset_status', [
  'registered',
  'uploaded',
  'analyzing',
  'ready',
  'failed',
]);
export const assetUploadStatus = pgEnum('asset_upload_status', [
  'initiated',
  'completed',
  'aborted',
  'expired',
]);
export const assetDerivativeKind = pgEnum('asset_derivative_kind', ['proxy', 'thumbnail', 'audio']);
export const assetSegmentKind = pgEnum('asset_segment_kind', ['scene', 'speech', 'vad', 'manual']);
export const assetSegmentSource = pgEnum('asset_segment_source', ['automatic', 'manual']);
export const analysisJobStatus = pgEnum('analysis_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export const videoPlatform = pgEnum('video_platform', [
  'douyin',
  'xiaohongshu',
  'wechat_channels',
  'other',
]);
export const videoProjectStatus = pgEnum('video_project_status', [
  'draft',
  'rendering',
  'completed',
  'archived',
]);
export const renderJobStatus = pgEnum('render_job_status', [
  'queued',
  'preprocessing',
  'rendering',
  'validating',
  'succeeded',
  'failed',
  'cancelled',
]);
export const renderArtifactKind = pgEnum('render_artifact_kind', [
  'video',
  'thumbnail',
  'captions',
  'report',
  'project',
  'manifest',
]);
export const qualityReportStatus = pgEnum('quality_report_status', ['passed', 'warning', 'failed']);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    externalSubject: varchar('external_subject', { length: 200 }).notNull(),
    email: varchar('email', { length: 320 }),
    passwordHash: varchar('password_hash', { length: 300 }),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    status: userStatus('status').default('active').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_external_subject_unique').on(table.externalSubject),
    uniqueIndex('users_email_unique').on(table.email),
  ],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_sessions_token_hash_unique').on(table.tokenHash),
    index('user_sessions_user_idx').on(table.userId),
    index('user_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('memberships_organization_user_unique').on(table.organizationId, table.userId),
    index('memberships_user_idx').on(table.userId),
  ],
);

export const hotels = pgTable(
  'hotels',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    address: varchar('address', { length: 300 }),
    timezone: varchar('timezone', { length: 80 }).default('Asia/Shanghai').notNull(),
    ...timestamps,
  },
  (table) => [
    index('hotels_organization_idx').on(table.organizationId),
    uniqueIndex('hotels_organization_name_unique').on(table.organizationId, table.name),
  ],
);

export const brandKits = pgTable(
  'brand_kits',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    primaryColor: varchar('primary_color', { length: 7 }).notNull(),
    secondaryColor: varchar('secondary_color', { length: 7 }).notNull(),
    accentColor: varchar('accent_color', { length: 7 }).notNull(),
    fontFamily: varchar('font_family', { length: 120 }).notNull(),
    subtitleStyle: varchar('subtitle_style', { length: 80 }).notNull(),
    endingText: varchar('ending_text', { length: 300 }).notNull(),
    contactText: varchar('contact_text', { length: 200 }),
    logoAssetId: uuid('logo_asset_id'),
    ...timestamps,
  },
  (table) => [uniqueIndex('brand_kits_hotel_unique').on(table.hotelId)],
);

export const modelProviderSettings = pgTable(
  'model_provider_settings',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    baseUrl: varchar('base_url', { length: 500 }).notNull(),
    apiMode: varchar('api_mode', { length: 40 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    reasoningEffort: varchar('reasoning_effort', { length: 20 }).notNull(),
    encryptedApiKey: text('encrypted_api_key'),
    apiKeyHint: varchar('api_key_hint', { length: 24 }),
    enabled: boolean('enabled').default(true).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('model_provider_settings_hotel_unique').on(table.hotelId)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    kind: assetKind('kind').notNull(),
    status: assetStatus('status').default('registered').notNull(),
    originalFilename: varchar('original_filename', { length: 260 }).notNull(),
    contentType: varchar('content_type', { length: 120 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    storageBucket: varchar('storage_bucket', { length: 120 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('assets_hotel_idx').on(table.hotelId),
    uniqueIndex('assets_storage_location_unique').on(table.storageBucket, table.storageKey),
    check('assets_byte_size_positive', sql`${table.byteSize} > 0`),
  ],
);

export const assetUploads = pgTable(
  'asset_uploads',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    providerUploadId: text('provider_upload_id').notNull(),
    partSize: integer('part_size').notNull(),
    partCount: integer('part_count').notNull(),
    status: assetUploadStatus('status').default('initiated').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('asset_uploads_asset_unique').on(table.assetId),
    uniqueIndex('asset_uploads_provider_unique').on(table.providerUploadId),
    check('asset_uploads_part_size_minimum', sql`${table.partSize} >= 5242880`),
    check(
      'asset_uploads_part_count_range',
      sql`${table.partCount} >= 1 and ${table.partCount} <= 10000`,
    ),
  ],
);

export const assetDerivatives = pgTable(
  'asset_derivatives',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    kind: assetDerivativeKind('kind').notNull(),
    storageBucket: varchar('storage_bucket', { length: 120 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    contentType: varchar('content_type', { length: 120 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('asset_derivatives_asset_kind_unique').on(table.assetId, table.kind),
    uniqueIndex('asset_derivatives_storage_location_unique').on(
      table.storageBucket,
      table.storageKey,
    ),
    check('asset_derivatives_byte_size_positive', sql`${table.byteSize} > 0`),
  ],
);

export const assetSegments = pgTable(
  'asset_segments',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    label: varchar('label', { length: 160 }),
    kind: assetSegmentKind('kind').default('scene').notNull(),
    source: assetSegmentSource('source').default('automatic').notNull(),
    scoreBasisPoints: integer('score_basis_points'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('asset_segments_asset_idx').on(table.assetId),
    check('asset_segments_start_nonnegative', sql`${table.startMs} >= 0`),
    check('asset_segments_end_after_start', sql`${table.endMs} > ${table.startMs}`),
    check(
      'asset_segments_score_range',
      sql`${table.scoreBasisPoints} is null or (${table.scoreBasisPoints} >= 0 and ${table.scoreBasisPoints} <= 10000)`,
    ),
  ],
);

export const analysisJobs = pgTable(
  'analysis_jobs',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    status: analysisJobStatus('status').default('queued').notNull(),
    attempt: integer('attempt').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    logs: jsonb('logs')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('analysis_jobs_asset_idx').on(table.assetId),
    index('analysis_jobs_status_idx').on(table.status),
    check('analysis_jobs_attempt_nonnegative', sql`${table.attempt} >= 0`),
    check(
      'analysis_jobs_max_attempts_range',
      sql`${table.maxAttempts} >= 1 and ${table.maxAttempts} <= 10`,
    ),
  ],
);

export const videoBriefs = pgTable(
  'video_briefs',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    platform: videoPlatform('platform').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    aspectRatio: varchar('aspect_ratio', { length: 10 }).default('9:16').notNull(),
    tone: varchar('tone', { length: 80 }).notNull(),
    language: varchar('language', { length: 20 }).default('zh-CN').notNull(),
    objective: varchar('objective', { length: 300 }),
    targetAudience: varchar('target_audience', { length: 200 }),
    callToAction: varchar('call_to_action', { length: 200 }),
    ...timestamps,
  },
  (table) => [
    index('video_briefs_hotel_idx').on(table.hotelId),
    check(
      'video_briefs_duration_range',
      sql`${table.durationSeconds} >= 5 and ${table.durationSeconds} <= 180`,
    ),
    check('video_briefs_vertical_aspect', sql`${table.aspectRatio} = '9:16'`),
  ],
);

export const videoProjects = pgTable(
  'video_projects',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    videoBriefId: uuid('video_brief_id')
      .notNull()
      .references(() => videoBriefs.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    templateKey: varchar('template_key', { length: 120 }).notNull(),
    status: videoProjectStatus('status').default('draft').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    index('video_projects_hotel_idx').on(table.hotelId),
    check('video_projects_revision_positive', sql`${table.currentRevision} > 0`),
  ],
);

export const projectRevisions = pgTable(
  'project_revisions',
  {
    id: uuid('id').primaryKey(),
    videoProjectId: uuid('video_project_id')
      .notNull()
      .references(() => videoProjects.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    schemaVersion: varchar('schema_version', { length: 30 }).notNull(),
    projectDocument: jsonb('project_document').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('project_revisions_project_revision_unique').on(
      table.videoProjectId,
      table.revision,
    ),
    check('project_revisions_revision_positive', sql`${table.revision} > 0`),
  ],
);

export const renderJobs = pgTable(
  'render_jobs',
  {
    id: uuid('id').primaryKey(),
    videoProjectId: uuid('video_project_id')
      .notNull()
      .references(() => videoProjects.id, { onDelete: 'cascade' }),
    projectRevisionId: uuid('project_revision_id')
      .notNull()
      .references(() => projectRevisions.id, { onDelete: 'restrict' }),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: renderJobStatus('status').default('queued').notNull(),
    attempt: integer('attempt').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    progressBasisPoints: integer('progress_basis_points').default(0).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    logs: jsonb('logs')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('render_jobs_project_idx').on(table.videoProjectId),
    index('render_jobs_status_idx').on(table.status),
    check('render_jobs_attempt_nonnegative', sql`${table.attempt} >= 0`),
    check(
      'render_jobs_max_attempts_range',
      sql`${table.maxAttempts} >= 1 and ${table.maxAttempts} <= 10`,
    ),
    check(
      'render_jobs_progress_range',
      sql`${table.progressBasisPoints} >= 0 and ${table.progressBasisPoints} <= 10000`,
    ),
    check('render_jobs_input_hash_format', sql`${table.inputHash} ~ '^[0-9a-fA-F]{64}$'`),
  ],
);

export const renderArtifacts = pgTable(
  'render_artifacts',
  {
    id: uuid('id').primaryKey(),
    renderJobId: uuid('render_job_id')
      .notNull()
      .references(() => renderJobs.id, { onDelete: 'cascade' }),
    kind: renderArtifactKind('kind').notNull(),
    storageBucket: varchar('storage_bucket', { length: 120 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    contentType: varchar('content_type', { length: 120 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('render_artifacts_job_idx').on(table.renderJobId),
    uniqueIndex('render_artifacts_job_kind_unique').on(table.renderJobId, table.kind),
    uniqueIndex('render_artifacts_storage_location_unique').on(
      table.storageBucket,
      table.storageKey,
    ),
    check('render_artifacts_byte_size_positive', sql`${table.byteSize} > 0`),
  ],
);

export const qualityReports = pgTable(
  'quality_reports',
  {
    id: uuid('id').primaryKey(),
    renderJobId: uuid('render_job_id')
      .notNull()
      .references(() => renderJobs.id, { onDelete: 'cascade' }),
    status: qualityReportStatus('status').notNull(),
    scoreBasisPoints: integer('score_basis_points').notNull(),
    details: jsonb('details')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quality_reports_render_job_unique').on(table.renderJobId),
    check(
      'quality_reports_score_range',
      sql`${table.scoreBasisPoints} >= 0 and ${table.scoreBasisPoints} <= 10000`,
    ),
  ],
);
