import { z } from 'zod';

const directorIdSchema = z.uuid();
const directorDateTimeSchema = z.iso.datetime({ offset: true });

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

export type CreativeProjectMode = z.infer<typeof creativeProjectModeSchema>;
export type CreativeProjectStatus = z.infer<typeof creativeProjectStatusSchema>;
export type CreativeProject = z.infer<typeof creativeProjectSchema>;
export type CreateCreativeProjectInput = z.infer<typeof createCreativeProjectSchema>;
export type UpdateCreativeProjectInput = z.infer<typeof updateCreativeProjectSchema>;
export type AiDirectorFeatureFlags = z.infer<typeof aiDirectorFeatureFlagsSchema>;
