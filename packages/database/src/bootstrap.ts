import { createDatabaseClient } from './client.js';
import { runMigrations } from './migrations.js';
import { seedDevelopmentData } from './seed-data.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = createDatabaseClient(databaseUrl);
try {
  await runMigrations(client);
  if (process.env.SEED_DEVELOPMENT_DATA !== 'false') {
    await seedDevelopmentData(client);
  }
  console.info('HotelCut database bootstrap completed');
} finally {
  await client.close();
}
