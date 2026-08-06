import { sql } from 'drizzle-orm';
import {
  bigint,
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
export const assetPurpose = pgEnum('asset_purpose', ['production_asset', 'reference_video']);
export const creativeProjectMode = pgEnum('creative_project_mode', [
  'idea',
  'script',
  'reference',
  'assets',
]);
export const creativeProjectStatus = pgEnum('creative_project_status', [
  'draft',
  'planning',
  'script_ready',
  'waiting_assets',
  'blueprint_ready',
  'generated',
  'completed',
]);
export const creativeRevisionAuthor = pgEnum('creative_revision_author', ['user', 'ai']);
export const assetRequirementStatus = pgEnum('asset_requirement_status', [
  'missing',
  'weak_match',
  'matched',
]);
export const aiReviewStatus = pgEnum('ai_review_status', [
  'generated',
  'partially_applied',
  'applied',
  'dismissed',
]);
export const aiEditCommandStatus = pgEnum('ai_edit_command_status', [
  'pending',
  'applied',
  'dismissed',
  'reverted',
]);
export const aiGenerationStatus = pgEnum('ai_generation_status', [
  'pending',
  'succeeded',
  'failed',
]);

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
    purpose: assetPurpose('purpose').default('production_asset').notNull(),
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

export const creativeProjects = pgTable(
  'creative_projects',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    mode: creativeProjectMode('mode').notNull(),
    status: creativeProjectStatus('status').default('draft').notNull(),
    selectedBriefRevisionId: uuid('selected_brief_revision_id'),
    selectedScriptRevisionId: uuid('selected_script_revision_id'),
    selectedBlueprintId: uuid('selected_blueprint_id'),
    selectedVideoProjectId: uuid('selected_video_project_id'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('creative_projects_hotel_idx').on(table.hotelId),
    index('creative_projects_status_idx').on(table.status),
  ],
);

export const creativeBriefRevisions = pgTable(
  'creative_brief_revisions',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    direction: varchar('direction', { length: 40 }),
    rawIdea: text('raw_idea').notNull(),
    objective: varchar('objective', { length: 300 }),
    platform: videoPlatform('platform').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    targetAudience: varchar('target_audience', { length: 200 }),
    tone: jsonb('tone')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    hotelSellingPoints: jsonb('hotel_selling_points')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    hardConstraints: jsonb('hard_constraints')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    userPrompt: text('user_prompt'),
    createdBy: creativeRevisionAuthor('created_by').notNull(),
    modelName: varchar('model_name', { length: 120 }),
    promptVersion: varchar('prompt_version', { length: 80 }),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('creative_brief_revisions_project_revision_unique').on(
      table.creativeProjectId,
      table.revision,
    ),
    check('creative_brief_revisions_revision_positive', sql`${table.revision} > 0`),
    check(
      'creative_brief_revisions_duration_range',
      sql`${table.durationSeconds} >= 5 and ${table.durationSeconds} <= 180`,
    ),
  ],
);

export const scriptPackages = pgTable(
  'script_packages',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    hook: varchar('hook', { length: 300 }).notNull(),
    storySummary: text('story_summary').notNull(),
    narrativePattern: varchar('narrative_pattern', { length: 160 }).notNull(),
    voiceoverScript: text('voiceover_script'),
    dialogue: jsonb('dialogue')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    captions: jsonb('captions')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    callToAction: varchar('call_to_action', { length: 300 }),
    filmingTips: jsonb('filming_tips')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    requiredAssets: jsonb('required_assets')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    totalDurationMs: integer('total_duration_ms').notNull(),
    modelName: varchar('model_name', { length: 120 }),
    promptVersion: varchar('prompt_version', { length: 80 }),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('script_packages_project_revision_unique').on(
      table.creativeProjectId,
      table.revision,
    ),
    check('script_packages_revision_positive', sql`${table.revision} > 0`),
    check('script_packages_duration_positive', sql`${table.totalDurationMs} > 0`),
  ],
);

