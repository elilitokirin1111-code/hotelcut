import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Job } from 'bullmq';

import {
  DomainConflictError,
  type HotelCutRepository,
  type PersistRenderArtifactInput,
} from '@hotelcut/domain';
import { renderJobDataSchema, type RenderJobData } from '@hotelcut/job-queue';
import { runQualityControl, type QualityControlResult } from '@hotelcut/quality-control';
import {
  RenderCancelledError,
  type RendererAdapter,
  type RendererAssetSource,
  type RendererOutput,
} from '@hotelcut/renderer';
import type { RenderArtifactKind, RenderLogEntry, RenderJobStatus } from '@hotelcut/schemas';
import type { MultipartObjectStorage } from '@hotelcut/storage';
import { parseHotelVideoProject } from '@hotelcut/timeline';

export interface RenderProcessorDependencies {
  assetUrlTtlSeconds: number;
  bucket: string;
  objectStorage: MultipartObjectStorage;
  renderer: RendererAdapter;
  repository: HotelCutRepository;
  tempRoot: string;
}

export interface RenderProcessorResult {
  renderJobId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  qualityScoreBasisPoints?: number;
}

class QualityCheckFailedError extends Error {
  constructor(readonly result: QualityControlResult) {
    super(`Mandatory quality checks failed with score ${result.scoreBasisPoints}`);
    this.name = 'QualityCheckFailedError';
  }
}

function logEntry(
  stage: RenderLogEntry['stage'],
  message: string,
  details: Record<string, unknown> = {},
): RenderLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    stage,
    message,
    details,
  };
}

function renderStatus(phase: 'preprocessing' | 'rendering' | 'postprocessing'): RenderJobStatus {
  return phase === 'preprocessing' ? 'preprocessing' : 'rendering';
}

function referencedAssetIds(project: ReturnType<typeof parseHotelVideoProject>): Set<string> {
  return new Set(
    project.tracks.flatMap((track) =>
      track.clips.flatMap((clip) => ('assetId' in clip ? [clip.assetId] : [])),
    ),
  );
}

function safeErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .toUpperCase()
    .slice(0, 100);
}

async function uploadArtifact(
  objectStorage: MultipartObjectStorage,
  bucket: string,
  jobId: string,
  attempt: number,
  kind: RenderArtifactKind,
  path: string,
  contentType: string,
): Promise<PersistRenderArtifactInput> {
  const body = await readFile(path);
  const checksumSha256 = createHash('sha256').update(body).digest('hex');
  const extension = path.split('.').pop() ?? 'bin';
  const storageKey = `renders/${jobId}/attempt-${attempt}/${kind}.${extension}`;
  await objectStorage.putObject({
    bucket,
    key: storageKey,
    contentType,
    body,
    checksumSha256,
  });
  return {
    kind,
    storageBucket: bucket,
    storageKey,
    contentType,
    byteSize: body.byteLength,
    checksumSha256,
  };
}

async function artifactDefinitions(
  output: RendererOutput,
  reportPath: string,
): Promise<
  Array<{
    kind: RenderArtifactKind;
    path: string;
    contentType: string;
  }>
> {
  const captionsStats = await stat(output.captionsPath).catch(() => null);
  const captionsArtifact:
    | {
        kind: RenderArtifactKind;
        path: string;
        contentType: string;
      }
    | undefined =
    captionsStats?.isFile() && captionsStats.size > 0
      ? {
          kind: 'captions',
          path: output.captionsPath,
          contentType: 'application/x-subrip',
        }
      : undefined;

  return [
    { kind: 'video', path: output.videoPath, contentType: 'video/mp4' },
    { kind: 'thumbnail', path: output.thumbnailPath, contentType: 'image/jpeg' },
    ...(captionsArtifact ? [captionsArtifact] : []),
    { kind: 'project', path: output.projectPath, contentType: 'application/json' },
    { kind: 'manifest', path: output.manifestPath, contentType: 'application/json' },
    { kind: 'report', path: reportPath, contentType: 'application/json' },
  ];
}

