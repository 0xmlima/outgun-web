// SPDX-License-Identifier: GPL-2.0-or-later
// Um banco vazio e exclusivo por arquivo de teste, no servidor do global-setup.
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';
import { connect, type Database } from '../db/client.js';

export const pgAdminUrl = inject('pgAdminUrl');

export interface TestDatabase extends Database {
  url: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  if (!pgAdminUrl) throw new Error('sem banco de teste');
  const name = `outgun_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(pgAdminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(pgAdminUrl);
  url.pathname = `/${name}`;
  const database = connect(url.toString(), 4);
  return {
    ...database,
    url: url.toString(),
    async drop() {
      await database.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end({ timeout: 2 });
    },
  };
}
