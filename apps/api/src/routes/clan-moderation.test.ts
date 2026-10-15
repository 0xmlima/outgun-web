// SPDX-License-Identifier: GPL-2.0-or-later
// Moderação de clãs (OG-275, RN-CLA-08): denúncia na página do clã, filtro de nomes proibidos e,
// no painel, só moderador/admin força troca ou dissolve — sempre com auditoria.
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { adminActions, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { nameBlocked, parseNameFilter } from '../name-filter.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

it('filtro de nomes: sem maiúsculas, acentos nem pontuação, e dentro do nome', () => {
  const words = parseNameFilter(' Feio , ,mau');
  expect(words).toEqual(['feio', 'mau']);
  expect(nameBlocked('Os FÉIOS', words)).toBe(true);
  expect(nameBlocked('xx.f-e-i-o.xx', words)).toBe(true);
  expect(nameBlocked('Os Bonitos', words)).toBe(false);
  expect(nameBlocked('qualquer', [])).toBe(false);
});

describe.skipIf(!pgAdminUrl)('moderação de clãs (OG-275)', () => {
  let t: TestDatabase;
  let app: App;
  const cookies: Record<'admin' | 'mod' | 'player', string> = { admin: '', mod: '', player: '' };

  const login = async (username: string) => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'outgun-dev' }, headers: { origin: ORIGIN }, remoteAddress: `10.9.0.${username.length}` });
    return `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;
  };
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, who?: keyof typeof cookies, payload?: unknown) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) } });
  const lastAudit = async () => (await t.db.select().from(adminActions).orderBy(desc(adminActions.id)).limit(1))[0]!;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.update(users).set({ isModerator: true }).where(eq(users.username, 'Jogador2'));
    const config = { ...loadConfig({ NAME_FILTER: 'feio' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    cookies.admin = await login('Admin');
    cookies.mod = await login('Jogador2');
    cookies.player = await login('Jogador1');
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('nome, tag e descrição passam pelo filtro de nomes proibidos', async () => {
    expect((await call('POST', '/clans', 'player', { name: 'Os Feios', tag: 'OF' })).json().error).toBe('name_not_allowed');
    expect((await call('POST', '/clans', 'player', { name: 'Os Lindos', tag: 'OL', description: 'somos FÉIOS' })).json().error).toBe('name_not_allowed');
    expect((await call('POST', '/clans', 'player', { name: 'Os Lindos', tag: 'OL' })).statusCode).toBe(201);
    expect((await call('PATCH', '/clans/OL', 'player', { name: 'Feiosos' })).json().error).toBe('name_not_allowed');
  });

  it('denúncia do clã entra nas denúncias do painel; uma aberta por pessoa', async () => {
    expect((await call('POST', '/clans/OL/report', undefined, { reason: 'x' })).statusCode).toBe(401);
    expect((await call('POST', '/clans/OL/report', 'mod', { reason: 'nome ofensivo' })).statusCode).toBe(204);
    expect((await call('POST', '/clans/OL/report', 'mod', { reason: 'de novo' })).json().error).toBe('already_reported');
    expect((await call('GET', '/admin/reports', 'mod')).json().reports).toContainEqual(expect.objectContaining({ target: '(OL) Os Lindos', reason: 'nome ofensivo' }));
    expect((await call('GET', '/admin/clans', 'mod')).json().clans[0]).toMatchObject({ tag: 'OL', leader: 'Jogador1', members: 1, reports: 1 });
  });

  it('só moderador/admin acessa as rotas de clã do painel', async () => {
    for (const [method, url, body] of [
      ['GET', '/admin/clans', undefined],
      ['PATCH', '/admin/clans/OL', { name: 'Outro', reason: 'r' }],
      ['DELETE', '/admin/clans/OL', { reason: 'r' }],
    ] as const) {
      expect((await call(method, url, undefined, body)).statusCode, `${method} ${url}`).toBe(401);
      expect((await call(method, url, 'player', body)).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('forçar troca de nome/tag/descrição fica na auditoria', async () => {
    const res = await call('PATCH', '/admin/clans/OL', 'mod', { name: 'Clã Renomeado', tag: 'CR', description: '', reason: 'nome ofensivo' });
    expect(res.json()).toEqual({ name: 'Clã Renomeado', tag: 'CR' });
    expect((await call('GET', '/auth/me', 'player')).json().user.clanTag).toBe('CR');
    expect(await lastAudit()).toMatchObject({ action: 'clan-edit', actorName: 'Jogador2', targetName: '(CR) Clã Renomeado', reason: 'nome ofensivo' });
    expect((await lastAudit()).details).toMatchObject({ from: { name: 'Os Lindos', tag: 'OL' } });
    expect((await call('PATCH', '/admin/clans/XX', 'mod', { name: 'Nada', reason: 'r' })).statusCode).toBe(404);
  });

  it('dissolver pelo painel fica na auditoria e tira a tag dos membros', async () => {
    expect((await call('DELETE', '/admin/clans/CR', 'admin', { reason: 'reincidente' })).statusCode).toBe(204);
    expect(await lastAudit()).toMatchObject({ action: 'clan-dissolve', actorName: 'Admin', targetName: '(CR) Clã Renomeado', reason: 'reincidente' });
    expect((await call('GET', '/auth/me', 'player')).json().user.clanTag).toBeNull();
    expect((await call('GET', '/clans/CR')).statusCode).toBe(404);
  });
});