export const scriptScenes = pgTable(
  'script_scenes',
  {
    id: uuid('id').primaryKey(),
    scriptPackageId: uuid('script_package_id')
      .notNull()
      .references(() => scriptPackages.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    purpose: varchar('purpose', { length: 240 }).notNull(),
    visual: text('visual').notNull(),
    action: text('action').notNull(),
    narration: text('narration'),
    dialogue: text('dialogue'),
    caption: text('caption'),
    durationMs: integer('duration_ms').notNull(),
    shotType: varchar('shot_type', { length: 40 }),
    motionType: varchar('motion_type', { length: 40 }),
    filmingInstruction: text('filming_instruction'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('script_scenes_package_sequence_unique').on(table.scriptPackageId, table.sequence),
    check('script_scenes_sequence_positive', sql`${table.sequence} > 0`),
    check('script_scenes_duration_positive', sql`${table.durationMs} > 0`),
  ],
);

export const shotRequirements = pgTable(
  'shot_requirements',
  {
    id: uuid('id').primaryKey(),
    scriptPackageId: uuid('script_package_id')
      .notNull()
      .references(() => scriptPackages.id, { onDelete: 'cascade' }),
    scriptSceneId: uuid('script_scene_id').references(() => scriptScenes.id, {
      onDelete: 'set null',
    }),
    sequence: integer('sequence').notNull(),
    description: text('description').notNull(),
    requiredTags: jsonb('required_tags')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    preferredShotType: varchar('preferred_shot_type', { length: 40 }),
    preferredMotionType: varchar('preferred_motion_type', { length: 40 }),
    preferredDurationMs: integer('preferred_duration_ms').notNull(),
    required: boolean('required').default(true).notNull(),
    filmingInstruction: text('filming_instruction'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('shot_requirements_package_sequence_unique').on(
      table.scriptPackageId,
      table.sequence,
    ),
    check('shot_requirements_duration_positive', sql`${table.preferredDurationMs} > 0`),
  ],
);

export const referenceVideoProfiles = pgTable(
  'reference_video_profiles',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    durationMs: integer('duration_ms').notNull(),
    narrativePattern: varchar('narrative_pattern', { length: 200 }).notNull(),
    hookDurationMs: integer('hook_duration_ms').notNull(),
    averageShotDurationMs: integer('average_shot_duration_ms').notNull(),
    shotCount: integer('shot_count').notNull(),
    paceCurve: jsonb('pace_curve')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    shotTypeDistribution: jsonb('shot_type_distribution')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    transitionProfile: jsonb('transition_profile')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    captionProfile: jsonb('caption_profile')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    audioProfile: jsonb('audio_profile')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    emotionalCurve: jsonb('emotional_curve')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    reusableStyleRules: jsonb('reusable_style_rules')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    analysisSummary: text('analysis_summary').notNull(),
    modelName: varchar('model_name', { length: 120 }),
    promptVersion: varchar('prompt_version', { length: 80 }),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reference_video_profiles_project_asset_revision_unique').on(
      table.creativeProjectId,
      table.assetId,
      table.revision,
    ),
    check('reference_video_profiles_duration_positive', sql`${table.durationMs} > 0`),
    check('reference_video_profiles_shot_count_nonnegative', sql`${table.shotCount} >= 0`),
  ],
);

export const editBlueprints = pgTable(
  'edit_blueprints',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    frameRate: integer('frame_rate').notNull(),
    aspectRatio: varchar('aspect_ratio', { length: 10 }).default('9:16').notNull(),
    style: jsonb('style').notNull(),
    music: jsonb('music').notNull(),
    captionStyle: jsonb('caption_style').notNull(),
    globalRules: jsonb('global_rules')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    compilerVersion: varchar('compiler_version', { length: 40 }).notNull(),
    sourceAssetIds: jsonb('source_asset_ids')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    referenceProfileIds: jsonb('reference_profile_ids')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    modelName: varchar('model_name', { length: 120 }),
    promptVersion: varchar('prompt_version', { length: 80 }),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('edit_blueprints_project_revision_unique').on(
      table.creativeProjectId,
      table.revision,
    ),
    check('edit_blueprints_revision_positive', sql`${table.revision} > 0`),
    check('edit_blueprints_duration_range', sql`${table.durationSeconds} >= 5`),
    check('edit_blueprints_frame_rate_positive', sql`${table.frameRate} > 0`),
    check('edit_blueprints_vertical_aspect', sql`${table.aspectRatio} = '9:16'`),
    check('edit_blueprints_seed_nonnegative', sql`${table.seed} >= 0`),
  ],
);

