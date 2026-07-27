import { buildApp } from './app.js';
import { parseEnvironment } from './config.js';
import { createDatabaseClient, PostgresHotelCutRepository } from '@hotelcut/database';

const environment = parseEnvironment(process.env);
const databaseClient = createDatabaseClient(environment.DATABASE_URL);
const repository = new PostgresHotelCutRepository(databaseClient.db);
const app = await buildApp({ logger: true, repository });
app.addHook('onClose', async () => databaseClient.close());

try {
  await app.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
} catch (error) {
  app.log.error(error);
  await databaseClient.close();
  process.exitCode = 1;
}
