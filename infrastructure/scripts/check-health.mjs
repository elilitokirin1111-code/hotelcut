import { connect } from 'node:net';

const attempts = Number.parseInt(process.env.HEALTHCHECK_ATTEMPTS ?? '30', 10);
const intervalMs = Number.parseInt(process.env.HEALTHCHECK_INTERVAL_MS ?? '2000', 10);

const httpChecks = [
  ['web', process.env.WEB_HEALTH_URL ?? 'http://127.0.0.1:5173/'],
  ['api', process.env.API_HEALTH_URL ?? 'http://127.0.0.1:3000/health'],
  ['render-worker', process.env.RENDER_WORKER_HEALTH_URL ?? 'http://127.0.0.1:3001/health'],
  ['analysis-worker', process.env.ANALYSIS_WORKER_HEALTH_URL ?? 'http://127.0.0.1:8001/health'],
  ['minio', process.env.MINIO_HEALTH_URL ?? 'http://127.0.0.1:9000/minio/health/live'],
];

const tcpChecks = [
  ['postgres', process.env.POSTGRES_HOST ?? '127.0.0.1', 5432],
  ['redis', process.env.REDIS_HOST ?? '127.0.0.1', 6379],
];

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function checkHttp(name, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) {
    throw new Error(`${name} returned HTTP ${response.status}`);
  }
}

async function checkTcp(name, host, port) {
  await new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(3000);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`${name} timed out`));
    });
    socket.once('error', reject);
  });
}

async function runChecks() {
  const failures = [];

  await Promise.all([
    ...httpChecks.map(async ([name, url]) => {
      try {
        await checkHttp(name, url);
        console.log(`ok   ${name}`);
      } catch (error) {
        failures.push(error);
      }
    }),
    ...tcpChecks.map(async ([name, host, port]) => {
      try {
        await checkTcp(name, host, port);
        console.log(`ok   ${name}`);
      } catch (error) {
        failures.push(error);
      }
    }),
  ]);

  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more HotelCut services are not healthy');
  }
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await runChecks();
    console.log('HotelCut foundation is healthy.');
    process.exitCode = 0;
    break;
  } catch (error) {
    if (attempt === attempts) {
      console.error(error);
      process.exitCode = 1;
      break;
    }
    await delay(intervalMs);
  }
}
