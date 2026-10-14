// SPDX-License-Identifier: GPL-2.0-or-later
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { appliedVersions, loadMigrations, migrateDown, migrateUp } from './migrate.js';
import { allTables } from './schema.js';

describe('arquivos de migration', () => {
  it('toda migration tem up e down, numeradas em ordem', () => {
    const list = loadMigrations();
    expect(list.length).toBeGreaterThan(0);
    list.forEach((m, i) => {
      expect(m.version).toBe(i + 1);
      expect(m.down.trim().length).toBeGreaterThan(0);
    });
  });

  it('recusa migration sem down', () => {
    const dir = mkdtempSync(join(tmpdir(), 'og080-'));
    writeFileSync(join(dir, '0001_x.up.sql'), 'SELECT 1;');
    expect(() => loadMigrations(dir)).toThrow(/sem down/);
  });
});

describe.skipIf(!pgAdminUrl)('migrations no PostgreSQL', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  const objects = async () => {
    const tables = await t.sql`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> 'schema_migrations' ORDER BY table_name`;
    const types = await t.sql`SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'`;
    return { tables: tables.map((r) => r.table_name as string), types: types.map((r) => r.typname as string) };
  };

  it('aplica, desfaz por completo e reaplica', async () => {
    const all = loadMigrations().map((m) => m.version);
    expect(await migrateUp(t.sql)).toEqual(all);
    expect(await migrateUp(t.sql)).toEqual([]);
    expect(await appliedVersions(t.sql)).toEqual(all);
    const up = await objects();
    expect(up.tables).toEqual(Object.keys(allTables).sort());

    expect(await migrateDown(t.sql, all.length)).toEqual([...all].reverse());
    expect(await objects()).toEqual({ tables: [], types: [] });
    expect(await appliedVersions(t.sql)).toEqual([]);

    expect(await migrateUp(t.sql)).toEqual(all);
    expect(await objects()).toEqual(up);
  });

  it('um banco novo já tem a temporada ativa e as salas da plataforma (0008)', async () => {
    const seasons = await t.sql`SELECT name, active FROM seasons`;
    expect(seasons.map((r) => [r.name, r.active])).toEqual([['Temporada 1', true]]);
    const rooms = await t.sql`SELECT id, mode FROM rooms WHERE persistent ORDER BY id`;
    expect(rooms.map((r) => [r.id, r.mode])).toEqual([
      ['main', 'casual'],
      ['ranked', 'ranked'],
    ]);
  });

  it('o schema do Drizzle descreve as mesmas colunas do SQL', async () => {
    for (const [name, table] of Object.entries(allTables)) {
      const config = getTableConfig(table);
      expect(config.name).toBe(name);
      const rows = await t.sql`SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${name} ORDER BY column_name`;
      const db = rows.map((r) => `${r.column_name as string}:${r.is_nullable === 'NO' ? 'not null' : 'null'}`).sort();
      const drizzle = config.columns.map((c) => `${c.name}:${c.notNull ? 'not null' : 'null'}`).sort();
      expect(drizzle, name).toEqual(db);
    }
  });
});
