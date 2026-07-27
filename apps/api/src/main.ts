import { buildApp } from './app.js';
import { parseEnvironment } from './config.js';
import { createDatabaseClient, PostgresHotelCutRepository } from '@hotelcut/database';
import { BullMqAnalysisQueue } from '@hotelcut/job-queue';
import { S3MultipartObjectStorage } from '@hotelcut/storage';

const environment = parseEnvironment(process.env);
const databaseClient = createDatabaseClient(environment.DATABASE_URL);
const repository = new PostgresHotelCutRepository(databaseClient.db);
const analysisQueue = new BullMqAnalysisQueue(environment.REDIS_URL);
const objectStorage = new S3MultipartObjectStorage({
  endpoint: environment.S3_ENDPOINT,
  publicEndpoint: environment.S3_PUBLIC_ENDPOINT,
  region: environment.S3_REGION,
  accessKeyId: environment.S3_ACCESS_KEY_ID,
  secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
});
const app = await buildApp({
  analysisQueue,
  logger: true,
  objectStorage,
  repository,
  storageBucket: environment.S3_BUCKET,
  uploadUrlTtlSeconds: environment.UPLOAD_URL_TTL_SECONDS,
});
app.addHook('onClose', async () => {
  await Promise.all([databaseClient.close(), analysisQueue.close()]);
});

try {
  await app.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
} catch (error) {
  app.log.error(error);
  await Promise.all([databaseClient.close(), analysisQueue.close()]);
  process.exitCode = 1;
}
