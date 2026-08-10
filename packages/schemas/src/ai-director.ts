import { z } from 'zod';

const directorIdSchema = z.uuid();
const directorDateTimeSchema = z.iso.datetime({ offset: true });
const directorPlatformSchema = z.enum(['douyin', 'xiaohongshu', 'wechat_channels', 'other']);

export const creativeProjectModeSchema = z.enum(['idea', 'script', 'reference', 'assets']);

export const creativeProjectStatusSchema = z.enum([
  'draft',
  'planning',
  'script_ready',
  'waiting_assets',
  'blueprint_ready',
  'generated',
  'completed',
]);

export const creativeProjectSchema = z.object({
  id: directorIdSchema,
  hotelId: directorIdSchema,
  title: z.string().min(1).max(160),
  mode: creativeProjectModeSchema,
  status: creativeProjectStatusSchema,
  selectedBriefRevisionId: directorIdSchema.nullable(),
  selectedScriptRevisionId: directorIdSchema.nullable(),
  selectedBlueprintId: directorIdSchema.nullable(),
  selectedVideoProjectId: directorIdSchema.nullable(),
  createdByUserId: directorIdSchema,
  metadata: z.record(z.string(), z.unknown()),
  deletedAt: directorDateTimeSchema.nullable(),
  createdAt: directorDateTimeSchema,
  updatedAt: directorDateTimeSchema,
});

export const createCreativeProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  mode: creativeProjectModeSchema,
});

export const updateCreativeProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    status: creativeProjectStatusSchema.optional(),
    selectedBriefRevisionId: directorIdSchema.nullable().optional(),
    selectedScriptRevisionId: directorIdSchema.nullable().optional(),
    selectedBlueprintId: directorIdSchema.nullable().optional(),
    selectedVideoProjectId: directorIdSchema.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied');

export const creativeProjectIdParamsSchema = z.object({ projectId: directorIdSchema });

export const aiDirectorFeatureFlagsSchema = z.object({
  aiDirectorEnabled: z.boolean(),
  referenceAnalysisEnabled: z.boolean(),
  dynamicBlueprintEnabled: z.boolean(),
  aiReviewEnabled: z.boolean(),
});

export const creativeBriefRevisionSchema = z.object({
  id: directorIdSchema,
  creativeProjectId: directorIdSchema,
  revision: z.number().int().positive(),
  direction: z.string().max(40).nullable(),
  rawIdea: z.string().min(1),
  objective: z.string().max(300).nullable(),
  platform: directorPlatformSchema,
  durationSeconds: z.number().int().min(5).max(180),
  targetAudience: z.string().max(200).nullable(),
  tone: z.array(z.string()).max(12),
  hotelSellingPoints: z.array(z.string()).max(20),
  hardConstraints: z.array(z.string()).max(20),
  userPrompt: z.string().nullable(),
  createdBy: z.enum(['user', 'ai']),
  modelName: z.string().nullable(),
  promptVersion: z.string().nullable(),
  generationParameters: z.record(z.string(), z.unknown()),
  inputSummary: z.string().nullable(),
  createdAt: directorDateTimeSchema,
});

export const createCreativeBriefRevisionSchema = z
  .object({
    rawIdea: z.string().trim().min(1).max(12_000),
    objective: z.string().trim().min(1).max(300).nullable().optional(),
    platform: directorPlatformSchema.default('douyin'),
    durationSeconds: z.number().int().min(5).max(180).default(16),
    targetAudience: z.string().trim().min(1).max(200).nullable().optional(),
    tone: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    hotelSellingPoints: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
    hardConstraints: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    userPrompt: z.string().trim().min(1).max(12_000).nullable().optional(),
  })
  .strict();

export const creativeDirectionSchema = z
  .object({
    direction: z.enum(['稳妥转化版', '强钩子爆点版', '高级品牌版']),
    title: z.string().min(1).max(160),
    objective: z.string().min(1).max(300),
    hook: z.string().min(1).max(300),
    storyStructure: z.array(z.string().min(1).max(240)).min(3).max(6),
    tone: z.array(z.string().min(1).max(80)).min(1).max(12),
    hotelSellingPoints: z.array(z.string().min(1).max(160)).max(20),
    hardConstraints: z.array(z.string().min(1).max(200)).max(20),
    callToAction: z.string().max(300),
  })
  .strict();

