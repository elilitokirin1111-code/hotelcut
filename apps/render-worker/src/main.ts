import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { createDatabaseClient, PostgresHotelCutRepository } from '@hotelcut/database';
import { RENDER_JOB_NAME, RENDER_QUEUE_NAME, type RenderJobData } from '@hotelcut/job-queue';
import { RemotionRenderer } from '@hotelcut/renderer';
import { S3MultipartObjectStorage } from '@hotelcut/storage';

import { parseEnvironment } from './config.js';
import { createHealthServer, type HealthState } from './health-server.js';
import { createRenderProcessor } from './processor.js';

const environment = parseEnvironment(process.env);
const state: HealthState = { queue: 'starting' };
const databaseClient = createDatabaseClient(environment.DATABASE_URL);
const repository = new PostgresHotelCutRepository(databaseClient.db);
const objectStorage = new S3MultipartObjectStorage({
  endpoint: environment.S3_ENDPOINT,
  region: environment.S3_REGION,
  accessKeyId: environment.S3_ACCESS_KEY_ID,
  secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
});
const renderer = new RemotionRenderer({
  ...(environment.REMOTION_BROWSER_EXECUTABLE
    ? { browserExecutable: environment.REMOTION_BROWSER_EXECUTABLE }
    : {}),
  concurrency: environment.RENDER_CONCURRENCY,
});
const processRender = createRenderProcessor({
  assetUrlTtlSeconds: environment.RENDER_ASSET_URL_TTL_SECONDS,
  bucket: environment.S3_BUCKET,
  objectStorage,
  renderer,
  repository,
  tempRoot: environment.RENDER_TEMP_ROOT,
});
const connection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const worker = new Worker<RenderJobData>(
  RENDER_QUEUE_NAME,
  async (job) => {
    if (job.name === 'healthcheck') {
      return { status: 'ok' };
    }
    if (job.name !== RENDER_JOB_NAME) {
      throw new Error(`Unsupported render job: ${job.name}`);
    }
    return processRender(job);
  },
  { connection, concurrency: environment.RENDER_WORKER_CONCURRENCY },
);
const healthServer = createHealthServer(state);

worker.on('ready', () => {
  state.queue = 'ready';
});
worker.on('error', (error) => {
  state.queue = 'error';
  console.error(error);
});

healthServer.listen(environment.RENDER_WORKER_HEALTH_PORT, '0.0.0.0');

async function shutdown(): Promise<void> {
  await worker.close();
  await connection.quit();
  await databaseClient.close();
  await new Promise<void>((resolve, reject) => {
    healthServer.close((error) => (error ? reject(error) : resolve()));
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      },
    );
  });
}
