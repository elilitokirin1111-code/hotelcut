import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { parseEnvironment } from './config.js';
import { createHealthServer, type HealthState } from './health-server.js';
import { RENDER_QUEUE_NAME } from './queue.js';

const environment = parseEnvironment(process.env);
const state: HealthState = { queue: 'starting' };
const connection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const worker = new Worker(
  RENDER_QUEUE_NAME,
  (job) => {
    if (job.name !== 'healthcheck') {
      throw new Error(`Unsupported M0 render job: ${job.name}`);
    }

    return Promise.resolve({ status: 'ok' });
  },
  { connection },
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