export const expandIdeaOutputSchema = z
  .object({ directions: z.array(creativeDirectionSchema).length(3) })
  .strict();

export const scriptSceneSchema = z.object({
  id: directorIdSchema,
  scriptPackageId: directorIdSchema,
  sequence: z.number().int().positive(),
  title: z.string().min(1).max(160),
  purpose: z.string().min(1).max(240),
  visual: z.string().min(1),
  action: z.string().min(1),
  narration: z.string().nullable(),
  dialogue: z.string().nullable(),
  caption: z.string().max(240).nullable(),
  durationMs: z.number().int().positive(),
  shotType: z.string().nullable(),
  motionType: z.string().nullable(),
  filmingInstruction: z.string().nullable(),
  createdAt: directorDateTimeSchema,
});

export const shotRequirementSchema = z.object({
  id: directorIdSchema,
  scriptPackageId: directorIdSchema,
  scriptSceneId: directorIdSchema.nullable(),
  sequence: z.number().int().positive(),
  description: z.string().min(1),
  requiredTags: z.array(z.string()),
  preferredShotType: z.string().nullable(),
  preferredMotionType: z.string().nullable(),
  preferredDurationMs: z.number().int().positive(),
  required: z.boolean(),
  filmingInstruction: z.string().nullable(),
  createdAt: directorDateTimeSchema,
});

const scriptSceneDraftSchema = scriptSceneSchema
  .omit({ id: true, scriptPackageId: true, createdAt: true })
  .strict()
  .refine(
    (scene) => Boolean(scene.narration?.trim() || scene.dialogue?.trim() || scene.caption?.trim()),
    {
      message: 'Every scene requires narration, dialogue or caption text.',
    },
  );
const shotRequirementDraftSchema = shotRequirementSchema
  .omit({ id: true, scriptPackageId: true, scriptSceneId: true, createdAt: true })
  .extend({ sceneSequence: z.number().int().positive().nullable() })
  .strict();

export const scriptGenerationSchema = z
  .object({
    title: z.string().min(1).max(160),
    hook: z.string().min(1).max(300),
    storySummary: z.string().min(1),
    narrativePattern: z.string().min(1).max(160),
    voiceoverScript: z.string().nullable(),
    dialogue: z.array(z.object({ speaker: z.string(), text: z.string() }).strict()).max(30),
    captions: z
      .array(z.object({ text: z.string(), emphasis: z.array(z.string()) }).strict())
      .max(30),
    callToAction: z.string().max(300).nullable(),
    filmingTips: z.array(z.string()).max(30),
    requiredAssets: z.array(z.string()).max(40),
    totalDurationMs: z.number().int().min(5_000).max(180_000),
    scenes: z.array(scriptSceneDraftSchema).min(3).max(30),
    shotList: z.array(shotRequirementDraftSchema).min(3).max(40),
  })
  .strict()
  .superRefine((value, context) => {
    const total = value.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
    if (Math.abs(total - value.totalDurationMs) > 500) {
      context.addIssue({ code: 'custom', message: 'Scene durations must match totalDurationMs.' });
    }
  });

export const scriptPackageSchema = z.object({
  id: directorIdSchema,
  creativeProjectId: directorIdSchema,
  revision: z.number().int().positive(),
  modelName: z.string().nullable(),
  promptVersion: z.string().nullable(),
  generationParameters: z.record(z.string(), z.unknown()),
  inputSummary: z.string().nullable(),
  createdAt: directorDateTimeSchema,
  ...scriptGenerationSchema.shape,
  scenes: z.array(scriptSceneSchema),
  shotList: z.array(shotRequirementSchema),
});

export const reviseScriptSchema = z
  .object({ instruction: z.string().trim().min(1).max(4_000) })
  .strict();
export const selectRevisionSchema = z.object({ id: directorIdSchema }).strict();

const profileSectionSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    label: z.string(),
  })
  .strict()
  .refine(
    (section) => section.endMs > section.startMs,
    'Profile section must have positive duration',
  );

export const referenceVideoProfileGenerationSchema = z
  .object({
    narrativePattern: z.string().min(1).max(200),
    hookDurationMs: z.number().int().positive(),
    paceCurve: z.array(profileSectionSchema).min(1).max(12),
    shotTypeDistribution: z.record(z.string(), z.number().int().nonnegative()),
    transitionProfile: z.record(z.string(), z.unknown()),
    captionProfile: z.record(z.string(), z.unknown()),
    audioProfile: z.record(z.string(), z.unknown()),
    emotionalCurve: z.array(profileSectionSchema).min(1).max(12),
    reusableStyleRules: z.array(z.string().min(1)).min(1).max(20),
    analysisSummary: z.string().min(1).max(4_000),
  })
  .strict();

export const referenceVideoProfileSchema = z.object({
  id: directorIdSchema,
  creativeProjectId: directorIdSchema,
  assetId: directorIdSchema,
  revision: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  averageShotDurationMs: z.number().int().positive(),
  shotCount: z.number().int().nonnegative(),
  modelName: z.string().nullable(),
  promptVersion: z.string().nullable(),
  generationParameters: z.record(z.string(), z.unknown()),
  inputSummary: z.string().nullable(),
  createdAt: directorDateTimeSchema,
  ...referenceVideoProfileGenerationSchema.shape,
});

export const createReferenceProfileSchema = z.object({ assetId: directorIdSchema }).strict();

export const assetMatchCandidateSchema = z
  .object({
    assetId: directorIdSchema,
    segmentId: directorIdSchema.nullable(),
    scoreBasisPoints: z.number().int().min(0).max(10_000),
    reasons: z.array(z.string().min(1)).min(1).max(12),
    qualityIssues: z.array(z.string()).max(12),
  })
  .strict();

export const assetRequirementStatusSchema = z.enum(['missing', 'weak_match', 'matched']);

export const assetRequirementSchema = z
  .object({
    id: directorIdSchema,
    creativeProjectId: directorIdSchema,
    scriptSceneId: directorIdSchema.nullable(),
    description: z.string().min(1),
    requiredTags: z.array(z.string()),
    preferredShotType: z.string().nullable(),
    preferredMotionType: z.string().nullable(),
    preferredDurationMs: z.number().int().positive(),
    required: z.boolean(),
    matchedAssetIds: z.array(directorIdSchema),
    candidateMatches: z.array(assetMatchCandidateSchema).max(3),
    status: assetRequirementStatusSchema,
    filmingInstruction: z.string().nullable(),
    createdAt: directorDateTimeSchema,
    updatedAt: directorDateTimeSchema,
  })
  .strict();

export const generateAssetRequirementsSchema = z
  .object({ scriptId: directorIdSchema.optional() })
  .strict();
export const assignAssetRequirementSchema = z
  .object({ assetId: directorIdSchema, segmentId: directorIdSchema.nullable().optional() })
  .strict();

const blueprintStyleSchema = z
  .object({
    pace: z.enum(['slow', 'medium', 'fast', 'very_fast']),
    visualTone: z.string().min(1).max(160),
    transitionDensity: z.enum(['none', 'low', 'medium', 'high']),
    captionDensity: z.enum(['low', 'medium', 'high']),
    beatSyncStrength: z.number().int().min(0).max(100),
    referenceStrength: z.number().int().min(0).max(100),
    aiFreedom: z.number().int().min(0).max(100),
  })
  .strict();
