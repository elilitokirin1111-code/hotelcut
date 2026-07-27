import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  exportHotelVideoProjectToOtio,
  hotelVideoProjectV1JsonSchema,
  migrateHotelVideoProject,
  parseHotelVideoProject,
  serializeHotelVideoProjectToOtio,
  stableStringifyHotelVideoProject,
  TimelineValidationError,
} from './index.js';

async function readFixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('HotelVideoProject v1', () => {
  it('validates the canonical JSON fixture and exposes JSON Schema', async () => {
    const project = parseHotelVideoProject(await readFixture('hotel-video-project-v1.json'));

    expect(project.schemaVersion).toBe('1.0.0');
    expect(project.tracks).toHaveLength(4);
    expect(hotelVideoProjectV1JsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    });

    const committedSchema = await readFixture('../schema/hotel-video-project-v1.schema.json');
    expect(committedSchema).toEqual({
      ...hotelVideoProjectV1JsonSchema,
      $id: 'https://hotelcut.local/schemas/hotel-video-project-v1.schema.json',
      title: 'HotelVideoProject v1',
    });
  });

  it('reports clear paths for invalid cross-track constraints', async () => {
    const fixture = await readFixture('hotel-video-project-v1.json');
    const project = structuredClone(fixture) as {
      tracks: Array<{ clips: Array<{ startFrame: number }> }>;
    };
    const secondClip = project.tracks[0]?.clips[1];
    if (!secondClip) {
      throw new Error('Fixture must contain a second clip');
    }
    secondClip.startFrame = 300;

    try {
      parseHotelVideoProject(project);
      expect.fail('Expected invalid timeline to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(TimelineValidationError);
      expect((error as Error).message).toContain('tracks[0].clips[1].startFrame');
      expect((error as Error).message).toContain('overlaps');
    }
  });

  it('normalizes and serializes identical input byte-for-byte', async () => {
    const fixture = await readFixture('hotel-video-project-v1.json');

    expect(stableStringifyHotelVideoProject(fixture)).toBe(
      stableStringifyHotelVideoProject(structuredClone(fixture)),
    );
  });

  it('migrates the 0.9 millisecond draft to integer-frame v1', async () => {
    const migrated = migrateHotelVideoProject(await readFixture('hotel-video-project-v0.9.json'));

    expect(migrated).toMatchObject({
      schemaVersion: '1.0.0',
      output: {
        durationFrames: 300,
        frameRate: 30,
      },
      metadata: {
        migratedFrom: '0.9.0',
      },
    });
    expect(migrated.tracks[0]?.clips[0]).toMatchObject({
      durationFrames: 300,
      sourceDurationFrames: 300,
    });
  });

  it('exports a deterministic OTIO timeline with namespaced metadata', async () => {
    const fixture = await readFixture('hotel-video-project-v1.json');
    const otio = exportHotelVideoProjectToOtio(fixture);

    expect(otio).toMatchObject({
      OTIO_SCHEMA: 'Timeline.1',
      metadata: {
        hotelcut: {
          schemaVersion: '1.0.0',
        },
      },
      tracks: {
        OTIO_SCHEMA: 'Stack.1',
      },
    });
    expect(JSON.parse(serializeHotelVideoProjectToOtio(fixture))).toEqual(otio);
    expect(
      await readFile(new URL('../fixtures/basic-timeline.otio', import.meta.url), 'utf8'),
    ).toBe(`${serializeHotelVideoProjectToOtio(fixture)}\n`);
  });
});
