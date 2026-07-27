import { createDatabaseClient } from './client.js';
import { runMigrations } from './migrations.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = createDatabaseClient(databaseUrl);
try {
  await runMigrations(client);
  console.info('HotelCut database migrations applied');
} finally {
  await client.close();
}
