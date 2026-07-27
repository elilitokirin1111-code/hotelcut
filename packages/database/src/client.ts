import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

export interface DatabaseClient {
  db: PostgresJsDatabase<typeof schema>;
  sql: Sql;
  close(): Promise<void>;
}

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    async close() {
      await sql.end();
    },
  };
}
