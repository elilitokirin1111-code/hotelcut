import { createDatabaseClient } from './client.js';
import { runMigrations } from './migrations.js';
import { developmentSeed, seedDevelopmentData } from './seed-data.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = createDatabaseClient(databaseUrl);
try {
  await runMigrations(client);
  if (process.env.SEED_DEVELOPMENT_DATA !== 'false') {
    await seedDevelopmentData(
      client,
      process.env.DEVELOPMENT_SEED_PASSWORD ?? developmentSeed.password,
    );
  }
  console.info('HotelCut database bootstrap completed');
} finally {
  await client.close();
}
