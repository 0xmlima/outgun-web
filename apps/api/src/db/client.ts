// SPDX-License-Identifier: GPL-2.0-or-later
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface Database {
  sql: Sql;
  db: Db;
  close(): Promise<void>;
}

export function connect(url: string, max = 10): Database {
  const sql = postgres(url, { max, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }), close: () => sql.end({ timeout: 5 }) };
}
