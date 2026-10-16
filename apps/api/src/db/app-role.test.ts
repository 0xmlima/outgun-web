// SPDX-License-Identifier: GPL-2.0-or-later
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { ensureAppRole } from './app-role.js';
import { migrateUp } from './migrate.js';

describe.skipIf(!pgAdminUrl)('papel da aplicação sem superusuário (OG-308)', () => {
  let t: TestDatabase;
  let app: postgres.Sql;
  const role = `outgun_app_test_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(18).toString('base64url');

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await ensureAppRole(t.sql, role, password);
    const url = new URL(t.url);
    url.username = role;
    url.password = password;
    app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    await app?.end({ timeout: 2 });
    await t?.drop();
    const admin = postgres(pgAdminUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);
    await admin.end({ timeout: 2 });
  });

  it('lê e grava dados (inclusive com sequência)', async () => {
    const [{ id }] = (await app`INSERT INTO seasons (name, starts_at) VALUES ('Teste', now()) RETURNING id`) as unknown as [{ id: number }];
    await app`UPDATE seasons SET name = 'Teste 2' WHERE id = ${id}`;
    expect(await app`SELECT name FROM seasons WHERE id = ${id}`).toEqual([{ name: 'Teste 2' }]);
    await app`DELETE FROM seasons WHERE id = ${id}`;
  });

  it('não cria nem altera tabelas, papéis ou o controle das migrations', async () => {
    await expect(app`CREATE TABLE hack (id int)`).rejects.toThrow(/permission denied/);
    await expect(app`ALTER TABLE users ADD COLUMN hack int`).rejects.toThrow(/owner|permission/);
    await expect(app`DROP TABLE users`).rejects.toThrow(/owner|permission/);
    await expect(app.unsafe('CREATE ROLE intruso')).rejects.toThrow(/permission/);
    await expect(app`DELETE FROM schema_migrations`).rejects.toThrow(/permission denied/);
    await expect(app.unsafe("COPY users TO PROGRAM 'id'")).rejects.toThrow(/permission|superuser|privilege/i);
    const [r] = (await app`SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user`) as unknown as [Record<string, boolean>];
    expect(r).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false });
  });

  it('é idempotente e troca a senha', async () => {
    const other = randomBytes(18).toString('base64url');
    await ensureAppRole(t.sql, role, other);
    await ensureAppRole(t.sql, role, other);
    const url = new URL(t.url);
    url.username = role;
    url.password = other;
    const again = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await expect(again`SELECT 1 AS ok`).resolves.toEqual([{ ok: 1 }]);
    await again.end({ timeout: 2 });
  });

  it('recusa nome inválido e senha curta', async () => {
    await expect(ensureAppRole(t.sql, 'x; DROP', 'a'.repeat(20))).rejects.toThrow(/inválido/);
    await expect(ensureAppRole(t.sql, role, 'curta')).rejects.toThrow(/curta/);
  });
});
