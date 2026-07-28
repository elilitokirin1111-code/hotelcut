import { spawn } from 'node:child_process';

import type { HotelVideoProjectV1 } from '@hotelcut/timeline';

import { RenderCancelledError, type DetectionRange, type RenderedMediaProbe } from './contracts.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(executable: string, args: readonly string[], signal?: AbortSignal): Promise<CommandResult>;
}

export class SubprocessCommandRunner implements CommandRunner {
  async run(
    executable: string,
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    if (signal?.aborted) {
      throw new RenderCancelledError();
    }
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(executable, [...args], {
        shell: false,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const abort = () => {
        child.kill('SIGTERM');
      };
      signal?.addEventListener('abort', abort, { once: true });
      child.once('error', reject);
      child.once('close', (code) => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) {
          reject(new RenderCancelledError());
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              `${executable} exited with code ${code ?? 'unknown'}: ${stderr.slice(-2_000)}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }
}

function parseFraction(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? '1');
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

export function parseProbeJson(value: string): RenderedMediaProbe {
  const parsed = JSON.parse(value) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
    }>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  return {
    readable: Boolean(video),
    width: video?.width ?? null,
    height: video?.height ?? null,
    frameRate: parseFraction(video?.avg_frame_rate) ?? parseFraction(video?.r_frame_rate),
    durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
    hasAudio: Boolean(audio),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
  };
}

function parseDetectionRanges(
  text: string,
  startPattern: RegExp,
  endPattern: RegExp,
  durationSeconds: number,
): DetectionRange[] {
  const starts = [...text.matchAll(startPattern)].map((match) => Number(match[1]));
  const ends = [...text.matchAll(endPattern)].map((match) => Number(match[1]));
  return starts
    .map((startSeconds, index) => ({
      startSeconds,
      endSeconds: ends[index] ?? durationSeconds,
    }))
    .filter(
      (range) =>
        Number.isFinite(range.startSeconds) &&
        Number.isFinite(range.endSeconds) &&
        range.endSeconds >= range.startSeconds,
    );
}

export class FfmpegPostProcessor {
  constructor(
    private readonly runner: CommandRunner = new SubprocessCommandRunner(),
    private readonly ffmpegExecutable = 'ffmpeg',
    private readonly ffprobeExecutable = 'ffprobe',
  ) {}

  async normalize(
    inputPath: string,
    outputPath: string,
    project: HotelVideoProjectV1,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runner.run(
      this.ffmpegExecutable,
      [
        '-y',
        '-i',
        inputPath,
        '-vf',
        `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=${project.output.frameRate}`,
        '-af',
        'loudnorm=I=-16:LRA=11:TP=-1.5',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-ar',
        String(project.output.audioSampleRate),
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      signal,
    );
  }

  async extractCover(
    videoPath: string,
    outputPath: string,
    durationSeconds: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runner.run(
      this.ffmpegExecutable,
      [
        '-y',
        '-ss',
        Math.max(0, Math.min(durationSeconds / 2, durationSeconds - 0.1)).toFixed(3),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outputPath,
      ],
      signal,
    );
  }

  async probe(videoPath: string, signal?: AbortSignal): Promise<RenderedMediaProbe> {
    const result = await this.runner.run(
      this.ffprobeExecutable,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath],
      signal,
    );
    return parseProbeJson(result.stdout);
  }

  async detectBlackFrames(
    videoPath: string,
    durationSeconds: number,
    signal?: AbortSignal,
  ): Promise<DetectionRange[]> {
    const result = await this.runner.run(
      this.ffmpegExecutable,
      [
        '-hide_banner',
        '-i',
        videoPath,
        '-vf',
        'blackdetect=d=0.5:pix_th=0.10',
        '-an',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    return parseDetectionRanges(
      result.stderr,
      /black_start:([0-9.]+)/gu,
      /black_end:([0-9.]+)/gu,
      durationSeconds,
    );
  }

  async detectSilence(
    videoPath: string,
    durationSeconds: number,
    signal?: AbortSignal,
  ): Promise<DetectionRange[]> {
    const result = await this.runner.run(
      this.ffmpegExecutable,
      [
        '-hide_banner',
        '-i',
        videoPath,
        '-af',
        'silencedetect=noise=-45dB:d=1',
        '-vn',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    return parseDetectionRanges(
      result.stderr,
      /silence_start: ([0-9.]+)/gu,
      /silence_end: ([0-9.]+)/gu,
      durationSeconds,
    );
  }
}