export function createRenderProcessor(dependencies: RenderProcessorDependencies) {
  return async (job: Job<RenderJobData>): Promise<RenderProcessorResult> => {
    const data = renderJobDataSchema.parse(job.data);
    let outputDirectory: string | null = null;
    let started = false;
    let cancellationTimer: NodeJS.Timeout | null = null;
    const cancellation = new AbortController();

    try {
      const context = await dependencies.repository.startRenderJob(data.renderJobId);
      started = true;
      if (context.job.attempt !== data.attempt) {
        throw new DomainConflictError(
          `Queue attempt ${data.attempt} does not match database attempt ${context.job.attempt}`,
        );
      }

      const project = parseHotelVideoProject(context.projectRevision.projectDocument);
      const expectedAssets = referencedAssetIds(project);
      const assets: RendererAssetSource[] = [];
      for (const asset of context.assets) {
        if (
          !expectedAssets.has(asset.id) ||
          asset.status !== 'ready' ||
          !['video', 'image', 'audio'].includes(asset.kind)
        ) {
          continue;
        }
        assets.push({
          assetId: asset.id,
          kind: asset.kind as RendererAssetSource['kind'],
          url: await dependencies.objectStorage.presignDownload(
            { bucket: asset.storageBucket, key: asset.storageKey },
            dependencies.assetUrlTtlSeconds,
          ),
          contentType: asset.contentType,
          byteSize: asset.byteSize,
          checksumSha256: asset.checksumSha256,
        });
      }

      outputDirectory = join(dependencies.tempRoot, data.renderJobId, `attempt-${data.attempt}`);
      await mkdir(outputDirectory, { recursive: true });

      let cancellationCheckRunning = false;
      const checkCancellation = async (): Promise<void> => {
        if (cancellationCheckRunning || cancellation.signal.aborted) {
          return;
        }
        cancellationCheckRunning = true;
        try {
          if (await dependencies.repository.isRenderCancellationRequested(data.renderJobId)) {
            cancellation.abort();
          }
        } finally {
          cancellationCheckRunning = false;
        }
      };
      cancellationTimer = setInterval(() => {
        void checkCancellation();
      }, 500);
      cancellationTimer.unref();

      let lastProgress = 100;
      let lastProgressAt = 0;
      const rendered = await dependencies.renderer.render({
        jobId: data.renderJobId,
        projectRevision: context.projectRevision.revision,
        project,
        assets,
        outputDirectory,
        signal: cancellation.signal,
        onProgress: async (progress) => {
          if (cancellation.signal.aborted) {
            throw new RenderCancelledError();
          }
          const now = Date.now();
          const basisPoints = Math.max(lastProgress, Math.min(9_200, progress.basisPoints));
          if (
            basisPoints < 9_200 &&
            basisPoints - lastProgress < 100 &&
            now - lastProgressAt < 2_000
          ) {
            return;
          }
          lastProgress = basisPoints;
          lastProgressAt = now;
          await Promise.all([
            job.updateProgress(basisPoints),
            dependencies.repository.updateRenderJobProgress(
              data.renderJobId,
              renderStatus(progress.phase),
              basisPoints,
              logEntry(progress.phase, progress.message, { renderer: dependencies.renderer.name }),
            ),
          ]);
        },
      });

      await checkCancellation();
      if (cancellation.signal.aborted) {
        throw new RenderCancelledError();
      }
      await dependencies.repository.updateRenderJobProgress(
        data.renderJobId,
        'validating',
        9_500,
        logEntry('validating', 'Running mandatory M6 quality checks'),
      );
      await job.updateProgress(9_500);

      const outputStats = await stat(rendered.videoPath).catch(() => null);
      const quality = runQualityControl({
        project,
        outputExists: Boolean(outputStats?.isFile() && outputStats.size > 0),
        probe: rendered.probe,
        missingAssetIds: rendered.manifest.missingAssetIds,
        blackSegments: rendered.blackSegments,
        silentSegments: rendered.silentSegments,
      });
      const reportPath = join(outputDirectory, 'quality-report.json');
      await writeFile(reportPath, `${JSON.stringify(quality, null, 2)}\n`, 'utf8');

      const artifactList = await artifactDefinitions(rendered, reportPath);
      const artifacts = await Promise.all(
        artifactList.map((artifact) =>
          uploadArtifact(
            dependencies.objectStorage,
            dependencies.bucket,
            data.renderJobId,
            context.job.attempt,
            artifact.kind,
            artifact.path,
            artifact.contentType,
          ),
        ),
      );
      await dependencies.repository.persistRenderOutcome(data.renderJobId, artifacts, {
        status: quality.status,
        scoreBasisPoints: quality.scoreBasisPoints,
        details: {
          checks: quality.checks,
          summary: quality.summary,
        },
      });
      await job.updateProgress(10_000);
      if (quality.status === 'failed') {
        throw new QualityCheckFailedError(quality);
      }
      return {
        renderJobId: data.renderJobId,
        status: 'succeeded',
        qualityScoreBasisPoints: quality.scoreBasisPoints,
      };
    } catch (error) {
      if (error instanceof QualityCheckFailedError) {
        throw error;
      }
      const cancelled =
        cancellation.signal.aborted ||
        error instanceof RenderCancelledError ||
        (!started &&
          (await dependencies.repository
            .isRenderCancellationRequested(data.renderJobId)
            .catch(() => false)));
      if (cancelled) {
        if (started) {
          await dependencies.repository.acknowledgeRenderCancellation(
            data.renderJobId,
            'Render worker stopped after cancellation request',
          );
        }
        return { renderJobId: data.renderJobId, status: 'cancelled' };
      }
      if (started) {
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.repository.failRenderJob(
          data.renderJobId,
          safeErrorCode(error),
          message.slice(0, 8_000),
        );
      }
      throw error;
    } finally {
      if (cancellationTimer) {
        clearInterval(cancellationTimer);
      }
      if (outputDirectory) {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    }
  };
}