const blueprintBeatSchema = z
  .object({
    id: directorIdSchema,
    sequence: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    purpose: z.string().min(1).max(500),
    narration: z.string().nullable(),
    dialogue: z.string().nullable(),
    requiredTags: z.array(z.string().min(1)).max(20),
    preferredTags: z.array(z.string().min(1)).max(20),
    forbiddenTags: z.array(z.string().min(1)).max(20),
    preferredShotTypes: z.array(z.string().min(1)).max(12),
    preferredMotionTypes: z.array(z.string().min(1)).max(12),
    minimumShotDurationMs: z.number().int().positive(),
    maximumShotDurationMs: z.number().int().positive(),
    maximumAssetReuse: z.number().int().positive().max(10),
    audioPolicy: z.enum(['dialogue', 'music', 'ambient', 'mute']),
    caption: z.string().max(240).nullable(),
    transitionIn: z.enum(['cut', 'dissolve', 'fade']).nullable(),
    transitionOut: z.enum(['cut', 'dissolve', 'fade']).nullable(),
  })
  .strict()
  .refine((beat) => beat.endMs > beat.startMs, 'Beat must have positive duration')
  .refine(
    (beat) => beat.maximumShotDurationMs >= beat.minimumShotDurationMs,
    'Maximum shot duration must be at least minimum shot duration',
  );
export const editBlueprintSchema = z
  .object({
    id: directorIdSchema,
    creativeProjectId: directorIdSchema,
    revision: z.number().int().positive(),
    durationSeconds: z.number().int().min(5).max(180),
    frameRate: z.number().int().positive().max(120),
    aspectRatio: z.literal('9:16'),
    style: blueprintStyleSchema,
    beats: z.array(blueprintBeatSchema).min(1).max(60),
    music: z.record(z.string(), z.unknown()),
    captionStyle: z.record(z.string(), z.unknown()),
    globalRules: z.array(z.string().min(1)).max(60),
    seed: z.number().int().min(0).max(4_294_967_295),
    compilerVersion: z.string().min(1),
    sourceAssetIds: z.array(directorIdSchema),
    referenceProfileIds: z.array(directorIdSchema),
    modelName: z.string().nullable(),
    promptVersion: z.string().nullable(),
    generationParameters: z.record(z.string(), z.unknown()),
    inputSummary: z.string().nullable(),
    createdAt: directorDateTimeSchema,
  })
  .strict();

// This schema is intentionally defined separately instead of using `.omit()` on
// `blueprintBeatSchema`. Zod does not allow object-shape operations on schemas
// with refinements, and the generation shape needs the same safety constraints.
const blueprintBeatGenerationSchema = z
  .object({
    sequence: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    purpose: z.string().min(1).max(500),
    narration: z.string().nullable(),
    dialogue: z.string().nullable(),
    requiredTags: z.array(z.string().min(1)).max(20),
    preferredTags: z.array(z.string().min(1)).max(20),
    forbiddenTags: z.array(z.string().min(1)).max(20),
    preferredShotTypes: z.array(z.string().min(1)).max(12),
    preferredMotionTypes: z.array(z.string().min(1)).max(12),
    minimumShotDurationMs: z.number().int().positive(),
    maximumShotDurationMs: z.number().int().positive(),
    maximumAssetReuse: z.number().int().positive().max(10),
    audioPolicy: z.enum(['dialogue', 'music', 'ambient', 'mute']),
    caption: z.string().max(240).nullable(),
    transitionIn: z.enum(['cut', 'dissolve', 'fade']).nullable(),
    transitionOut: z.enum(['cut', 'dissolve', 'fade']).nullable(),
  })
  .strict()
  .refine((beat) => beat.endMs > beat.startMs, 'Beat must have positive duration')
  .refine(
    (beat) => beat.maximumShotDurationMs >= beat.minimumShotDurationMs,
    'Maximum shot duration must be at least minimum shot duration',
  );

export const editBlueprintGenerationSchema = z
  .object({
    durationSeconds: z.number().int().min(5).max(180),
    frameRate: z.number().int().positive().max(120),
    aspectRatio: z.literal('9:16'),
    style: blueprintStyleSchema,
    beats: z.array(blueprintBeatGenerationSchema).min(1).max(60),
    music: z.record(z.string(), z.unknown()),
    captionStyle: z.record(z.string(), z.unknown()),
    globalRules: z.array(z.string().min(1)).max(60),
  })
  .strict();
