import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { runQualityControl } from '../../quality-control/dist/index.js';
import { parseHotelVideoProject } from '../../timeline/dist/index.js';
import { RemotionRenderer } from '../dist/index.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const outputRoot = resolve(repositoryRoot, 'tmp/m6-acceptance');
const mediaRoot = resolve(outputRoot, '_media');
const fixtureNames = ['host-broll', 'room-montage', 'promotion'];

function run(executable, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${executable} exited with ${code}: ${stderr.slice(-4_000)}`));
    });
  });
}

async function createFixedMedia() {
  await mkdir(mediaRoot, { recursive: true });
  const videoPath = resolve(mediaRoot, 'hotel-test-source.mp4');
  const imagePath = resolve(mediaRoot, 'hotel-test-still.png');
  const audioPath = resolve(mediaRoot, 'hotel-test-music.m4a');
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=540x960:rate=30',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '48',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-y',
    videoPath,
  ]);
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x2563EB:s=540x960',
    '-frames:v',
    '1',
    '-y',
    imagePath,
  ]);
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:sample_rate=48000',
    '-t',
    '48',
    '-c:a',
    'aac',
    '-y',
    audioPath,
  ]);
  return { videoPath, imagePath, audioPath };
}

function assetSources(project, mediaBaseUrl) {
  const mediaClips = project.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => 'assetId' in clip);
  const kindsByAssetId = new Map(mediaClips.map((clip) => [clip.assetId, clip.kind]));
  return [...kindsByAssetId].map(([assetId, kind]) => {
    const fileName =
      kind === 'image'
        ? 'hotel-test-still.png'
        : kind === 'audio'
          ? 'hotel-test-music.m4a'
          : 'hotel-test-source.mp4';
    return {
      assetId,
      kind,
      url: `${mediaBaseUrl}/${fileName}`,
      contentType: kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/mp4' : 'video/mp4',
    };
  });
}

async function startMediaServer() {
  const media = new Map([
    [
      '/hotel-test-source.mp4',
      { path: resolve(mediaRoot, 'hotel-test-source.mp4'), contentType: 'video/mp4' },
    ],
    [
      '/hotel-test-still.png',
      { path: resolve(mediaRoot, 'hotel-test-still.png'), contentType: 'image/png' },
    ],
    [
      '/hotel-test-music.m4a',
      { path: resolve(mediaRoot, 'hotel-test-music.m4a'), contentType: 'audio/mp4' },
    ],
  ]);
  const server = createServer(async (request, response) => {
    try {
      const entry = media.get(new URL(request.url || '/', 'http://localhost').pathname);
      if (!entry) {
        response.writeHead(404).end();
        return;
      }
      const fileStats = await stat(entry.path);
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/u.exec(range);
        if (!match) {
          response.writeHead(416).end();
          return;
        }
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : fileStats.size - 1;
        response.writeHead(206, {
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
          'Content-Type': entry.contentType,
        });
        createReadStream(entry.path, { start, end }).pipe(response);
        return;
      }
      response.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': fileStats.size,
        'Content-Type': entry.contentType,
      });
      createReadStream(entry.path).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Media server did not receive a TCP port');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
  };
}

async function main() {
  if (!outputRoot.startsWith(resolve(repositoryRoot, 'tmp'))) {
    throw new Error(`Refusing to clear output outside the repository tmp directory: ${outputRoot}`);
  }
  await rm(outputRoot, { recursive: true, force: true });
  await createFixedMedia();
  const mediaServer = await startMediaServer();
  const browserExecutable =
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/chromium');
  const renderer = new RemotionRenderer({ browserExecutable, concurrency: '50%', crf: 28 });
  const summary = [];

  try {
    for (const fixtureName of fixtureNames) {
      const fixture = JSON.parse(
        await readFile(
          resolve(repositoryRoot, `packages/templates/fixtures/golden/${fixtureName}.json`),
          'utf8',
        ),
      );
      const project = parseHotelVideoProject(fixture.project);
      const fixtureOutput = resolve(outputRoot, fixtureName);
      let lastDecile = -1;
      const output = await renderer.render({
        jobId: `m6-acceptance-${fixtureName}`,
        projectRevision: 1,
        project,
        assets: assetSources(project, mediaServer.baseUrl),
        outputDirectory: fixtureOutput,
        onProgress(progress) {
          const decile = Math.floor(progress.basisPoints / 1_000);
          if (decile !== lastDecile) {
            lastDecile = decile;
            process.stdout.write(`[${fixtureName}] ${progress.message}\n`);
          }
        },
      });
      const videoStats = await stat(output.videoPath);
      const quality = runQualityControl({
        project,
        outputExists: videoStats.isFile() && videoStats.size > 0,
        probe: output.probe,
        missingAssetIds: output.manifest.missingAssetIds,
        blackSegments: output.blackSegments,
        silentSegments: output.silentSegments,
      });
      await writeFile(
        resolve(fixtureOutput, 'quality-report.json'),
        `${JSON.stringify(quality, null, 2)}\n`,
        'utf8',
      );
      summary.push({
        template: fixtureName,
        qualityStatus: quality.status,
        scoreBasisPoints: quality.scoreBasisPoints,
        bytes: videoStats.size,
        probe: output.probe,
      });
      if (quality.status === 'failed') {
        const failures = quality.checks
          .filter((check) => check.status === 'failed')
          .map((check) => check.name)
          .join(', ');
        throw new Error(`${fixtureName} failed mandatory checks: ${failures}`);
      }
    }
  } finally {
    await mediaServer.close();
  }

  await writeFile(
    resolve(outputRoot, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main();
