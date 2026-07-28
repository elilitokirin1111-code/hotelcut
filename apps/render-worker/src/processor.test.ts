import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Job } from 'bullmq';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { HotelCutRepository, RenderJobContext } from '@hotelcut/domain';
import type { RenderJobData } from '@hotelcut/job-queue';
import {
  RenderCancelledError,
  type RendererAdapter,
  type RendererOutput,
} from '@hotelcut/renderer';
import type { MultipartObjectStorage } from '@hotelcut/storage';
import { parseHotelVideoProject, type HotelVideoProjectV1 } from '@hotelcut/timeline';

import { createRenderProcessor } from './processor.js';

const renderJobId = '81000000-0000-4000-8000-000000000001';
const projectRevisionId = '71000000-0000-4000-8000-000000000001';
const videoProjectId = '70000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const temporaryDirectories: string[] = [];
let project: HotelVideoProjectV1;

beforeAll(async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL('../../../packages/templates/fixtures/golden/host-broll.json', import.meta.url),
      'utf8',
    ),
  ) as { project: unknown };
  project = parseHotelVideoProject(fixture.project);
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function context(): RenderJobContext {
  const now = new Date().toISOString();
  return {
    job: {
      id: renderJobId,
      videoProjectId,
      projectRevisionId,
      requestedByUserId: userId,
      status: 'preprocessing',
      attempt: 1,
      maxAttempts: 3,
      progressBasisPoints: 100,
      inputHash: '0'.repeat(64),
      logs: [],
      cancelRequestedAt: null,
      errorCode: null,
      errorMessage: null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    projectRevision: {
      id: projectRevisionId,
      videoProjectId,
      revision: 1,
      schemaVersion: '1.0',
      projectDocument: project,
      createdByUserId: userId,
      createdAt: now,
    },
    assets: [],
  };
}

function repository(overrides: Partial<HotelCutRepository> = {}): HotelCutRepository {
  return {
    startRenderJob: vi.fn().mockResolvedValue(context()),
    isRenderCancellationRequested: vi.fn().mockResolvedValue(false),
    updateRenderJobProgress: vi.fn().mockResolvedValue(context().job),
    persistRenderOutcome: vi.fn().mockResolvedValue({}),
    failRenderJob: vi.fn().mockResolvedValue(undefined),
    acknowledgeRenderCancellation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as HotelCutRepository;
}

function storage(): MultipartObjectStorage {
  return {
    presignDownload: vi.fn().mockResolvedValue('https://assets.example.test/media.mp4'),
    putObject: vi.fn().mockResolvedValue(undefined),
  } as unknown as MultipartObjectStorage;
}

function queueJob(): Job<RenderJobData> {
  return {
    data: {
      attempt: 1,
      pipelineVersion: 'm6-v1',
      renderJobId,
    },
    name: 'render-video',
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<RenderJobData>;
}

function successfulRenderer(missingAssetIds: string[] = []): RendererAdapter {
  return {
    name: 'test-renderer',
    async render(request): Promise<RendererOutput> {
      const paths = {
        videoPath: join(request.outputDirectory, 'video.mp4'),
        captionsPath: join(request.outputDirectory, 'captions.srt'),
        thumbnailPath: join(request.outputDirectory, 'cover.jpg'),
        manifestPath: join(request.outputDirectory, 'manifest.json'),
        projectPath: join(request.outputDirectory, 'project.json'),
      };
      await Promise.all(Object.values(paths).map((path) => writeFile(path, 'fixture')));
      await request.onProgress?.({
        phase: 'rendering',
        basisPoints: 8_000,
        message: 'Fixture rendered',
      });
      return {
        ...paths,
        manifest: {
          version: 'm6-v1',
          jobId: request.jobId,
          projectId: request.project.id,
          projectRevision: request.projectRevision,
          templateId: request.project.template.id,
          output: request.project.output,
          assets: [],
          missingAssetIds,
        },
        probe: {
          readable: true,
          width: 1080,
          height: 1920,
          frameRate: request.project.output.frameRate,
          durationSeconds: request.project.output.durationFrames / request.project.output.frameRate,
          hasAudio: true,
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        blackSegments: [],
        silentSegments: [],
      };
    },
  };
}

async function tempRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'hotelcut-render-worker-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('M6 render processor', () => {
  it('uploads all artifacts and persists a passing quality report', async () => {
    const fakeRepository = repository();
    const fakeStorage = storage();
    const putObjectSpy = vi.spyOn(fakeStorage, 'putObject');
    const persistOutcomeSpy = vi.spyOn(fakeRepository, 'persistRenderOutcome');
    const processRender = createRenderProcessor({
      assetUrlTtlSeconds: 900,
      bucket: 'hotelcut-test',
      objectStorage: fakeStorage,
      renderer: successfulRenderer(),
      repository: fakeRepository,
      tempRoot: await tempRoot(),
    });

    const result = await processRender(queueJob());

    expect(result).toMatchObject({ status: 'succeeded', qualityScoreBasisPoints: 10_000 });
    expect(putObjectSpy).toHaveBeenCalledTimes(6);
    expect(persistOutcomeSpy).toHaveBeenCalledWith(
      renderJobId,
      expect.arrayContaining([
        expect.objectContaining({ kind: 'video' }),
        expect.objectContaining({ kind: 'captions' }),
        expect.objectContaining({ kind: 'thumbnail' }),
        expect.objectContaining({ kind: 'manifest' }),
        expect.objectContaining({ kind: 'project' }),
        expect.objectContaining({ kind: 'report' }),
      ]),
      expect.objectContaining({ status: 'passed', scoreBasisPoints: 10_000 }),
    );
  });

  it('persists failed quality results and rejects the BullMQ job', async () => {
    const fakeRepository = repository();
    const persistOutcomeSpy = vi.spyOn(fakeRepository, 'persistRenderOutcome');
    const failJobSpy = vi.spyOn(fakeRepository, 'failRenderJob');
    const processRender = createRenderProcessor({
      assetUrlTtlSeconds: 900,
      bucket: 'hotelcut-test',
      objectStorage: storage(),
      renderer: successfulRenderer(['missing-asset']),
      repository: fakeRepository,
      tempRoot: await tempRoot(),
    });

    await expect(processRender(queueJob())).rejects.toThrow('Mandatory quality checks failed');
    expect(persistOutcomeSpy).toHaveBeenCalledWith(
      renderJobId,
      expect.any(Array),
      expect.objectContaining({ status: 'failed' }),
    );
    expect(failJobSpy).not.toHaveBeenCalled();
  });

  it('acknowledges cancellation without recording a render failure', async () => {
    const fakeRepository = repository({
      isRenderCancellationRequested: vi.fn().mockResolvedValue(true),
    });
    const acknowledgeCancellationSpy = vi.spyOn(fakeRepository, 'acknowledgeRenderCancellation');
    const failJobSpy = vi.spyOn(fakeRepository, 'failRenderJob');
    const renderer: RendererAdapter = {
      name: 'cancelled-renderer',
      render: vi.fn().mockRejectedValue(new RenderCancelledError()),
    };
    const processRender = createRenderProcessor({
      assetUrlTtlSeconds: 900,
      bucket: 'hotelcut-test',
      objectStorage: storage(),
      renderer,
      repository: fakeRepository,
      tempRoot: await tempRoot(),
    });

    await expect(processRender(queueJob())).resolves.toMatchObject({ status: 'cancelled' });
    expect(acknowledgeCancellationSpy).toHaveBeenCalledOnce();
    expect(failJobSpy).not.toHaveBeenCalled();
  });

  it('records traceable renderer failures while preserving the project revision', async () => {
    const fakeRepository = repository();
    const failJobSpy = vi.spyOn(fakeRepository, 'failRenderJob');
    const renderer: RendererAdapter = {
      name: 'failed-renderer',
      render: vi.fn().mockRejectedValue(new Error('FFmpeg unavailable')),
    };
    const processRender = createRenderProcessor({
      assetUrlTtlSeconds: 900,
      bucket: 'hotelcut-test',
      objectStorage: storage(),
      renderer,
      repository: fakeRepository,
      tempRoot: await tempRoot(),
    });

    await expect(processRender(queueJob())).rejects.toThrow('FFmpeg unavailable');
    expect(failJobSpy).toHaveBeenCalledWith(renderJobId, 'ERROR', 'FFmpeg unavailable');
  });
});