export const generateBlueprintSchema = z
  .object({
    scriptId: directorIdSchema.optional(),
    seed: z.number().int().min(0).max(4_294_967_295).optional(),
  })
  .strict();
export const compileBlueprintSchema = z
  .object({ seed: z.number().int().min(0).max(4_294_967_295).optional() })
  .strict();

export const videoVersionVariantSchema = z.enum(['A', 'B', 'C']);
export const creativeVideoVersionSchema = z
  .object({
    id: directorIdSchema,
    creativeProjectId: directorIdSchema,
    editBlueprintId: directorIdSchema,
    videoProjectId: directorIdSchema,
    variant: videoVersionVariantSchema,
    seed: z.number().int().min(0).max(4_294_967_295),
    scoreBasisPoints: z.number().int().min(0).max(10_000),
    hookScoreBasisPoints: z.number().int().min(0).max(10_000),
    sellingPointCoverageBasisPoints: z.number().int().min(0).max(10_000),
    paceScoreBasisPoints: z.number().int().min(0).max(10_000),
    usedAssetIds: z.array(directorIdSchema),
    repeatedAssetCount: z.number().int().nonnegative(),
    recommendationReason: z.string().min(1).max(1_000),
    createdAt: directorDateTimeSchema,
  })
  .strict();
export const generateVideoVersionsSchema = z
  .object({
    blueprintId: directorIdSchema.optional(),
    seed: z.number().int().min(0).max(4_294_967_295).optional(),
  })
  .strict();
export const creativeVideoVersionBatchSchema = z
  .object({
    versions: z.array(creativeVideoVersionSchema).length(3),
    recommendedVariant: videoVersionVariantSchema,
  })
  .strict();

// AI review output is deliberately command-based: no model output is ever a
// HotelVideoProject document. Each command is validated again by the editor
// adapter before it can create an immutable project revision.
export const aiReviewCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('replace-clip-asset'),
      clipId: directorIdSchema,
      assetId: directorIdSchema,
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('trim-video'),
      clipId: directorIdSchema,
      sourceStartFrame: z.number().int().nonnegative(),
      sourceDurationFrames: z.number().int().positive(),
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('update-caption'),
      clipId: directorIdSchema,
      text: z.string().trim().min(1).max(2_000),
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('update-title'),
      clipId: directorIdSchema,
      text: z.string().trim().min(1).max(2_000),
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('update-cta'),
      text: z.string().trim().min(1).max(300),
      action: z.enum(['booking', 'contact', 'navigate', 'follow', 'custom']),
      destination: z.string().trim().max(500).nullable(),
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('replace-music'),
      assetId: directorIdSchema,
      reason: z.string().trim().min(1).max(1_000),
    })
    .strict(),
]);

export const aiReviewFindingSchema = z
  .object({
    id: directorIdSchema,
    category: z.enum([
      'hook',
      'story',
      'selling_point',
      'pace',
      'caption',
      'music',
      'cta',
      'quality',
    ]),
    severity: z.enum(['info', 'warning', 'error']),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    message: z.string().trim().min(1).max(1_000),
    commands: z.array(aiReviewCommandSchema).max(10),
  })
  .strict()
  .refine((finding) => finding.endMs > finding.startMs, 'Finding must have positive duration');

export const aiReviewGenerationSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
    scoreBasisPoints: z.number().int().min(0).max(10_000),
    hookScoreBasisPoints: z.number().int().min(0).max(10_000),
    storyScoreBasisPoints: z.number().int().min(0).max(10_000),
    sellingPointScoreBasisPoints: z.number().int().min(0).max(10_000),
    paceScoreBasisPoints: z.number().int().min(0).max(10_000),
    captionScoreBasisPoints: z.number().int().min(0).max(10_000),
    musicScoreBasisPoints: z.number().int().min(0).max(10_000),
    ctaScoreBasisPoints: z.number().int().min(0).max(10_000),
    findings: z.array(aiReviewFindingSchema).max(30),
  })
  .strict();

