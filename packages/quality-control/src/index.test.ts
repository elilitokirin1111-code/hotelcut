import { readFile } from 'node:fs/promises';

import { parseHotelVideoProject, type HotelVideoProjectV1 } from '@hotelcut/timeline';
import { beforeAll, describe, expect, it } from 'vitest';

import { runQualityControl } from './index.js';

let project: HotelVideoProjectV1;

beforeAll(async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL('../../templates/fixtures/golden/host-broll.json', import.meta.url),
      'utf8',
    ),
  ) as { project: unknown };
  project = parseHotelVideoProject(fixture.project);
});

describe('M6 quality control', () => {
  it('passes all required checks for a conforming vertical render', () => {
    const report = runQualityControl({
      project,
      outputExists: true,
      probe: {
        readable: true,
        width: 1080,
        height: 1920,
        frameRate: 30,
        durationSeconds: 30,
        hasAudio: true,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
      missingAssetIds: [],
      blackSegments: [],
      silentSegments: [],
    });

    expect(report.status).toBe('passed');
    expect(report.scoreBasisPoints).toBe(10_000);
    expect(report.checks).toHaveLength(11);
  });

  it('fails instead of reporting success when media or output properties are invalid', () => {
    const report = runQualityControl({
      project,
      outputExists: true,
      probe: {
        readable: true,
        width: 720,
        height: 1280,
        frameRate: 25,
        durationSeconds: 22,
        hasAudio: false,
        videoCodec: 'h264',
        audioCodec: null,
      },
      missingAssetIds: ['10000000-0000-4000-8000-000000000001'],
      blackSegments: [{ startSeconds: 3, endSeconds: 10 }],
      silentSegments: [{ startSeconds: 0, endSeconds: 30 }],
    });

    expect(report.status).toBe('failed');
    expect(report.scoreBasisPoints).toBeLessThan(10_000);
    expect(
      report.checks
        .filter((checkResult) => checkResult.status === 'failed')
        .map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        'vertical_resolution',
        'frame_rate',
        'duration',
        'audio_track',
        'asset_completeness',
        'black_frames',
        'abnormal_silence',
      ]),
    );
  });
});
