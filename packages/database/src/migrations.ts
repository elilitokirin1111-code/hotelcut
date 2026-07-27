import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import type { DatabaseClient } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export async function runMigrations(client: DatabaseClient): Promise<void> {
  await migrate(client.db, { migrationsFolder });
}
