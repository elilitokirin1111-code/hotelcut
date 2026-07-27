import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  RENDER_WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3001),
});

export type RenderWorkerEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): RenderWorkerEnvironment {
  return environmentSchema.parse(environment);
}
