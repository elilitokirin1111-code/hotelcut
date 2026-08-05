import { buildApp } from './app.js';
import { parseEnvironment } from './config.js';
import { createDatabaseClient, PostgresHotelCutRepository } from '@hotelcut/database';
import { BullMqAnalysisQueue, BullMqRenderQueue } from '@hotelcut/job-queue';
import { S3MultipartObjectStorage } from '@hotelcut/storage';

const environment = parseEnvironment(process.env);
const databaseClient = createDatabaseClient(environment.DATABASE_URL);
const repository = new PostgresHotelCutRepository(databaseClient.db);
const analysisQueue = new BullMqAnalysisQueue(environment.REDIS_URL);
const renderQueue = new BullMqRenderQueue(environment.REDIS_URL);
const objectStorage = new S3MultipartObjectStorage({
  endpoint: environment.S3_ENDPOINT,
  publicEndpoint: environment.S3_PUBLIC_ENDPOINT,
  region: environment.S3_REGION,
  accessKeyId: environment.S3_ACCESS_KEY_ID,
  secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
});
const app = await buildApp({
  aiDirectorFeatureFlags: {
    aiDirectorEnabled: environment.AI_DIRECTOR_ENABLED,
    referenceAnalysisEnabled: environment.REFERENCE_ANALYSIS_ENABLED,
    dynamicBlueprintEnabled: environment.DYNAMIC_BLUEPRINT_ENABLED,
    aiReviewEnabled: environment.AI_REVIEW_ENABLED,
  },
  allowDevelopmentIdentity:
    environment.NODE_ENV !== 'production' && environment.ALLOW_DEVELOPMENT_IDENTITY,
  analysisQueue,
  authRepository: repository,
  downloadUrlTtlSeconds: environment.UPLOAD_URL_TTL_SECONDS,
  logger: true,
  modelApiConfigSecret: environment.MODEL_API_CONFIG_SECRET,
  objectStorage,
  renderQueue,
  repository,
  secureSessionCookie: environment.SESSION_COOKIE_SECURE ?? environment.NODE_ENV === 'production',
  sessionTtlSeconds: environment.AUTH_SESSION_TTL_SECONDS,
  storageBucket: environment.S3_BUCKET,
  uploadUrlTtlSeconds: environment.UPLOAD_URL_TTL_SECONDS,
  ...(environment.GUEST_MODE ? { guestUserId: environment.GUEST_USER_ID } : {}),
});
app.addHook('onClose', async () => {
  await Promise.all([databaseClient.close(), analysisQueue.close(), renderQueue.close()]);
});

try {
  await app.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
} catch (error) {
  app.log.error(error);
  await Promise.all([databaseClient.close(), analysisQueue.close(), renderQueue.close()]);
  process.exitCode = 1;
}