export const aiReviewStatusSchema = z.enum(['open', 'applied', 'dismissed']);
export const aiReviewSchema = aiReviewGenerationSchema
  .extend({
    id: directorIdSchema,
    videoProjectId: directorIdSchema,
    baseRevision: z.number().int().positive(),
    status: aiReviewStatusSchema,
    modelName: z.string().nullable(),
    promptVersion: z.string().nullable(),
    generationParameters: z.record(z.string(), z.unknown()),
    inputSummary: z.string().nullable(),
    appliedRevision: z.number().int().positive().nullable(),
    dismissedAt: directorDateTimeSchema.nullable(),
    createdAt: directorDateTimeSchema,
  })
  .strict();
export const applyAiReviewSchema = z
  .object({ findingId: directorIdSchema, commandIndex: z.number().int().nonnegative() })
  .strict();

export const creativeFeedbackEventTypeSchema = z.enum([
  'creative_direction_selected',
  'script_revised',
  'script_selected',
  'video_version_selected',
  'shot_replaced',
  'ai_review_applied',
  'ai_review_dismissed',
  'final_render_requested',
]);
export const createCreativeFeedbackEventSchema = z
  .object({
    eventType: creativeFeedbackEventTypeSchema,
    creativeProjectId: directorIdSchema.nullable().optional(),
    videoProjectId: directorIdSchema.nullable().optional(),
    subjectId: directorIdSchema.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export const creativeFeedbackEventSchema = createCreativeFeedbackEventSchema.extend({
  id: directorIdSchema,
  hotelId: directorIdSchema,
  actorUserId: directorIdSchema,
  creativeProjectId: directorIdSchema.nullable(),
  videoProjectId: directorIdSchema.nullable(),
  subjectId: directorIdSchema.nullable(),
  createdAt: directorDateTimeSchema,
});

export type CreativeProjectMode = z.infer<typeof creativeProjectModeSchema>;
export type CreativeProjectStatus = z.infer<typeof creativeProjectStatusSchema>;
export type CreativeProject = z.infer<typeof creativeProjectSchema>;
export type CreateCreativeProjectInput = z.infer<typeof createCreativeProjectSchema>;
export type UpdateCreativeProjectInput = z.infer<typeof updateCreativeProjectSchema>;
export type AiDirectorFeatureFlags = z.infer<typeof aiDirectorFeatureFlagsSchema>;
export type CreativeBriefRevision = z.infer<typeof creativeBriefRevisionSchema>;
export type CreateCreativeBriefRevisionInput = z.input<typeof createCreativeBriefRevisionSchema>;
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;
export type ScriptScene = z.infer<typeof scriptSceneSchema>;
export type ShotRequirement = z.infer<typeof shotRequirementSchema>;
export type ScriptGeneration = z.infer<typeof scriptGenerationSchema>;
export type ScriptPackage = z.infer<typeof scriptPackageSchema>;
export type ReferenceVideoProfile = z.infer<typeof referenceVideoProfileSchema>;
export type ReferenceVideoProfileGeneration = z.infer<typeof referenceVideoProfileGenerationSchema>;
export type AssetMatchCandidate = z.infer<typeof assetMatchCandidateSchema>;
export type AssetRequirement = z.infer<typeof assetRequirementSchema>;
export type EditBlueprint = z.infer<typeof editBlueprintSchema>;
export type BlueprintBeat = z.infer<typeof blueprintBeatSchema>;
export type EditBlueprintGeneration = z.infer<typeof editBlueprintGenerationSchema>;
export type VideoVersionVariant = z.infer<typeof videoVersionVariantSchema>;
export type CreativeVideoVersion = z.infer<typeof creativeVideoVersionSchema>;
export type AiReviewCommand = z.infer<typeof aiReviewCommandSchema>;
export type AiReviewFinding = z.infer<typeof aiReviewFindingSchema>;
export type AiReviewGeneration = z.infer<typeof aiReviewGenerationSchema>;
export type AiReview = z.infer<typeof aiReviewSchema>;
export type CreativeFeedbackEvent = z.infer<typeof creativeFeedbackEventSchema>;
export type CreateCreativeFeedbackEventInput = z.input<typeof createCreativeFeedbackEventSchema>;
