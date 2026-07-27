import { createDatabaseClient } from './client.js';
import { seedDevelopmentData } from './seed-data.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = createDatabaseClient(databaseUrl);
try {
  await seedDevelopmentData(client);
  console.info('HotelCut fictional development data seeded');
} finally {
  await client.close();
}
