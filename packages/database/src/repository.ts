import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  DomainConflictError,
  DomainNotFoundError,
  type HotelCutRepository,
} from '@hotelcut/domain';
import type {
  BrandKit,
  CreateHotelInput,
  CreateVideoBriefInput,
  Hotel,
  Organization,
  UpdateHotelInput,
  UpsertBrandKitInput,
  VideoBrief,
} from '@hotelcut/schemas';
import { videoBriefSchema } from '@hotelcut/schemas';

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
}
