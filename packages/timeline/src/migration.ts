import { z } from 'zod';

import { HOTEL_VIDEO_PROJECT_SCHEMA_VERSION, type HotelVideoProjectV1 } from './schema.js';
import { parseHotelVideoProject } from './validation.js';

const legacyClipSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.uuid(),
      kind: z.enum(['video', 'image', 'audio']),
      assetId: z.uuid(),
      startMs: z.number().int().nonnegative(),
      durationMs: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      id: z.uuid(),
      kind: z.enum(['text', 'caption']),
      text: z.string().min(1),
      startMs: z.number().int().nonnegative(),
      durationMs: z.number().int().positive(),
    })
    .strict(),
]);

export const hotelVideoProjectV090Schema = z
  .object({
    schemaVersion: z.literal('0.9.0'),
    id: z.uuid(),
    hotelId: z.uuid(),
    name: z.string().min(1).max(160),
    templateId: z.string().min(1),
    templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    canvas: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        frameRate: z.number().int().min(1).max(120),
        durationMs: z.number().int().positive(),
        backgroundColor: z.string(),
      })
      .strict(),
    tracks: z.array(
      z
        .object({
          id: z.uuid(),
          kind: z.enum(['video', 'audio', 'overlay', 'caption']),
          name: z.string().min(1),
          clips: z.array(legacyClipSchema),
        })
        .strict(),
    ),
    generation: z
      .object({
        compilerVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
        seed: z.number().int().min(0).max(4_294_967_295),
      })
      .strict(),
  })
  .strict();

export interface TimelineMigration {
  from: string;
  to: string;
  migrate(input: unknown): unknown;
}

export class TimelineMigrationError extends Error {
  readonly code = 'TIMELINE_MIGRATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'TimelineMigrationError';
  }
}

function millisecondsToFrames(milliseconds: number, frameRate: number): number {
  return Math.max(1, Math.round((milliseconds * frameRate) / 1_000));
}

const v090ToV100Migration: TimelineMigration = {
  from: '0.9.0',
  to: HOTEL_VIDEO_PROJECT_SCHEMA_VERSION,
  migrate(input) {
    const legacy = hotelVideoProjectV090Schema.parse(input);
    const frameRate = legacy.canvas.frameRate;

    return {
      schemaVersion: HOTEL_VIDEO_PROJECT_SCHEMA_VERSION,
      id: legacy.id,
      hotelId: legacy.hotelId,
      name: legacy.name,
      template: {
        id: legacy.templateId,
        version: legacy.templateVersion,
      },
      output: {
        width: legacy.canvas.width,
        height: legacy.canvas.height,
        frameRate,
        durationFrames: millisecondsToFrames(legacy.canvas.durationMs, frameRate),
        audioSampleRate: 48_000,
        backgroundColor: legacy.canvas.backgroundColor,
      },
      safeAreas: [],
      brandTokens: [
        {
          key: 'legacy.font',
          type: 'font',
          family: 'sans-serif',
          weight: 400,
          style: 'normal',
        },
        {
          key: 'legacy.text',
          type: 'color',
          value: '#FFFFFF',
        },
      ],
      cta: null,
      tracks: legacy.tracks.map((track, trackIndex) => ({
        id: track.id,
        kind: track.kind,
        name: track.name,
        enabled: true,
        locked: false,
        muted: false,
        zIndex: trackIndex,
        clips: track.clips.map((clip) => {
          const common = {
            id: clip.id,
            kind: clip.kind,
            startFrame: Math.round((clip.startMs * frameRate) / 1_000),
            durationFrames: millisecondsToFrames(clip.durationMs, frameRate),
            metadata: {},
          };
          if (clip.kind === 'audio') {
            return {
              ...common,
              assetId: clip.assetId,
              sourceStartFrame: 0,
              sourceDurationFrames: common.durationFrames,
              volume: 1,
              fadeInFrames: 0,
              fadeOutFrames: 0,
            };
          }
          if (clip.kind === 'video') {
            return {
              ...common,
              assetId: clip.assetId,
              sourceStartFrame: 0,
              sourceDurationFrames: common.durationFrames,
              transform: {},
              transitionIn: null,
              transitionOut: null,
              volume: 1,
              muted: false,
              playbackRate: 1,
            };
          }
          if (clip.kind === 'image') {
            return {
              ...common,
              assetId: clip.assetId,
              transform: {},
              transitionIn: null,
              transitionOut: null,
            };
          }
          if (clip.kind === 'caption') {
            return {
              ...common,
              text: clip.text,
              words: [],
              transform: {},
              transitionIn: null,
              transitionOut: null,
              style: {
                fontToken: 'legacy.font',
                colorToken: 'legacy.text',
                fontSize: 56,
              },
            };
          }
          if (clip.kind === 'text') {
            return {
              ...common,
              text: clip.text,
              transform: {},
              transitionIn: null,
              transitionOut: null,
              style: {
                fontToken: 'legacy.font',
                colorToken: 'legacy.text',
                fontSize: 56,
              },
            };
          }
          throw new TimelineMigrationError('Unsupported legacy clip kind');
        }),
        metadata: {},
      })),
      generation: legacy.generation,
      metadata: {
        migratedFrom: legacy.schemaVersion,
      },
    };
  },
};

export class TimelineMigrationRegistry {
  readonly #migrations = new Map<string, TimelineMigration>();

  constructor(migrations: readonly TimelineMigration[] = []) {
    migrations.forEach((migration) => this.register(migration));
  }

  register(migration: TimelineMigration): void {
    if (this.#migrations.has(migration.from)) {
      throw new TimelineMigrationError(`Migration from ${migration.from} is already registered`);
    }
    this.#migrations.set(migration.from, migration);
  }

  migrate(input: unknown, targetVersion = HOTEL_VIDEO_PROJECT_SCHEMA_VERSION): unknown {
    if (input === null || typeof input !== 'object') {
      throw new TimelineMigrationError('Timeline migration input must be an object');
    }

    let current: unknown = input;
    const versionValue = (input as Record<string, unknown>).schemaVersion;
    if (typeof versionValue !== 'string') {
      throw new TimelineMigrationError('Timeline migration input has no schemaVersion');
    }
    let version: string = versionValue;

    const visited = new Set<string>();
    while (version !== targetVersion) {
      if (visited.has(version)) {
        throw new TimelineMigrationError(`Migration cycle detected at version ${version}`);
      }
      visited.add(version);
      const migration = this.#migrations.get(version);
      if (!migration) {
        throw new TimelineMigrationError(`No migration path from ${version} to ${targetVersion}`);
      }
      current = migration.migrate(current);
      version = migration.to;
    }
    return current;
  }
}

export const defaultTimelineMigrationRegistry = new TimelineMigrationRegistry([
  v090ToV100Migration,
]);

export function migrateHotelVideoProject(input: unknown): HotelVideoProjectV1 {
  try {
    const migrated = defaultTimelineMigrationRegistry.migrate(input);
    return parseHotelVideoProject(migrated);
  } catch (error) {
    if (error instanceof TimelineMigrationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new TimelineMigrationError(`Could not migrate timeline: ${message}`);
  }
}
