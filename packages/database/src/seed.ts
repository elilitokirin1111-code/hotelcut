import { createDatabaseClient } from './client.js';
import { developmentSeed, seedDevelopmentData } from './seed-data.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = createDatabaseClient(databaseUrl);
try {
  await seedDevelopmentData(
    client,
    process.env.DEVELOPMENT_SEED_PASSWORD ?? developmentSeed.password,
  );
  console.info('HotelCut fictional development data seeded');
} finally {
  await client.close();
}
