import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { parseHotelVideoProject, stableStringify } from '@hotelcut/timeline';

import {
  RenderCancelledError,
  type RendererAdapter,
  type RendererOutput,
  type RendererRequest,
} from './contracts.js';
import { FfmpegPostProcessor } from './ffmpeg.js';
import { createRenderManifest } from './manifest.js';
import { createSrt } from './srt.js';

export interface RemotionRendererOptions {
  browserExecutable?: string;
  concurrency?: number | string;
  crf?: number;
  ffmpegPostProcessor?: FfmpegPostProcessor;
}

async function report(
  request: RendererRequest,
  phase: 'preprocessing' | 'rendering' | 'postprocessing',
  basisPoints: number,
  message: string,
): Promise<void> {
  await request.onProgress?.({ phase, basisPoints, message });
}

export class RemotionRenderer implements RendererAdapter {
  readonly name = 'remotion';
  private serveUrlPromise: Promise<string> | null = null;
  private readonly postProcessor: FfmpegPostProcessor;

  constructor(private readonly options: RemotionRendererOptions = {}) {
    this.postProcessor = options.ffmpegPostProcessor ?? new FfmpegPostProcessor();
  }

  private bundle(): Promise<string> {
    this.serveUrlPromise ??= bundle({
      entryPoint: fileURLToPath(new URL('./remotion/entry.js', import.meta.url)),
    });
    return this.serveUrlPromise;
  }

  async render(request: RendererRequest): Promise<RendererOutput> {
    const project = parseHotelVideoProject(request.project);
    await mkdir(request.outputDirectory, { recursive: true });
    const rawVideoPath = `${request.outputDirectory}/remotion.mp4`;
    const videoPath = `${request.outputDirectory}/video.mp4`;
    const captionsPath = `${request.outputDirectory}/captions.srt`;
    const thumbnailPath = `${request.outputDirectory}/cover.jpg`;
    const manifestPath = `${request.outputDirectory}/manifest.json`;
    const projectPath = `${request.outputDirectory}/project.json`;
    const manifest = createRenderManifest({
      jobId: request.jobId,
      projectRevision: request.projectRevision,
      project,
      assets: request.assets,
    });

    await report(request, 'preprocessing', 300, 'Validating project and preparing artifacts');
    await Promise.all([
      writeFile(captionsPath, createSrt(project), 'utf8'),
      writeFile(manifestPath, `${stableStringify(manifest)}\n`, 'utf8'),
      writeFile(projectPath, `${stableStringify(project)}\n`, 'utf8'),
    ]);

    const serveUrl = await this.bundle();
    await report(request, 'preprocessing', 900, 'Remotion bundle is ready');
    const inputProps = { project, assets: [...request.assets] };
    const composition = await selectComposition({
      serveUrl,
      id: 'HotelCutProject',
      inputProps,
      ...(this.options.browserExecutable
        ? { browserExecutable: this.options.browserExecutable }
        : {}),
    });
    const cancellation = makeCancelSignal();
    const cancel = () => cancellation.cancel();
    request.signal?.addEventListener('abort', cancel, { once: true });
    let progressQueue = Promise.resolve();
    let progressFailure: unknown = null;

    try {
      if (request.signal?.aborted) {
        throw new RenderCancelledError();
      }
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation: rawVideoPath,
        inputProps,
        ...(this.options.browserExecutable
          ? { browserExecutable: this.options.browserExecutable }
          : {}),
        concurrency: this.options.concurrency ?? '25%',
        crf: this.options.crf ?? 20,
        enforceAudioTrack: true,
        imageFormat: 'jpeg',
        overwrite: true,
        x264Preset: 'veryfast',
        cancelSignal: cancellation.cancelSignal,
        onProgress: ({ progress }) => {
          progressQueue = progressQueue
            .then(() =>
              report(
                request,
                'rendering',
                1_000 + Math.round(progress * 7_000),
                `Rendering frames ${Math.round(progress * 100)}%`,
              ),
            )
            .catch((error: unknown) => {
              progressFailure ??= error;
              cancel();
            });
        },
      });
      await progressQueue;
      if (progressFailure) {
        throw progressFailure instanceof Error
          ? progressFailure
          : new Error(
              typeof progressFailure === 'string'
                ? progressFailure
                : 'Render progress callback failed',
            );
      }
      await report(request, 'postprocessing', 8_200, 'Normalizing MP4 with FFmpeg');
      await this.postProcessor.normalize(rawVideoPath, videoPath, project, request.signal);
      const expectedDuration = project.output.durationFrames / project.output.frameRate;
      await report(request, 'postprocessing', 8_800, 'Extracting cover frame and probing output');
      await this.postProcessor.extractCover(
        videoPath,
        thumbnailPath,
        expectedDuration,
        request.signal,
      );
      const probe = await this.postProcessor.probe(videoPath, request.signal);
      const durationSeconds = probe.durationSeconds ?? expectedDuration;
      const [blackSegments, silentSegments] = await Promise.all([
        this.postProcessor.detectBlackFrames(videoPath, durationSeconds, request.signal),
        this.postProcessor.detectSilence(videoPath, durationSeconds, request.signal),
      ]);
      await report(
        request,
        'postprocessing',
        9_200,
        'Render artifacts are ready for quality checks',
      );
      return {
        videoPath,
        captionsPath,
        thumbnailPath,
        manifestPath,
        projectPath,
        manifest,
        probe,
        blackSegments,
        silentSegments,
      };
    } catch (error) {
      if (request.signal?.aborted) {
        throw new RenderCancelledError();
      }
      throw error;
    } finally {
      request.signal?.removeEventListener('abort', cancel);
      await rm(rawVideoPath, { force: true });
    }
  }
}
