import { z } from 'zod';

const environmentSchema = z.object({
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().default('postgresql://hotelcut:hotelcut_local@localhost:5432/hotelcut'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  return environmentSchema.parse(environment);
}
