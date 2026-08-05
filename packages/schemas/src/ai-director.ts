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
  .refine((scene) => Boolean(scene.narration?.trim() || scene.dialogue?.trim()), {
    message: 'Every scene requires narration or dialogue.',
  });
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
