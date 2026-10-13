// SPDX-License-Identifier: GPL-2.0-or-later
// Migrations reversíveis: migrations/NNNN_nome.up.sql e NNNN_nome.down.sql, aplicadas em ordem,
// cada uma numa transação, sob um advisory lock (dois processos não migram ao mesmo tempo).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
const LOCK_ID = 80_080;

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir);
  const ups = files.filter((f) => /^\d{4}_[a-z0-9_]+\.up\.sql$/.test(f)).sort();
  return ups.map((file) => {
    const base = file.slice(0, -'.up.sql'.length);
    const downFile = `${base}.down.sql`;
    if (!files.includes(downFile)) throw new Error(`migration sem down: ${downFile}`);
    return {
      version: Number(base.slice(0, 4)),
      name: base.slice(5),
      up: readFileSync(`${dir}/${file}`, 'utf8'),
      down: readFileSync(`${dir}/${downFile}`, 'utf8'),
    };
  });
}

export async function appliedVersions(sql: Sql): Promise<number[]> {
  const [exists] = await sql`SELECT to_regclass('schema_migrations') IS NOT NULL AS ok`;
  if (!exists?.ok) return [];
  const rows = await sql`SELECT version FROM schema_migrations ORDER BY version`;
  return rows.map((r) => Number(r.version));
}

/** Aplica as migrations pendentes (até `target`, inclusive). Devolve as versões aplicadas. */
export async function migrateUp(sql: Sql, target = Infinity, migrations = loadMigrations()): Promise<number[]> {
  const done: number[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = new Set((await tx`SELECT version FROM schema_migrations`).map((r) => Number(r.version)));
    for (const m of migrations) {
      if (m.version > target || applied.has(m.version)) continue;
      await tx.unsafe(m.up);
      await tx`INSERT INTO schema_migrations (version, name) VALUES (${m.version}, ${m.name})`;
      done.push(m.version);
    }
  });
  return done;
}

/** Desfaz as `steps` últimas migrations aplicadas. Devolve as versões desfeitas. */
export async function migrateDown(sql: Sql, steps = 1, migrations = loadMigrations()): Promise<number[]> {
  const undone: number[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
    const [exists] = await tx`SELECT to_regclass('schema_migrations') IS NOT NULL AS ok`;
    if (!exists?.ok) return;
    const applied = (await tx`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT ${steps}`).map((r) =>
      Number(r.version),
    );
    for (const version of applied) {
      const m = migrations.find((x) => x.version === version);
      if (!m) throw new Error(`migration ${version} aplicada mas ausente em migrations/`);
      await tx.unsafe(m.down);
      await tx`DELETE FROM schema_migrations WHERE version = ${version}`;
      undone.push(version);
    }
  });
  return undone;
}
