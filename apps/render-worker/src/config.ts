import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.url().default('postgresql://hotelcut:hotelcut_local@localhost:5432/hotelcut'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REMOTION_BROWSER_EXECUTABLE: z.string().min(1).optional(),
  RENDER_ASSET_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  RENDER_CONCURRENCY: z
    .string()
    .regex(/^(\d+|\d+%)$/)
    .default('25%'),
  RENDER_TEMP_ROOT: z.string().min(1).default('tmp/renders'),
  RENDER_WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3001),
  RENDER_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
  S3_ACCESS_KEY_ID: z.string().min(1).default('hotelcut'),
  S3_BUCKET: z.string().min(1).default('hotelcut-local'),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('hotelcut_local_secret'),
});

export type RenderWorkerEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): RenderWorkerEnvironment {
  return environmentSchema.parse(environment);
}
