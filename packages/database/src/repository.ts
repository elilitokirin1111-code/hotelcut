import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  DomainConflictError,
  DomainNotFoundError,
  type AssetUploadContext,
  type HotelCutRepository,
  type QueuedAssetAnalysis,
  type RegisterAssetUploadInput,
  type RegisteredAssetUpload,
} from '@hotelcut/domain';
import type {
  AnalysisJob,
  Asset,
  AssetDerivative,
  AssetDerivativeKind,
  AssetDetail,
  AssetSegment,
  AssetUpload,
  BrandKit,
  CompleteAssetUploadInput,
  CreateHotelInput,
  CreateManualSegmentInput,
  CreateVideoBriefInput,
  Hotel,
  Organization,
  UpdateHotelInput,
  UpsertBrandKitInput,
  VideoBrief,
} from '@hotelcut/schemas';
import {
  analysisJobSchema,
  assetDerivativeSchema,
  assetSchema,
  assetSegmentSchema,
  assetUploadSchema,
  videoBriefSchema,
} from '@hotelcut/schemas';

import * as schema from './schema.js';

type Database = PostgresJsDatabase<typeof schema>;

function toIso(value: Date): string {
  return value.toISOString();
}

function mapOrganization(row: typeof schema.organizations.$inferSelect): Organization {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function mapHotel(row: typeof schema.hotels.$inferSelect): Hotel {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function mapBrandKit(row: typeof schema.brandKits.$inferSelect): BrandKit {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function mapVideoBrief(row: typeof schema.videoBriefs.$inferSelect): VideoBrief {
  return videoBriefSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
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

export class PostgresHotelCutRepository implements HotelCutRepository {
  constructor(private readonly db: Database) {}

  async ping(): Promise<void> {
    await this.db.execute('select 1');
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
    if (currentAsset.status !== 'failed') {
      throw new DomainConflictError('Only failed asset analysis can be retried');
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
              message: 'Analysis manually retried',
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
}
