import { z } from 'zod';

const environmentSchema = z.object({
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().default('postgresql://hotelcut:hotelcut_local@localhost:5432/hotelcut'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('hotelcut'),
  S3_BUCKET: z.string().min(1).default('hotelcut-local'),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('hotelcut_local_secret'),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  return environmentSchema.parse(environment);
}
