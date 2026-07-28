import { readFile } from 'node:fs/promises';

import { parseHotelVideoProject, type HotelVideoProjectV1 } from '@hotelcut/timeline';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseProbeJson } from './ffmpeg.js';
import { createRenderManifest } from './manifest.js';
import { createSrt } from './srt.js';

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

describe('M6 renderer artifacts', () => {
  it('generates deterministic SRT captions', () => {
    const srt = createSrt(project);

    expect(srt).toContain('00:00:00,000 --> 00:00:04,500');
    expect(srt).toContain('欢迎来到云栖酒店');
    expect(srt.endsWith('\n')).toBe(true);
  });

  it('records resolved and missing media in the manifest', () => {
    const firstAssetId = '10000000-0000-4000-8000-000000000001';
    const manifest = createRenderManifest({
      jobId: 'render-job',
      projectRevision: 2,
      project,
      assets: [
        {
          assetId: firstAssetId,
          kind: 'video',
          url: 'https://assets.example.test/host.mp4',
          contentType: 'video/mp4',
        },
      ],
    });

    expect(manifest.projectRevision).toBe(2);
    expect(manifest.assets.find((asset) => asset.assetId === firstAssetId)?.resolved).toBe(true);
    expect(manifest.missingAssetIds.length).toBeGreaterThan(0);
  });

  it('normalizes ffprobe JSON into the renderer-neutral probe model', () => {
    const probe = parseProbeJson(
      JSON.stringify({
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1080,
            height: 1920,
            avg_frame_rate: '30/1',
          },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '30.000000' },
      }),
    );

    expect(probe).toEqual({
      readable: true,
      width: 1080,
      height: 1920,
      frameRate: 30,
      durationSeconds: 30,
      hasAudio: true,
      videoCodec: 'h264',
      audioCodec: 'aac',
    });
  });
});
