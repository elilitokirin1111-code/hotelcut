import { createHash, randomUUID } from 'node:crypto';

import { and, asc, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  DomainConflictError,
  DomainNotFoundError,
  assertRenderJobTransition,
  type AuthRepository,
  type AssetUploadContext,
  type CreateAiGenerationRunInput,
  type CreateUserSessionInput,
  type HotelCutRepository,
  type PersistQualityReportInput,
  type PersistRenderArtifactInput,
  type PersistProjectRevisionInput,
  type PersistModelProviderSettingsInput,
  type PersistCreativeBriefRevisionInput,
  type PersistScriptPackageInput,
  type PersistReferenceVideoProfileInput,
  type CreateAssetRequirementInput,
  type PersistEditBlueprintInput,
  type PersistCreativeVideoVersionInput,
  type PersistVideoProjectInput,
  type QueuedAssetAnalysis,
  type RegisterAssetUploadInput,
  type RegisteredAssetUpload,
  type StoredModelProviderSettings,
} from '@hotelcut/domain';
import type {
  AnalysisJob,
  Asset,
  AssetDerivative,
  AssetDerivativeKind,
  AssetDetail,
  AssetRequirement,
  EditBlueprint,
  AssetSegment,
  AssetUpload,
  BrandKit,
  CompleteAssetUploadInput,
  CreativeProject,
  CreativeVideoVersion,
  CreativeBriefRevision,
  CreateCreativeProjectInput,
  CreateHotelInput,
  CreateManualSegmentInput,
  CreateRenderJobInput,
  CreateVideoBriefInput,
  Hotel,
  Organization,
  ProjectRevision,
  QualityReport,
  RenderArtifact,
  RenderJob,
  RenderJobDetail,
  RenderLogEntry,
  RenderJobStatus,
  ReferenceVideoProfile,
  ScriptPackage,
  UpdateHotelInput,
  UpdateCreativeProjectInput,
  UpsertBrandKitInput,
  User,
  VideoBrief,
  VideoProject,
  VideoProjectDetail,
} from '@hotelcut/schemas';
import {
  analysisJobSchema,
  assetDerivativeSchema,
  assetSchema,
  assetSegmentSchema,
  assetUploadSchema,
  assetRequirementSchema,
  editBlueprintSchema,
  creativeVideoVersionSchema,
  creativeProjectSchema,
  creativeBriefRevisionSchema,
  modelApiModeSchema,
  modelProviderKindSchema,
  modelReasoningEffortSchema,
  projectRevisionSchema,
  qualityReportSchema,
  renderArtifactSchema,
  renderJobSchema,
  referenceVideoProfileSchema,
  scriptPackageSchema,
  scriptSceneSchema,
  shotRequirementSchema,
  videoBriefSchema,
  videoProjectSchema,
} from '@hotelcut/schemas';

import * as schema from './schema.js';

type Database = PostgresJsDatabase<typeof schema>;

function toIso(value: Date): string {
  return value.toISOString();
}