export const editBlueprintBeats = pgTable(
  'edit_blueprint_beats',
  {
    id: uuid('id').primaryKey(),
    editBlueprintId: uuid('edit_blueprint_id')
      .notNull()
      .references(() => editBlueprints.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    purpose: text('purpose').notNull(),
    narration: text('narration'),
    dialogue: text('dialogue'),
    requiredTags: jsonb('required_tags')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    preferredTags: jsonb('preferred_tags')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    forbiddenTags: jsonb('forbidden_tags')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    preferredShotTypes: jsonb('preferred_shot_types')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    preferredMotionTypes: jsonb('preferred_motion_types')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    minimumShotDurationMs: integer('minimum_shot_duration_ms').notNull(),
    maximumShotDurationMs: integer('maximum_shot_duration_ms').notNull(),
    maximumAssetReuse: integer('maximum_asset_reuse').default(1).notNull(),
    audioPolicy: varchar('audio_policy', { length: 20 }).notNull(),
    caption: text('caption'),
    transitionIn: varchar('transition_in', { length: 40 }),
    transitionOut: varchar('transition_out', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('edit_blueprint_beats_blueprint_sequence_unique').on(
      table.editBlueprintId,
      table.sequence,
    ),
    check('edit_blueprint_beats_sequence_positive', sql`${table.sequence} > 0`),
    check('edit_blueprint_beats_start_nonnegative', sql`${table.startMs} >= 0`),
    check('edit_blueprint_beats_end_after_start', sql`${table.endMs} > ${table.startMs}`),
    check(
      'edit_blueprint_beats_shot_duration_range',
      sql`${table.minimumShotDurationMs} > 0 and ${table.maximumShotDurationMs} >= ${table.minimumShotDurationMs}`,
    ),
  ],
);

export const creativeVideoVersions = pgTable(
  'creative_video_versions',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    editBlueprintId: uuid('edit_blueprint_id')
      .notNull()
      .references(() => editBlueprints.id, { onDelete: 'restrict' }),
    videoProjectId: uuid('video_project_id')
      .notNull()
      .references(() => videoProjects.id, { onDelete: 'cascade' }),
    variant: varchar('variant', { length: 1 }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    scoreBasisPoints: integer('score_basis_points').notNull(),
    hookScoreBasisPoints: integer('hook_score_basis_points').notNull(),
    sellingPointCoverageBasisPoints: integer('selling_point_coverage_basis_points').notNull(),
    paceScoreBasisPoints: integer('pace_score_basis_points').notNull(),
    usedAssetIds: jsonb('used_asset_ids')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    repeatedAssetCount: integer('repeated_asset_count').default(0).notNull(),
    recommendationReason: text('recommendation_reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('creative_video_versions_project_variant_unique').on(
      table.creativeProjectId,
      table.variant,
    ),
    index('creative_video_versions_project_idx').on(table.creativeProjectId),
    check('creative_video_versions_variant_valid', sql`${table.variant} in ('A', 'B', 'C')`),
    check('creative_video_versions_seed_nonnegative', sql`${table.seed} >= 0`),
    check(
      'creative_video_versions_score_ranges',
      sql`${table.scoreBasisPoints} between 0 and 10000 and ${table.hookScoreBasisPoints} between 0 and 10000 and ${table.sellingPointCoverageBasisPoints} between 0 and 10000 and ${table.paceScoreBasisPoints} between 0 and 10000`,
    ),
    check(
      'creative_video_versions_repeated_asset_nonnegative',
      sql`${table.repeatedAssetCount} >= 0`,
    ),
  ],
);

export const aiReviews = pgTable(
  'ai_reviews',
  {
    id: uuid('id').primaryKey(),
    videoProjectId: uuid('video_project_id')
      .notNull()
      .references(() => videoProjects.id, { onDelete: 'cascade' }),
    baseRevision: integer('base_revision').notNull(),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    summary: text('summary').notNull(),
    scoreBasisPoints: integer('score_basis_points').notNull(),
    hookScoreBasisPoints: integer('hook_score_basis_points').notNull(),
    storyScoreBasisPoints: integer('story_score_basis_points').notNull(),
    sellingPointScoreBasisPoints: integer('selling_point_score_basis_points').notNull(),
    paceScoreBasisPoints: integer('pace_score_basis_points').notNull(),
    captionScoreBasisPoints: integer('caption_score_basis_points').notNull(),
    musicScoreBasisPoints: integer('music_score_basis_points').notNull(),
    ctaScoreBasisPoints: integer('cta_score_basis_points').notNull(),
    findings: jsonb('findings')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    modelName: varchar('model_name', { length: 200 }),
    promptVersion: varchar('prompt_version', { length: 100 }),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary'),
    appliedRevision: integer('applied_revision'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_reviews_project_idx').on(table.videoProjectId),
    check('ai_reviews_status_valid', sql`${table.status} in ('open', 'applied', 'dismissed')`),
    check('ai_reviews_base_revision_positive', sql`${table.baseRevision} > 0`),
    check(
      'ai_reviews_score_ranges',
      sql`${table.scoreBasisPoints} between 0 and 10000 and ${table.hookScoreBasisPoints} between 0 and 10000 and ${table.storyScoreBasisPoints} between 0 and 10000 and ${table.sellingPointScoreBasisPoints} between 0 and 10000 and ${table.paceScoreBasisPoints} between 0 and 10000 and ${table.captionScoreBasisPoints} between 0 and 10000 and ${table.musicScoreBasisPoints} between 0 and 10000 and ${table.ctaScoreBasisPoints} between 0 and 10000`,
    ),
  ],
);

export const creativeFeedbackEvents = pgTable(
  'creative_feedback_events',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    creativeProjectId: uuid('creative_project_id').references(() => creativeProjects.id, {
      onDelete: 'set null',
    }),
    videoProjectId: uuid('video_project_id').references(() => videoProjects.id, {
      onDelete: 'set null',
    }),
    subjectId: uuid('subject_id'),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('creative_feedback_events_hotel_created_idx').on(table.hotelId, table.createdAt),
    index('creative_feedback_events_project_idx').on(table.creativeProjectId),
    check(
      'creative_feedback_events_type_valid',
      sql`${table.eventType} in ('creative_direction_selected', 'script_revised', 'script_selected', 'video_version_selected', 'shot_replaced', 'ai_review_applied', 'ai_review_dismissed', 'final_render_requested')`,
    ),
  ],
);

export const assetRequirements = pgTable(
  'asset_requirements',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    scriptSceneId: uuid('script_scene_id').references(() => scriptScenes.id, {
      onDelete: 'set null',
    }),
    description: text('description').notNull(),
    requiredTags: jsonb('required_tags')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    preferredShotType: varchar('preferred_shot_type', { length: 40 }),
    preferredMotionType: varchar('preferred_motion_type', { length: 40 }),
    preferredDurationMs: integer('preferred_duration_ms').notNull(),
    required: boolean('required').default(true).notNull(),
    matchedAssetIds: jsonb('matched_asset_ids')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    candidateMatches: jsonb('candidate_matches')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    status: assetRequirementStatus('status').default('missing').notNull(),
    filmingInstruction: text('filming_instruction'),
    ...timestamps,
  },
  (table) => [
    index('asset_requirements_project_idx').on(table.creativeProjectId),
    check('asset_requirements_duration_positive', sql`${table.preferredDurationMs} > 0`),
  ],
);

export const creativeProjectAssetLinks = pgTable(
  'creative_project_asset_links',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id')
      .notNull()
      .references(() => creativeProjects.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    purpose: assetPurpose('purpose').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('creative_project_asset_links_unique').on(
      table.creativeProjectId,
      table.assetId,
      table.purpose,
    ),
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

export const aiGenerationRuns = pgTable(
  'ai_generation_runs',
  {
    id: uuid('id').primaryKey(),
    creativeProjectId: uuid('creative_project_id').references(() => creativeProjects.id, {
      onDelete: 'cascade',
    }),
    operation: varchar('operation', { length: 80 }).notNull(),
    status: aiGenerationStatus('status').default('pending').notNull(),
    attempt: integer('attempt').default(1).notNull(),
    modelName: varchar('model_name', { length: 120 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 80 }).notNull(),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary').notNull(),
    outputSummary: text('output_summary'),
    failureReason: text('failure_reason'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_generation_runs_project_idx').on(table.creativeProjectId),
    check('ai_generation_runs_attempt_positive', sql`${table.attempt} > 0`),
  ],
);

export const aiReviewRuns = pgTable(
  'ai_review_runs',
  {
    id: uuid('id').primaryKey(),
    videoProjectId: uuid('video_project_id')
      .notNull()
      .references(() => videoProjects.id, { onDelete: 'cascade' }),
    projectRevisionId: uuid('project_revision_id')
      .notNull()
      .references(() => projectRevisions.id, { onDelete: 'restrict' }),
    creativeProjectId: uuid('creative_project_id').references(() => creativeProjects.id, {
      onDelete: 'set null',
    }),
    score: integer('score').notNull(),
    summary: text('summary').notNull(),
    issues: jsonb('issues')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    status: aiReviewStatus('status').default('generated').notNull(),
    modelName: varchar('model_name', { length: 120 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 80 }).notNull(),
    generationParameters: jsonb('generation_parameters')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    inputSummary: text('input_summary').notNull(),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_review_runs_video_project_idx').on(table.videoProjectId),
    check('ai_review_runs_score_range', sql`${table.score} >= 0 and ${table.score} <= 100`),
  ],
);

export const aiEditCommands = pgTable(
  'ai_edit_commands',
  {
    id: uuid('id').primaryKey(),
    aiReviewRunId: uuid('ai_review_run_id')
      .notNull()
      .references(() => aiReviewRuns.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    command: jsonb('command').notNull(),
    status: aiEditCommandStatus('status').default('pending').notNull(),
    resultProjectRevisionId: uuid('result_project_revision_id').references(
      () => projectRevisions.id,
      { onDelete: 'set null' },
    ),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ai_edit_commands_review_sequence_unique').on(table.aiReviewRunId, table.sequence),
    check('ai_edit_commands_sequence_positive', sql`${table.sequence} > 0`),
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

export const aiTemplates = pgTable(
  'ai_templates',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    spec: jsonb('spec').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ai_templates_hotel_id_idx').on(table.hotelId)],
);