function mapOrganization(row: typeof schema.organizations.$inferSelect): Organization {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function mapUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    externalSubject: row.externalSubject,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapHotel(row: typeof schema.hotels.$inferSelect): Hotel {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function mapBrandKit(row: typeof schema.brandKits.$inferSelect): BrandKit {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function mapModelProviderSettings(
  row: typeof schema.modelProviderSettings.$inferSelect,
): StoredModelProviderSettings {
  return {
    ...row,
    provider: modelProviderKindSchema.parse(row.provider),
    apiMode: modelApiModeSchema.parse(row.apiMode),
    reasoningEffort: modelReasoningEffortSchema.parse(row.reasoningEffort),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapCreativeProject(row: typeof schema.creativeProjects.$inferSelect): CreativeProject {
  return creativeProjectSchema.parse({
    ...row,
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapCreativeBriefRevision(
  row: typeof schema.creativeBriefRevisions.$inferSelect,
): CreativeBriefRevision {
  return creativeBriefRevisionSchema.parse({
    ...row,
    direction: row.direction ?? null,
    objective: row.objective ?? null,
    targetAudience: row.targetAudience ?? null,
    userPrompt: row.userPrompt ?? null,
    modelName: row.modelName ?? null,
    promptVersion: row.promptVersion ?? null,
    inputSummary: row.inputSummary ?? null,
    createdAt: toIso(row.createdAt),
  });
}

function mapReferenceVideoProfile(
  row: typeof schema.referenceVideoProfiles.$inferSelect,
): ReferenceVideoProfile {
  return referenceVideoProfileSchema.parse({
    ...row,
    modelName: row.modelName ?? null,
    promptVersion: row.promptVersion ?? null,
    inputSummary: row.inputSummary ?? null,
    createdAt: toIso(row.createdAt),
  });
}

function mapScriptScene(row: typeof schema.scriptScenes.$inferSelect) {
  return scriptSceneSchema.parse({
    ...row,
    narration: row.narration ?? null,
    dialogue: row.dialogue ?? null,
    shotType: row.shotType ?? null,
    motionType: row.motionType ?? null,
    filmingInstruction: row.filmingInstruction ?? null,
    createdAt: toIso(row.createdAt),
  });
}

function mapShotRequirement(row: typeof schema.shotRequirements.$inferSelect) {
  return shotRequirementSchema.parse({
    ...row,
    scriptSceneId: row.scriptSceneId ?? null,
    preferredShotType: row.preferredShotType ?? null,
    preferredMotionType: row.preferredMotionType ?? null,
    filmingInstruction: row.filmingInstruction ?? null,
    createdAt: toIso(row.createdAt),
  });
}

function mapAssetRequirement(row: typeof schema.assetRequirements.$inferSelect): AssetRequirement {
  return assetRequirementSchema.parse({
    ...row,
    scriptSceneId: row.scriptSceneId ?? null,
    preferredShotType: row.preferredShotType ?? null,
    preferredMotionType: row.preferredMotionType ?? null,
    matchedAssetIds: row.matchedAssetIds,
    candidateMatches: row.candidateMatches,
    filmingInstruction: row.filmingInstruction ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapEditBlueprint(
  row: typeof schema.editBlueprints.$inferSelect,
  beats: Array<typeof schema.editBlueprintBeats.$inferSelect>,
): EditBlueprint {
  return editBlueprintSchema.parse({
    ...row,
    style: row.style,
    music: row.music,
    captionStyle: row.captionStyle,
    globalRules: row.globalRules,
    sourceAssetIds: row.sourceAssetIds,
    referenceProfileIds: row.referenceProfileIds,
    modelName: row.modelName ?? null,
    promptVersion: row.promptVersion ?? null,
    generationParameters: row.generationParameters,
    inputSummary: row.inputSummary ?? null,
    createdAt: toIso(row.createdAt),
    beats: beats.map((beat) => ({
      ...beat,
      narration: beat.narration ?? null,
      dialogue: beat.dialogue ?? null,
      transitionIn: beat.transitionIn as 'cut' | 'dissolve' | 'fade' | null,
      transitionOut: beat.transitionOut as 'cut' | 'dissolve' | 'fade' | null,
      caption: beat.caption ?? null,
      createdAt: toIso(beat.createdAt),
    })),
  });
}

function mapCreativeVideoVersion(
  row: typeof schema.creativeVideoVersions.$inferSelect,
): CreativeVideoVersion {
  return creativeVideoVersionSchema.parse({
    ...row,
    seed: Number(row.seed),
    usedAssetIds: row.usedAssetIds,
    createdAt: toIso(row.createdAt),
  });
}

function mapVideoBrief(row: typeof schema.videoBriefs.$inferSelect): VideoBrief {
  return videoBriefSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapVideoProject(row: typeof schema.videoProjects.$inferSelect): VideoProject {
  return videoProjectSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapProjectRevision(row: typeof schema.projectRevisions.$inferSelect): ProjectRevision {
  return projectRevisionSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
  });
}

function mapAsset(row: typeof schema.assets.$inferSelect): Asset {
  return assetSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapAssetUpload(row: typeof schema.assetUploads.$inferSelect): AssetUpload {
  return assetUploadSchema.parse({
    ...row,
    expiresAt: toIso(row.expiresAt),
    completedAt: row.completedAt ? toIso(row.completedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapAssetDerivative(row: typeof schema.assetDerivatives.$inferSelect): AssetDerivative {
  return assetDerivativeSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapAssetSegment(row: typeof schema.assetSegments.$inferSelect): AssetSegment {
  return assetSegmentSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapAnalysisJob(row: typeof schema.analysisJobs.$inferSelect): AnalysisJob {
  return analysisJobSchema.parse({
    ...row,
    startedAt: row.startedAt ? toIso(row.startedAt) : null,
    finishedAt: row.finishedAt ? toIso(row.finishedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapRenderJob(row: typeof schema.renderJobs.$inferSelect): RenderJob {
  return renderJobSchema.parse({
    ...row,
    cancelRequestedAt: row.cancelRequestedAt ? toIso(row.cancelRequestedAt) : null,
    startedAt: row.startedAt ? toIso(row.startedAt) : null,
    finishedAt: row.finishedAt ? toIso(row.finishedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function mapRenderArtifact(row: typeof schema.renderArtifacts.$inferSelect): RenderArtifact {
  return renderArtifactSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
  });
}

function mapQualityReport(row: typeof schema.qualityReports.$inferSelect): QualityReport {
  return qualityReportSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
  });
}

function appendRenderLog(logs: unknown, entry: RenderLogEntry): RenderLogEntry[] {
  return [...renderJobSchema.shape.logs.parse(logs), entry];
}

function renderLog(
  stage: RenderLogEntry['stage'],
  message: string,
  level: RenderLogEntry['level'] = 'info',
  details: Record<string, unknown> = {},
): RenderLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    details,
  };
}

function renderStageForStatus(status: RenderJobStatus): RenderLogEntry['stage'] {
  if (
    status === 'queued' ||
    status === 'preprocessing' ||
    status === 'rendering' ||
    status === 'validating'
  ) {
    return status;
  }
  return 'validating';
}

export class PostgresHotelCutRepository implements HotelCutRepository, AuthRepository {
  constructor(private readonly db: Database) {}

  async ping(): Promise<void> {
    await this.db.execute('select 1');
  }

  async findPasswordCredentialByEmail(email: string) {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), eq(schema.users.status, 'active')))
      .limit(1);

    if (!row?.passwordHash) {
      return null;
    }
    return { passwordHash: row.passwordHash, user: mapUser(row) };
  }

  async createUserSession(input: CreateUserSessionInput): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .delete(schema.userSessions)
        .where(
          and(
            eq(schema.userSessions.userId, input.userId),
            lt(schema.userSessions.expiresAt, new Date()),
          ),
        );
      await transaction.insert(schema.userSessions).values(input);
    });
  }

  async findUserBySessionTokenHash(tokenHash: string, now: Date) {
    const [row] = await this.db
      .select({ expiresAt: schema.userSessions.expiresAt, user: schema.users })
      .from(schema.userSessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
      .where(
        and(
          eq(schema.userSessions.tokenHash, tokenHash),
          gt(schema.userSessions.expiresAt, now),
          eq(schema.users.status, 'active'),
        ),
      )
      .limit(1);

    return row ? { expiresAt: row.expiresAt, user: mapUser(row.user) } : null;
  }

  async revokeUserSession(tokenHash: string): Promise<void> {
    await this.db.delete(schema.userSessions).where(eq(schema.userSessions.tokenHash, tokenHash));
  }

  async listOrganizations(actorUserId: string): Promise<Organization[]> {
    const rows = await this.db
      .select({ organization: schema.organizations })
      .from(schema.organizations)
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.organizations.id),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .orderBy(asc(schema.organizations.name));

    return rows.map(({ organization }) => mapOrganization(organization));
  }

  async listHotels(actorUserId: string): Promise<Hotel[]> {
    const rows = await this.db
      .select({ hotel: schema.hotels })
      .from(schema.hotels)
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .orderBy(asc(schema.hotels.name));

    return rows.map(({ hotel }) => mapHotel(hotel));
  }

  async createHotel(actorUserId: string, input: CreateHotelInput): Promise<Hotel> {
    await this.requireOrganizationAdmin(actorUserId, input.organizationId);

    try {
      const [row] = await this.db
        .insert(schema.hotels)
        .values({
          id: randomUUID(),
          organizationId: input.organizationId,
          name: input.name,
          city: input.city,
          address: input.address ?? null,
          timezone: input.timezone,
        })
        .returning();

      if (!row) {
        throw new Error('Hotel insert did not return a row');
      }
      return mapHotel(row);
    } catch (error) {
      if (error instanceof Error && error.message.includes('hotels_organization_name_unique')) {
        throw new DomainConflictError('A hotel with this name already exists in the organization');
      }
      throw error;
    }
  }

  async getHotel(actorUserId: string, hotelId: string): Promise<Hotel> {
    return mapHotel(await this.requireHotelMember(actorUserId, hotelId));
  }

  async updateHotel(actorUserId: string, hotelId: string, input: UpdateHotelInput): Promise<Hotel> {
    await this.requireHotelAdmin(actorUserId, hotelId);

    const [row] = await this.db
      .update(schema.hotels)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.hotels.id, hotelId))
      .returning();

    if (!row) {
      throw new DomainNotFoundError();
    }
    return mapHotel(row);
  }

  async getBrandKit(actorUserId: string, hotelId: string): Promise<BrandKit> {
    await this.requireHotelMember(actorUserId, hotelId);
    const [row] = await this.db
      .select()
      .from(schema.brandKits)
      .where(eq(schema.brandKits.hotelId, hotelId))
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError('Brand kit not found');
    }
    return mapBrandKit(row);
  }

  async upsertBrandKit(
    actorUserId: string,
    hotelId: string,
    input: UpsertBrandKitInput,
  ): Promise<BrandKit> {
    await this.requireHotelAdmin(actorUserId, hotelId);
    const values = {
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      accentColor: input.accentColor,
      fontFamily: input.fontFamily,
      subtitleStyle: input.subtitleStyle,
      endingText: input.endingText,
      contactText: input.contactText ?? null,
      logoAssetId: input.logoAssetId ?? null,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(schema.brandKits)
      .values({ id: randomUUID(), hotelId, ...values })
      .onConflictDoUpdate({
        target: schema.brandKits.hotelId,
        set: values,
      })
      .returning();

    if (!row) {
      throw new Error('Brand kit upsert did not return a row');
    }
    return mapBrandKit(row);
  }

  async getModelProviderSettings(
    actorUserId: string,
    hotelId: string,
  ): Promise<StoredModelProviderSettings | null> {
    await this.requireHotelAdmin(actorUserId, hotelId);
    const [row] = await this.db
      .select()
      .from(schema.modelProviderSettings)
      .where(eq(schema.modelProviderSettings.hotelId, hotelId))
      .limit(1);
    return row ? mapModelProviderSettings(row) : null;
  }

  async upsertModelProviderSettings(
    actorUserId: string,
    hotelId: string,
    input: PersistModelProviderSettingsInput,
  ): Promise<StoredModelProviderSettings> {
    await this.requireHotelAdmin(actorUserId, hotelId);
    const values = { ...input, updatedAt: new Date() };
    const [row] = await this.db
      .insert(schema.modelProviderSettings)
      .values({ id: randomUUID(), hotelId, ...values })
      .onConflictDoUpdate({
        target: schema.modelProviderSettings.hotelId,
        set: values,
      })
      .returning();
    if (!row) {
      throw new Error('Model provider settings upsert did not return a row');
    }
    return mapModelProviderSettings(row);
  }

  async listCreativeProjects(actorUserId: string, hotelId: string): Promise<CreativeProject[]> {
    await this.requireHotelMember(actorUserId, hotelId);
    const rows = await this.db
      .select()
      .from(schema.creativeProjects)
      .where(
        and(
          eq(schema.creativeProjects.hotelId, hotelId),
          isNull(schema.creativeProjects.deletedAt),
        ),
      )
      .orderBy(desc(schema.creativeProjects.updatedAt));

    return rows.map(mapCreativeProject);
  }

  async createCreativeProject(
    actorUserId: string,
    hotelId: string,
    input: CreateCreativeProjectInput,
  ): Promise<CreativeProject> {
    await this.requireHotelMember(actorUserId, hotelId);
    const [row] = await this.db
      .insert(schema.creativeProjects)
      .values({
        id: randomUUID(),
        hotelId,
        title: input.title,
        mode: input.mode,
        status: 'draft',
        createdByUserId: actorUserId,
        metadata: {},
      })
      .returning();

    if (!row) {
      throw new Error('Creative project insert did not return a row');
    }
    return mapCreativeProject(row);
  }

  async getCreativeProject(actorUserId: string, projectId: string): Promise<CreativeProject> {
    return mapCreativeProject(await this.requireCreativeProjectMember(actorUserId, projectId));
  }

  async updateCreativeProject(
    actorUserId: string,
    projectId: string,
    input: UpdateCreativeProjectInput,
  ): Promise<CreativeProject> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const [row] = await this.db
      .update(schema.creativeProjects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.creativeProjects.id, projectId))
      .returning();

    if (!row) {
      throw new DomainNotFoundError('Creative project not found');
    }
    return mapCreativeProject(row);
  }

  async listCreativeBriefRevisions(
    actorUserId: string,
    projectId: string,
  ): Promise<CreativeBriefRevision[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.creativeBriefRevisions)
      .where(eq(schema.creativeBriefRevisions.creativeProjectId, projectId))
      .orderBy(desc(schema.creativeBriefRevisions.revision));
    return rows.map(mapCreativeBriefRevision);
  }

  async createCreativeBriefRevision(
    actorUserId: string,
    projectId: string,
    input: PersistCreativeBriefRevisionInput,
  ): Promise<CreativeBriefRevision> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const [latest] = await this.db
      .select({ revision: schema.creativeBriefRevisions.revision })
      .from(schema.creativeBriefRevisions)
      .where(eq(schema.creativeBriefRevisions.creativeProjectId, projectId))
      .orderBy(desc(schema.creativeBriefRevisions.revision))
      .limit(1);
    const [row] = await this.db
      .insert(schema.creativeBriefRevisions)
      .values({
        id: randomUUID(),
        creativeProjectId: projectId,
        revision: (latest?.revision ?? 0) + 1,
        direction: input.direction ?? null,
        rawIdea: input.rawIdea,
        objective: input.objective ?? null,
        platform: input.platform ?? 'douyin',
        durationSeconds: input.durationSeconds ?? 16,
        targetAudience: input.targetAudience ?? null,
        tone: input.tone ?? [],
        hotelSellingPoints: input.hotelSellingPoints ?? [],
        hardConstraints: input.hardConstraints ?? [],
        userPrompt: input.userPrompt ?? null,
        createdBy: input.createdBy,
        modelName: input.modelName ?? null,
        promptVersion: input.promptVersion ?? null,
        generationParameters: input.generationParameters ?? {},
        inputSummary: input.inputSummary ?? null,
      })
      .returning();
    if (!row) throw new Error('Creative brief revision insert did not return a row');
    return mapCreativeBriefRevision(row);
  }

  async listScriptPackages(actorUserId: string, projectId: string): Promise<ScriptPackage[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.scriptPackages)
      .where(eq(schema.scriptPackages.creativeProjectId, projectId))
      .orderBy(desc(schema.scriptPackages.revision));
    return Promise.all(rows.map((row) => this.loadScriptPackage(row)));
  }

  async getScriptPackage(actorUserId: string, scriptId: string): Promise<ScriptPackage> {
    const [row] = await this.db
      .select()
      .from(schema.scriptPackages)
      .where(eq(schema.scriptPackages.id, scriptId))
      .limit(1);
    if (!row) throw new DomainNotFoundError('Script package not found');
    await this.requireCreativeProjectMember(actorUserId, row.creativeProjectId);
    return this.loadScriptPackage(row);
  }

  async createScriptPackage(
    actorUserId: string,
    projectId: string,
    input: PersistScriptPackageInput,
  ): Promise<ScriptPackage> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const scriptId = randomUUID();
    await this.db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ revision: schema.scriptPackages.revision })
        .from(schema.scriptPackages)
        .where(eq(schema.scriptPackages.creativeProjectId, projectId))
        .orderBy(desc(schema.scriptPackages.revision))
        .limit(1);
      await tx.insert(schema.scriptPackages).values({
        id: scriptId,
        creativeProjectId: projectId,
        revision: (latest?.revision ?? 0) + 1,
        title: input.title,
        hook: input.hook,
        storySummary: input.storySummary,
        narrativePattern: input.narrativePattern,
        voiceoverScript: input.voiceoverScript,
        dialogue: input.dialogue,
        captions: input.captions,
        callToAction: input.callToAction,
        filmingTips: input.filmingTips,
        requiredAssets: input.requiredAssets,
        totalDurationMs: input.totalDurationMs,
        modelName: input.modelName ?? null,
        promptVersion: input.promptVersion ?? null,
        generationParameters: input.generationParameters ?? {},
        inputSummary: input.inputSummary ?? null,
      });
      const sceneRows = await tx
        .insert(schema.scriptScenes)
        .values(
          input.scenes.map((scene) => ({
            id: randomUUID(),
            scriptPackageId: scriptId,
            sequence: scene.sequence,
            title: scene.title,
            purpose: scene.purpose,
            visual: scene.visual,
            action: scene.action,
            narration: scene.narration,
            dialogue: scene.dialogue,
            durationMs: scene.durationMs,
            shotType: scene.shotType,
            motionType: scene.motionType,
            filmingInstruction: scene.filmingInstruction,
          })),
        )
        .returning();
      const sceneIds = new Map(sceneRows.map((scene) => [scene.sequence, scene.id]));
      await tx.insert(schema.shotRequirements).values(
        input.shotList.map((shot) => ({
          id: randomUUID(),
          scriptPackageId: scriptId,
          scriptSceneId:
            shot.sceneSequence === null ? null : (sceneIds.get(shot.sceneSequence) ?? null),
          sequence: shot.sequence,
          description: shot.description,
          requiredTags: shot.requiredTags,
          preferredShotType: shot.preferredShotType,
          preferredMotionType: shot.preferredMotionType,
          preferredDurationMs: shot.preferredDurationMs,
          required: shot.required,
          filmingInstruction: shot.filmingInstruction,
        })),
      );
    });
    return this.getScriptPackage(actorUserId, scriptId);
  }

  async createAiGenerationRun(
    actorUserId: string,
    projectId: string,
    input: CreateAiGenerationRunInput,
  ): Promise<string> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const id = randomUUID();
    await this.db.insert(schema.aiGenerationRuns).values({
      id,
      creativeProjectId: projectId,
      operation: input.operation,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      generationParameters: input.generationParameters,
      inputSummary: input.inputSummary,
      createdByUserId: actorUserId,
    });
    return id;
  }

  async finishAiGenerationRun(
    runId: string,
    outcome: { failureReason?: string; outputSummary?: string },
  ): Promise<void> {
    await this.db
      .update(schema.aiGenerationRuns)
      .set({
        status: outcome.failureReason ? 'failed' : 'succeeded',
        failureReason: outcome.failureReason ?? null,
        outputSummary: outcome.outputSummary ?? null,
        finishedAt: new Date(),
      })
      .where(eq(schema.aiGenerationRuns.id, runId));
  }

  async listReferenceVideoProfiles(
    actorUserId: string,
    projectId: string,
  ): Promise<ReferenceVideoProfile[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.referenceVideoProfiles)
      .where(eq(schema.referenceVideoProfiles.creativeProjectId, projectId))
      .orderBy(desc(schema.referenceVideoProfiles.createdAt));
    return rows.map(mapReferenceVideoProfile);
  }

  async createReferenceVideoProfile(
    actorUserId: string,
    projectId: string,
    input: PersistReferenceVideoProfileInput,
  ): Promise<ReferenceVideoProfile> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    await this.requireAssetMember(actorUserId, input.assetId);
    const [latest] = await this.db
      .select({ revision: schema.referenceVideoProfiles.revision })
      .from(schema.referenceVideoProfiles)
      .where(
        and(
          eq(schema.referenceVideoProfiles.creativeProjectId, projectId),
          eq(schema.referenceVideoProfiles.assetId, input.assetId),
        ),
      )
      .orderBy(desc(schema.referenceVideoProfiles.revision))
      .limit(1);
    const [row] = await this.db
      .insert(schema.referenceVideoProfiles)
      .values({
        id: randomUUID(),
        creativeProjectId: projectId,
        assetId: input.assetId,
        revision: (latest?.revision ?? 0) + 1,
        durationMs: input.durationMs,
        narrativePattern: input.narrativePattern,
        hookDurationMs: input.hookDurationMs,
        averageShotDurationMs: input.averageShotDurationMs,
        shotCount: input.shotCount,
        paceCurve: input.paceCurve,
        shotTypeDistribution: input.shotTypeDistribution,
        transitionProfile: input.transitionProfile,
        captionProfile: input.captionProfile,
        audioProfile: input.audioProfile,
        emotionalCurve: input.emotionalCurve,
        reusableStyleRules: input.reusableStyleRules,
        analysisSummary: input.analysisSummary,
        modelName: input.modelName ?? null,
        promptVersion: input.promptVersion ?? null,
        generationParameters: input.generationParameters ?? {},
        inputSummary: input.inputSummary ?? null,
      })
      .returning();
    if (!row) throw new Error('Reference profile insert did not return a row');
    return mapReferenceVideoProfile(row);
  }

  async replaceAssetRequirements(
    actorUserId: string,
    projectId: string,
    input: CreateAssetRequirementInput[],
  ): Promise<AssetRequirement[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.assetRequirements)
        .where(eq(schema.assetRequirements.creativeProjectId, projectId));
      if (input.length === 0) return [];
      return tx
        .insert(schema.assetRequirements)
        .values(
          input.map((requirement) => ({
            id: randomUUID(),
            creativeProjectId: projectId,
            scriptSceneId: requirement.scriptSceneId,
            description: requirement.description,
            requiredTags: requirement.requiredTags,
            preferredShotType: requirement.preferredShotType,
            preferredMotionType: requirement.preferredMotionType,
            preferredDurationMs: requirement.preferredDurationMs,
            required: requirement.required,
            matchedAssetIds:
              requirement.status === 'matched'
                ? requirement.candidateMatches.slice(0, 1).map((match) => match.assetId)
                : [],
            candidateMatches: requirement.candidateMatches,
            status: requirement.status,
            filmingInstruction: requirement.filmingInstruction,
          })),
        )
        .returning();
    });
    return rows.map(mapAssetRequirement);
  }

  async listAssetRequirements(actorUserId: string, projectId: string): Promise<AssetRequirement[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.assetRequirements)
      .where(eq(schema.assetRequirements.creativeProjectId, projectId))
      .orderBy(asc(schema.assetRequirements.createdAt));
    return rows.map(mapAssetRequirement);
  }

  async assignAssetRequirement(
    actorUserId: string,
    projectId: string,
    requirementId: string,
    assetId: string,
  ): Promise<AssetRequirement> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    await this.requireAssetMember(actorUserId, assetId);
    const [row] = await this.db
      .update(schema.assetRequirements)
      .set({ matchedAssetIds: [assetId], status: 'matched', updatedAt: new Date() })
      .where(
        and(
          eq(schema.assetRequirements.id, requirementId),
          eq(schema.assetRequirements.creativeProjectId, projectId),
        ),
      )
      .returning();
    if (!row) throw new DomainNotFoundError('Asset requirement not found');
    return mapAssetRequirement(row);
  }

  async listEditBlueprints(actorUserId: string, projectId: string): Promise<EditBlueprint[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.editBlueprints)
      .where(eq(schema.editBlueprints.creativeProjectId, projectId))
      .orderBy(desc(schema.editBlueprints.revision));
    const blueprints = await Promise.all(
      rows.map(async (row) => {
        const beats = await this.db
          .select()
          .from(schema.editBlueprintBeats)
          .where(eq(schema.editBlueprintBeats.editBlueprintId, row.id))
          .orderBy(asc(schema.editBlueprintBeats.sequence));
        return mapEditBlueprint(row, beats);
      }),
    );
    return blueprints;
  }

  async createEditBlueprint(
    actorUserId: string,
    projectId: string,
    input: PersistEditBlueprintInput,
  ): Promise<EditBlueprint> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ revision: schema.editBlueprints.revision })
        .from(schema.editBlueprints)
        .where(eq(schema.editBlueprints.creativeProjectId, projectId))
        .orderBy(desc(schema.editBlueprints.revision))
        .limit(1);
      await tx.insert(schema.editBlueprints).values({
        id,
        creativeProjectId: projectId,
        revision: (latest?.revision ?? 0) + 1,
        durationSeconds: input.durationSeconds,
        frameRate: input.frameRate,
        aspectRatio: input.aspectRatio,
        style: input.style,
        music: input.music,
        captionStyle: input.captionStyle,
        globalRules: input.globalRules,
        seed: input.seed,
        compilerVersion: input.compilerVersion,
        sourceAssetIds: input.sourceAssetIds,
        referenceProfileIds: input.referenceProfileIds,
        modelName: input.modelName ?? null,
        promptVersion: input.promptVersion ?? null,
        generationParameters: input.generationParameters ?? {},
        inputSummary: input.inputSummary ?? null,
      });
      await tx
        .insert(schema.editBlueprintBeats)
        .values(input.beats.map((beat) => ({ ...beat, id: randomUUID(), editBlueprintId: id })));
    });
    const [created] = await this.listEditBlueprints(actorUserId, projectId);
    if (!created || created.id !== id)
      throw new Error('Edit blueprint insert did not return a row');
    return created;
  }

  async listCreativeVideoVersions(
    actorUserId: string,
    projectId: string,
  ): Promise<CreativeVideoVersion[]> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.creativeVideoVersions)
      .where(eq(schema.creativeVideoVersions.creativeProjectId, projectId))
      .orderBy(desc(schema.creativeVideoVersions.createdAt));
    return rows.map(mapCreativeVideoVersion);
  }

  async createCreativeVideoVersion(
    actorUserId: string,
    projectId: string,
    input: PersistCreativeVideoVersionInput,
  ): Promise<CreativeVideoVersion> {
    await this.requireCreativeProjectMember(actorUserId, projectId);
    const [row] = await this.db
      .insert(schema.creativeVideoVersions)
      .values({ id: randomUUID(), creativeProjectId: projectId, ...input })
      .returning();
    if (!row) throw new Error('Creative video version insert did not return a row');
    return mapCreativeVideoVersion(row);
  }

  async listVideoBriefs(actorUserId: string, hotelId: string): Promise<VideoBrief[]> {
    await this.requireHotelMember(actorUserId, hotelId);
    const rows = await this.db
      .select()
      .from(schema.videoBriefs)
      .where(eq(schema.videoBriefs.hotelId, hotelId))
      .orderBy(asc(schema.videoBriefs.createdAt));

    return rows.map(mapVideoBrief);
  }

  async createVideoBrief(
    actorUserId: string,
    hotelId: string,
    input: CreateVideoBriefInput,
  ): Promise<VideoBrief> {
    await this.requireHotelMember(actorUserId, hotelId);
    const [row] = await this.db
      .insert(schema.videoBriefs)
      .values({
        id: randomUUID(),
        hotelId,
        title: input.title,
        platform: input.platform,
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        tone: input.tone,
        language: input.language,
        objective: input.objective ?? null,
        targetAudience: input.targetAudience ?? null,
        callToAction: input.callToAction ?? null,
      })
      .returning();

    if (!row) {
      throw new Error('Video brief insert did not return a row');
    }
    return mapVideoBrief(row);
  }

  async getVideoBrief(actorUserId: string, briefId: string): Promise<VideoBrief> {
    const [row] = await this.db
      .select({ brief: schema.videoBriefs })
      .from(schema.videoBriefs)
      .innerJoin(schema.hotels, eq(schema.hotels.id, schema.videoBriefs.hotelId))
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(eq(schema.videoBriefs.id, briefId))
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError('Video brief not found');
    }
    return mapVideoBrief(row.brief);
  }

  async listVideoProjects(actorUserId: string, hotelId: string): Promise<VideoProject[]> {
    await this.requireHotelMember(actorUserId, hotelId);
    const rows = await this.db
      .select()
      .from(schema.videoProjects)
      .where(eq(schema.videoProjects.hotelId, hotelId))
      .orderBy(desc(schema.videoProjects.updatedAt));

    return rows.map(mapVideoProject);
  }

  async createVideoProject(
    actorUserId: string,
    hotelId: string,
    input: PersistVideoProjectInput,
  ): Promise<VideoProjectDetail> {
    await this.requireHotelMember(actorUserId, hotelId);
    const [brief] = await this.db
      .select({ id: schema.videoBriefs.id })
      .from(schema.videoBriefs)
      .where(
        and(eq(schema.videoBriefs.id, input.videoBriefId), eq(schema.videoBriefs.hotelId, hotelId)),
      )
      .limit(1);
    if (!brief) {
      throw new DomainNotFoundError('Video brief not found');
    }

    return this.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .insert(schema.videoProjects)
        .values({
          id: input.id,
          hotelId,
          videoBriefId: input.videoBriefId,
          name: input.name,
          templateKey: input.templateKey,
          status: 'draft',
          currentRevision: 1,
        })
        .returning();
      const [revisionRow] = await transaction
        .insert(schema.projectRevisions)
        .values({
          id: randomUUID(),
          videoProjectId: input.id,
          revision: 1,
          schemaVersion: input.schemaVersion,
          projectDocument: input.projectDocument,
          createdByUserId: actorUserId,
        })
        .returning();

      if (!projectRow || !revisionRow) {
        throw new Error('Video project creation did not return rows');
      }
      return {
        project: mapVideoProject(projectRow),
        currentRevision: mapProjectRevision(revisionRow),
      };
    });
  }

  async getVideoProject(actorUserId: string, projectId: string): Promise<VideoProjectDetail> {
    const projectRow = await this.requireVideoProjectMember(actorUserId, projectId);
    const [revisionRow] = await this.db
      .select()
      .from(schema.projectRevisions)
      .where(
        and(
          eq(schema.projectRevisions.videoProjectId, projectId),
          eq(schema.projectRevisions.revision, projectRow.currentRevision),
        ),
      )
      .limit(1);
    if (!revisionRow) {
      throw new DomainNotFoundError('Current project revision not found');
    }
    return {
      project: mapVideoProject(projectRow),
      currentRevision: mapProjectRevision(revisionRow),
    };
  }

  async listProjectRevisions(actorUserId: string, projectId: string): Promise<ProjectRevision[]> {
    await this.requireVideoProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.projectRevisions)
      .where(eq(schema.projectRevisions.videoProjectId, projectId))
      .orderBy(desc(schema.projectRevisions.revision));
    return rows.map(mapProjectRevision);
  }

  async saveProjectRevision(
    actorUserId: string,
    projectId: string,
    input: PersistProjectRevisionInput,
  ): Promise<VideoProjectDetail> {
    await this.requireVideoProjectMember(actorUserId, projectId);

    return this.db.transaction(async (transaction) => {
      const now = new Date();
      const nextRevision = input.baseRevision + 1;
      const [projectRow] = await transaction
        .update(schema.videoProjects)
        .set({ currentRevision: nextRevision, updatedAt: now })
        .where(
          and(
            eq(schema.videoProjects.id, projectId),
            eq(schema.videoProjects.currentRevision, input.baseRevision),
          ),
        )
        .returning();
      if (!projectRow) {
        throw new DomainConflictError(
          'Project revision is stale; reload the current revision before saving',
        );
      }

      const [revisionRow] = await transaction
        .insert(schema.projectRevisions)
        .values({
          id: randomUUID(),
          videoProjectId: projectId,
          revision: nextRevision,
          schemaVersion: input.schemaVersion,
          projectDocument: input.projectDocument,
          createdByUserId: actorUserId,
        })
        .returning();
      if (!revisionRow) {
        throw new Error('Project revision insert did not return a row');
      }
      return {
        project: mapVideoProject(projectRow),
        currentRevision: mapProjectRevision(revisionRow),
      };
    });
  }

  async listRenderJobs(actorUserId: string, projectId: string): Promise<RenderJob[]> {
    await this.requireVideoProjectMember(actorUserId, projectId);
    const rows = await this.db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.videoProjectId, projectId))
      .orderBy(desc(schema.renderJobs.createdAt));
    return rows.map(mapRenderJob);
  }

  async createRenderJob(
    actorUserId: string,
    projectId: string,
    input: CreateRenderJobInput,
  ): Promise<RenderJob> {
    const project = await this.requireVideoProjectMember(actorUserId, projectId);
    const revisionCondition = input.projectRevisionId
      ? eq(schema.projectRevisions.id, input.projectRevisionId)
      : eq(schema.projectRevisions.revision, project.currentRevision);
    const [revision] = await this.db
      .select()
      .from(schema.projectRevisions)
      .where(and(eq(schema.projectRevisions.videoProjectId, projectId), revisionCondition))
      .limit(1);
    if (!revision) {
      throw new DomainNotFoundError('Project revision not found');
    }

    const inputHash = createHash('sha256')
      .update(JSON.stringify(revision.projectDocument))
      .digest('hex');
    const now = new Date();
    const [row] = await this.db
      .insert(schema.renderJobs)
      .values({
        id: randomUUID(),
        videoProjectId: projectId,
        projectRevisionId: revision.id,
        requestedByUserId: actorUserId,
        inputHash,
        logs: [
          renderLog('queued', `Render queued for immutable revision ${revision.revision}`, 'info', {
            projectRevisionId: revision.id,
            revision: revision.revision,
          }),
        ],
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new Error('Render job insert did not return a row');
    }
    return mapRenderJob(row);
  }

  async getRenderJob(actorUserId: string, renderJobId: string): Promise<RenderJobDetail> {
    const jobRow = await this.requireRenderJobMember(actorUserId, renderJobId);
    const [artifactRows, reportRows] = await Promise.all([
      this.db
        .select()
        .from(schema.renderArtifacts)
        .where(eq(schema.renderArtifacts.renderJobId, renderJobId))
        .orderBy(asc(schema.renderArtifacts.kind)),
      this.db
        .select()
        .from(schema.qualityReports)
        .where(eq(schema.qualityReports.renderJobId, renderJobId))
        .limit(1),
    ]);
    return {
      job: mapRenderJob(jobRow),
      artifacts: artifactRows.map(mapRenderArtifact),
      qualityReport: reportRows[0] ? mapQualityReport(reportRows[0]) : null,
    };
  }

  async requestRenderCancellation(actorUserId: string, renderJobId: string): Promise<RenderJob> {
    const job = await this.requireRenderJobMember(actorUserId, renderJobId);
    if (!['queued', 'preprocessing', 'rendering'].includes(job.status)) {
      throw new DomainConflictError(`Render job cannot be cancelled from ${job.status}`);
    }
    const now = new Date();
    const queued = job.status === 'queued';
    const [updated] = await this.db
      .update(schema.renderJobs)
      .set({
        status: queued ? 'cancelled' : job.status,
        cancelRequestedAt: now,
        finishedAt: queued ? now : null,
        progressBasisPoints: job.progressBasisPoints,
        logs: appendRenderLog(
          job.logs,
          renderLog(
            queued ? 'queued' : renderStageForStatus(job.status),
            queued ? 'Queued render was cancelled' : 'Render cancellation was requested',
          ),
        ),
        updatedAt: now,
      })
      .where(eq(schema.renderJobs.id, renderJobId))
      .returning();
    if (!updated) {
      throw new DomainNotFoundError('Render job not found');
    }
    return mapRenderJob(updated);
  }

  async retryRenderJob(actorUserId: string, renderJobId: string): Promise<RenderJob> {
    const job = await this.requireRenderJobMember(actorUserId, renderJobId);
    if (!['failed', 'cancelled'].includes(job.status)) {
      throw new DomainConflictError(`Render job cannot be retried from ${job.status}`);
    }
    if (job.attempt >= job.maxAttempts) {
      throw new DomainConflictError('Render job has exhausted its retry attempts');
    }
    const now = new Date();
    const [updated] = await this.db
      .update(schema.renderJobs)
      .set({
        status: 'queued',
        progressBasisPoints: 0,
        cancelRequestedAt: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        logs: appendRenderLog(
          job.logs,
          renderLog('queued', `Manual retry queued after attempt ${job.attempt}`),
        ),
        updatedAt: now,
      })
      .where(eq(schema.renderJobs.id, renderJobId))
      .returning();
    if (!updated) {
      throw new DomainNotFoundError('Render job not found');
    }
    return mapRenderJob(updated);
  }

  async getRenderArtifact(actorUserId: string, artifactId: string): Promise<RenderArtifact> {
    const artifact = await this.requireRenderArtifactMember(actorUserId, artifactId);
    return mapRenderArtifact(artifact);
  }

  async markRenderQueueFailure(renderJobId: string, message: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, renderJobId))
      .limit(1);
    if (!job || job.status !== 'queued') {
      return;
    }
    assertRenderJobTransition(job.status, 'failed');
    const now = new Date();
    await this.db
      .update(schema.renderJobs)
      .set({
        status: 'failed',
        errorCode: 'QUEUE_PUBLISH_FAILED',
        errorMessage: message,
        finishedAt: now,
        logs: appendRenderLog(
          job.logs,
          renderLog('queued', 'Render queue publish failed', 'error', { message }),
        ),
        updatedAt: now,
      })
      .where(eq(schema.renderJobs.id, renderJobId));
  }

  async startRenderJob(renderJobId: string) {
    return this.db.transaction(async (transaction) => {
      const [context] = await transaction
        .select({
          job: schema.renderJobs,
          revision: schema.projectRevisions,
          project: schema.videoProjects,
        })
        .from(schema.renderJobs)
        .innerJoin(
          schema.projectRevisions,
          eq(schema.projectRevisions.id, schema.renderJobs.projectRevisionId),
        )
        .innerJoin(
          schema.videoProjects,
          eq(schema.videoProjects.id, schema.renderJobs.videoProjectId),
        )
        .where(eq(schema.renderJobs.id, renderJobId))
        .limit(1);
      if (!context) {
        throw new DomainNotFoundError('Render job not found');
      }
      if (context.job.status === 'cancelled' || context.job.cancelRequestedAt) {
        throw new DomainConflictError('Render job was cancelled before processing');
      }
      assertRenderJobTransition(context.job.status, 'preprocessing');
      if (context.job.attempt >= context.job.maxAttempts) {
        throw new DomainConflictError('Render job has exhausted its retry attempts');
      }

      const now = new Date();
      const [started] = await transaction
        .update(schema.renderJobs)
        .set({
          status: 'preprocessing',
          attempt: context.job.attempt + 1,
          progressBasisPoints: 100,
          startedAt: now,
          finishedAt: null,
          logs: appendRenderLog(
            context.job.logs,
            renderLog('preprocessing', `Render attempt ${context.job.attempt + 1} started`),
          ),
          updatedAt: now,
        })
        .where(and(eq(schema.renderJobs.id, renderJobId), eq(schema.renderJobs.status, 'queued')))
        .returning();
      if (!started) {
        throw new DomainConflictError('Render job is no longer queued');
      }
      await transaction
        .update(schema.videoProjects)
        .set({ status: 'rendering', updatedAt: now })
        .where(eq(schema.videoProjects.id, context.project.id));
      const assetRows = await transaction
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.hotelId, context.project.hotelId));

      return {
        job: mapRenderJob(started),
        projectRevision: mapProjectRevision(context.revision),
        assets: assetRows.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          status: asset.status,
          storageBucket: asset.storageBucket,
          storageKey: asset.storageKey,
          contentType: asset.contentType,
          byteSize: asset.byteSize,
          checksumSha256: asset.checksumSha256,
        })),
      };
    });
  }

  async isRenderCancellationRequested(renderJobId: string): Promise<boolean> {
    const [job] = await this.db
      .select({
        status: schema.renderJobs.status,
        cancelRequestedAt: schema.renderJobs.cancelRequestedAt,
      })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, renderJobId))
      .limit(1);
    return !job || job.status === 'cancelled' || Boolean(job.cancelRequestedAt);
  }

  async updateRenderJobProgress(
    renderJobId: string,
    status: RenderJobStatus,
    progressBasisPoints: number,
    logEntry: RenderLogEntry,
  ): Promise<RenderJob> {
    const [job] = await this.db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, renderJobId))
      .limit(1);
    if (!job) {
      throw new DomainNotFoundError('Render job not found');
    }
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
      throw new DomainConflictError(`Render job is already ${job.status}`);
    }
    if (job.status !== status) {
      assertRenderJobTransition(job.status, status);
    }
    const [updated] = await this.db
      .update(schema.renderJobs)
      .set({
        status,
        progressBasisPoints: Math.max(job.progressBasisPoints, progressBasisPoints),
        logs: appendRenderLog(job.logs, logEntry),
        updatedAt: new Date(),
      })
      .where(eq(schema.renderJobs.id, renderJobId))
      .returning();
    if (!updated) {
      throw new DomainNotFoundError('Render job not found');
    }
    return mapRenderJob(updated);
  }

  async persistRenderOutcome(
    renderJobId: string,
    artifacts: PersistRenderArtifactInput[],
    qualityReport: PersistQualityReportInput,
  ): Promise<RenderJobDetail> {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction
        .select()
        .from(schema.renderJobs)
        .where(eq(schema.renderJobs.id, renderJobId))
        .limit(1);
      if (!job) {
        throw new DomainNotFoundError('Render job not found');
      }
      if (job.status !== 'validating') {
        throw new DomainConflictError(`Render outcome cannot be persisted from ${job.status}`);
      }

      const artifactRows: Array<typeof schema.renderArtifacts.$inferSelect> = [];
      for (const artifact of artifacts) {
        const [row] = await transaction
          .insert(schema.renderArtifacts)
          .values({
            id: randomUUID(),
            renderJobId,
            ...artifact,
          })
          .onConflictDoUpdate({
            target: [schema.renderArtifacts.renderJobId, schema.renderArtifacts.kind],
            set: {
              storageBucket: artifact.storageBucket,
              storageKey: artifact.storageKey,
              contentType: artifact.contentType,
              byteSize: artifact.byteSize,
              checksumSha256: artifact.checksumSha256,
              createdAt: new Date(),
            },
          })
          .returning();
        if (!row) {
          throw new Error('Render artifact upsert did not return a row');
        }
        artifactRows.push(row);
      }

      const [reportRow] = await transaction
        .insert(schema.qualityReports)
        .values({
          id: randomUUID(),
          renderJobId,
          ...qualityReport,
        })
        .onConflictDoUpdate({
          target: schema.qualityReports.renderJobId,
          set: {
            status: qualityReport.status,
            scoreBasisPoints: qualityReport.scoreBasisPoints,
            details: qualityReport.details,
            createdAt: new Date(),
          },
        })
        .returning();
      if (!reportRow) {
        throw new Error('Quality report upsert did not return a row');
      }

      const succeeded = qualityReport.status !== 'failed';
      assertRenderJobTransition(job.status, succeeded ? 'succeeded' : 'failed');
      const now = new Date();
      const [updatedJob] = await transaction
        .update(schema.renderJobs)
        .set({
          status: succeeded ? 'succeeded' : 'failed',
          progressBasisPoints: 10_000,
          errorCode: succeeded ? null : 'QUALITY_CHECK_FAILED',
          errorMessage: succeeded ? null : 'One or more mandatory quality checks failed',
          finishedAt: now,
          logs: appendRenderLog(
            job.logs,
            renderLog(
              'validating',
              succeeded ? 'Quality checks passed' : 'Quality checks failed',
              succeeded ? 'info' : 'error',
              {
                qualityStatus: qualityReport.status,
                scoreBasisPoints: qualityReport.scoreBasisPoints,
              },
            ),
          ),
          updatedAt: now,
        })
        .where(eq(schema.renderJobs.id, renderJobId))
        .returning();
      if (!updatedJob) {
        throw new DomainNotFoundError('Render job not found');
      }
      await transaction
        .update(schema.videoProjects)
        .set({ status: succeeded ? 'completed' : 'draft', updatedAt: now })
        .where(eq(schema.videoProjects.id, job.videoProjectId));

      return {
        job: mapRenderJob(updatedJob),
        artifacts: artifactRows.map(mapRenderArtifact),
        qualityReport: mapQualityReport(reportRow),
      };
    });
  }

  async failRenderJob(renderJobId: string, errorCode: string, errorMessage: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, renderJobId))
      .limit(1);
    if (!job || ['succeeded', 'failed', 'cancelled'].includes(job.status)) {
      return;
    }
    assertRenderJobTransition(job.status, 'failed');
    const now = new Date();
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(schema.renderJobs)
        .set({
          status: 'failed',
          errorCode,
          errorMessage,
          finishedAt: now,
          logs: appendRenderLog(
            job.logs,
            renderLog(renderStageForStatus(job.status), 'Render attempt failed', 'error', {
              errorCode,
              errorMessage,
            }),
          ),
          updatedAt: now,
        })
        .where(eq(schema.renderJobs.id, renderJobId));
      await transaction
        .update(schema.videoProjects)
        .set({ status: 'draft', updatedAt: now })
        .where(eq(schema.videoProjects.id, job.videoProjectId));
    });
  }

  async acknowledgeRenderCancellation(renderJobId: string, message: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, renderJobId))
      .limit(1);
    if (!job || job.status === 'cancelled') {
      return;
    }
    if (!['preprocessing', 'rendering'].includes(job.status)) {
      throw new DomainConflictError(
        `Render cancellation cannot be acknowledged from ${job.status}`,
      );
    }
    assertRenderJobTransition(job.status, 'cancelled');
    const now = new Date();
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(schema.renderJobs)
        .set({
          status: 'cancelled',
          errorCode: null,
          errorMessage: null,
          finishedAt: now,
          logs: appendRenderLog(
            job.logs,
            renderLog(renderStageForStatus(job.status), message, 'warning'),
          ),
          updatedAt: now,
        })
        .where(eq(schema.renderJobs.id, renderJobId));
      await transaction
        .update(schema.videoProjects)
        .set({ status: 'draft', updatedAt: now })
        .where(eq(schema.videoProjects.id, job.videoProjectId));
    });
  }

  async listAssets(actorUserId: string, hotelId: string): Promise<Asset[]> {
    await this.requireHotelMember(actorUserId, hotelId);
    const rows = await this.db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.hotelId, hotelId))
      .orderBy(desc(schema.assets.createdAt));

    return rows.map(mapAsset);
  }

  async registerAssetUpload(
    actorUserId: string,
    hotelId: string,
    input: RegisterAssetUploadInput,
  ): Promise<RegisteredAssetUpload> {
    await this.requireHotelMember(actorUserId, hotelId);

    return this.db.transaction(async (transaction) => {
      const [assetRow] = await transaction
        .insert(schema.assets)
        .values({
          id: input.assetId,
          hotelId,
          kind: input.kind,
          status: 'registered',
          originalFilename: input.originalFilename,
          contentType: input.contentType,
          byteSize: input.byteSize,
          storageBucket: input.storageBucket,
          storageKey: input.storageKey,
          checksumSha256: input.checksumSha256.toLowerCase(),
          metadata: {},
        })
        .returning();
      const [uploadRow] = await transaction
        .insert(schema.assetUploads)
        .values({
          id: randomUUID(),
          assetId: input.assetId,
          providerUploadId: input.providerUploadId,
          partSize: input.partSize,
          partCount: input.partCount,
          status: 'initiated',
          expiresAt: new Date(input.expiresAt),
        })
        .returning();

      if (!assetRow || !uploadRow) {
        throw new Error('Asset upload registration did not return rows');
      }
      return {
        asset: mapAsset(assetRow),
        upload: mapAssetUpload(uploadRow),
      };
    });
  }

  async getAssetUpload(
    actorUserId: string,
    assetId: string,
    providerUploadId: string,
  ): Promise<AssetUploadContext> {
    const asset = await this.requireAssetMember(actorUserId, assetId);
    const [upload] = await this.db
      .select()
      .from(schema.assetUploads)
      .where(
        and(
          eq(schema.assetUploads.assetId, assetId),
          eq(schema.assetUploads.providerUploadId, providerUploadId),
        ),
      )
      .limit(1);

    if (!upload) {
      throw new DomainNotFoundError('Asset upload not found');
    }
    return {
      asset: mapAsset(asset),
      upload: mapAssetUpload(upload),
      expectedPartCount: upload.partCount,
    };
  }

  async completeAssetUpload(
    actorUserId: string,
    assetId: string,
    input: CompleteAssetUploadInput,
  ): Promise<QueuedAssetAnalysis> {
    await this.requireAssetMember(actorUserId, assetId);

    return this.db.transaction(async (transaction) => {
      const now = new Date();
      const [upload] = await transaction
        .update(schema.assetUploads)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.assetUploads.assetId, assetId),
            eq(schema.assetUploads.providerUploadId, input.uploadId),
            eq(schema.assetUploads.status, 'initiated'),
          ),
        )
        .returning();

      if (!upload) {
        throw new DomainConflictError('Asset upload is not in an initiable completion state');
      }

      const [asset] = await transaction
        .update(schema.assets)
        .set({ status: 'uploaded', updatedAt: now })
        .where(eq(schema.assets.id, assetId))
        .returning();
      const [analysisJob] = await transaction
        .insert(schema.analysisJobs)
        .values({
          id: randomUUID(),
          assetId,
          status: 'queued',
          maxAttempts: 3,
          logs: [
            {
              at: now.toISOString(),
              level: 'info',
              message: 'Analysis queued after multipart upload completion',
            },
          ],
        })
        .returning();

      if (!asset || !analysisJob) {
        throw new Error('Asset completion did not return rows');
      }
      return {
        asset: mapAsset(asset),
        analysisJob: mapAnalysisJob(analysisJob),
      };
    });
  }

  async getAssetDetail(actorUserId: string, assetId: string): Promise<AssetDetail> {
    const asset = mapAsset(await this.requireAssetMember(actorUserId, assetId));
    const [derivatives, segments, jobs] = await Promise.all([
      this.db
        .select()
        .from(schema.assetDerivatives)
        .where(eq(schema.assetDerivatives.assetId, assetId))
        .orderBy(asc(schema.assetDerivatives.kind)),
      this.db
        .select()
        .from(schema.assetSegments)
        .where(eq(schema.assetSegments.assetId, assetId))
        .orderBy(asc(schema.assetSegments.startMs)),
      this.db
        .select()
        .from(schema.analysisJobs)
        .where(eq(schema.analysisJobs.assetId, assetId))
        .orderBy(desc(schema.analysisJobs.createdAt)),
    ]);

    return {
      ...asset,
      derivatives: derivatives.map(mapAssetDerivative),
      segments: segments.map(mapAssetSegment),
      analysisJobs: jobs.map(mapAnalysisJob),
    };
  }

  async retryAssetAnalysis(actorUserId: string, assetId: string): Promise<QueuedAssetAnalysis> {
    const currentAsset = await this.requireAssetMember(actorUserId, assetId);
    if (currentAsset.status === 'uploaded') {
      const [queuedJob] = await this.db
        .select()
        .from(schema.analysisJobs)
        .where(
          and(eq(schema.analysisJobs.assetId, assetId), eq(schema.analysisJobs.status, 'queued')),
        )
        .orderBy(desc(schema.analysisJobs.createdAt))
        .limit(1);
      if (queuedJob) {
        return {
          asset: mapAsset(currentAsset),
          analysisJob: mapAnalysisJob(queuedJob),
        };
      }
    }
    if (currentAsset.status !== 'failed' && currentAsset.status !== 'ready') {
      throw new DomainConflictError('Only failed or ready asset analysis can be retried');
    }

    return this.db.transaction(async (transaction) => {
      const now = new Date();
      const [asset] = await transaction
        .update(schema.assets)
        .set({ status: 'uploaded', updatedAt: now })
        .where(eq(schema.assets.id, assetId))
        .returning();
      const [analysisJob] = await transaction
        .insert(schema.analysisJobs)
        .values({
          id: randomUUID(),
          assetId,
          status: 'queued',
          maxAttempts: 3,
          logs: [
            {
              at: now.toISOString(),
              level: 'info',
              message:
                currentAsset.status === 'ready'
                  ? 'Analysis refresh manually queued'
                  : 'Analysis manually retried',
            },
          ],
        })
        .returning();

      if (!asset || !analysisJob) {
        throw new Error('Asset retry did not return rows');
      }
      return { asset: mapAsset(asset), analysisJob: mapAnalysisJob(analysisJob) };
    });
  }

  async createManualSegment(
    actorUserId: string,
    assetId: string,
    input: CreateManualSegmentInput,
  ): Promise<AssetSegment> {
    await this.requireAssetMember(actorUserId, assetId);
    const [segment] = await this.db
      .insert(schema.assetSegments)
      .values({
        id: randomUUID(),
        assetId,
        startMs: input.startMs,
        endMs: input.endMs,
        label: input.label,
        kind: 'manual',
        source: 'manual',
        scoreBasisPoints: input.scoreBasisPoints ?? null,
        createdByUserId: actorUserId,
        metadata: input.metadata,
      })
      .returning();

    if (!segment) {
      throw new Error('Manual segment insert did not return a row');
    }
    return mapAssetSegment(segment);
  }

  async getAssetDerivative(
    actorUserId: string,
    assetId: string,
    kind: AssetDerivativeKind,
  ): Promise<AssetDerivative> {
    await this.requireAssetMember(actorUserId, assetId);
    const [derivative] = await this.db
      .select()
      .from(schema.assetDerivatives)
      .where(
        and(eq(schema.assetDerivatives.assetId, assetId), eq(schema.assetDerivatives.kind, kind)),
      )
      .limit(1);

    if (!derivative) {
      throw new DomainNotFoundError('Asset derivative not found');
    }
    return mapAssetDerivative(derivative);
  }

  private async requireOrganizationAdmin(
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const [membership] = await this.db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, organizationId),
          eq(schema.memberships.userId, actorUserId),
          inArray(schema.memberships.role, ['owner', 'admin']),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new DomainNotFoundError();
    }
  }

  private async requireHotelMember(
    actorUserId: string,
    hotelId: string,
  ): Promise<typeof schema.hotels.$inferSelect> {
    const [row] = await this.db
      .select({ hotel: schema.hotels })
      .from(schema.hotels)
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(eq(schema.hotels.id, hotelId))
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError();
    }
    return row.hotel;
  }

  private async requireHotelAdmin(
    actorUserId: string,
    hotelId: string,
  ): Promise<typeof schema.hotels.$inferSelect> {
    const [row] = await this.db
      .select({ hotel: schema.hotels })
      .from(schema.hotels)
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
          inArray(schema.memberships.role, ['owner', 'admin']),
        ),
      )
      .where(eq(schema.hotels.id, hotelId))
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError();
    }
    return row.hotel;
  }

  private async requireAssetMember(
    actorUserId: string,
    assetId: string,
  ): Promise<typeof schema.assets.$inferSelect> {
    const [row] = await this.db
      .select({ asset: schema.assets })
      .from(schema.assets)
      .innerJoin(schema.hotels, eq(schema.hotels.id, schema.assets.hotelId))
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(eq(schema.assets.id, assetId))
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError('Asset not found');
    }
    return row.asset;
  }

  private async requireCreativeProjectMember(
    actorUserId: string,
    projectId: string,
  ): Promise<typeof schema.creativeProjects.$inferSelect> {
    const [row] = await this.db
      .select({ project: schema.creativeProjects })
      .from(schema.creativeProjects)
      .innerJoin(schema.hotels, eq(schema.hotels.id, schema.creativeProjects.hotelId))
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(
        and(eq(schema.creativeProjects.id, projectId), isNull(schema.creativeProjects.deletedAt)),
      )
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError('Creative project not found');
    }
    return row.project;
  }

  private async loadScriptPackage(
    row: typeof schema.scriptPackages.$inferSelect,
  ): Promise<ScriptPackage> {
    const [scenes, shotList] = await Promise.all([
      this.db
        .select()
        .from(schema.scriptScenes)
        .where(eq(schema.scriptScenes.scriptPackageId, row.id))
        .orderBy(asc(schema.scriptScenes.sequence)),
      this.db
        .select()
        .from(schema.shotRequirements)
        .where(eq(schema.shotRequirements.scriptPackageId, row.id))
        .orderBy(asc(schema.shotRequirements.sequence)),
    ]);
    return scriptPackageSchema.parse({
      ...row,
      voiceoverScript: row.voiceoverScript ?? null,
      callToAction: row.callToAction ?? null,
      modelName: row.modelName ?? null,
      promptVersion: row.promptVersion ?? null,
      inputSummary: row.inputSummary ?? null,
      createdAt: toIso(row.createdAt),
      scenes: scenes.map(mapScriptScene),
      shotList: shotList.map(mapShotRequirement),
    });
  }

  private async requireVideoProjectMember(
    actorUserId: string,
    projectId: string,
  ): Promise<typeof schema.videoProjects.$inferSelect> {
    const [row] = await this.db
      .select({ project: schema.videoProjects })
      .from(schema.videoProjects)
      .innerJoin(schema.hotels, eq(schema.hotels.id, schema.videoProjects.hotelId))
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(eq(schema.videoProjects.id, projectId))
      .limit(1);

    if (!row) {
      throw new DomainNotFoundError('Video project not found');
    }
    return row.project;
  }

  private async requireRenderJobMember(
    actorUserId: string,
    renderJobId: string,
  ): Promise<typeof schema.renderJobs.$inferSelect> {
    const [row] = await this.db
      .select({ job: schema.renderJobs })
      .from(schema.renderJobs)
      .innerJoin(
        schema.videoProjects,
        eq(schema.videoProjects.id, schema.renderJobs.videoProjectId),
      )
      .innerJoin(schema.hotels, eq(schema.hotels.id, schema.videoProjects.hotelId))
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(eq(schema.renderJobs.id, renderJobId))
      .limit(1);
    if (!row) {
      throw new DomainNotFoundError('Render job not found');
    }
    return row.job;
  }

  private async requireRenderArtifactMember(
    actorUserId: string,
    artifactId: string,
  ): Promise<typeof schema.renderArtifacts.$inferSelect> {
    const [row] = await this.db
      .select({ artifact: schema.renderArtifacts })
      .from(schema.renderArtifacts)
      .innerJoin(schema.renderJobs, eq(schema.renderJobs.id, schema.renderArtifacts.renderJobId))
      .innerJoin(
        schema.videoProjects,
        eq(schema.videoProjects.id, schema.renderJobs.videoProjectId),
      )
      .innerJoin(schema.hotels, eq(schema.hotels.id, schema.videoProjects.hotelId))
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.hotels.organizationId),
          eq(schema.memberships.userId, actorUserId),
        ),
      )
      .where(eq(schema.renderArtifacts.id, artifactId))
      .limit(1);
    if (!row) {
      throw new DomainNotFoundError('Render artifact not found');
    }
    return row.artifact;
  }
}
