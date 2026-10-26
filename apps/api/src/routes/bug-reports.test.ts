// SPDX-License-Identifier: GPL-2.0-or-later
// Relatos de bug do site (OG-429): campos do modelo de issue, validação e contexto automático.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

export const BUG = {
  area: 'match',
  summary: 'Tela congela depois da explosão do Deathbringer',
  steps: '1. Matar o portador\n2. Ser atingido pela explosão',
  expected: 'Continuar jogando',
  actual: 'A tela congelou',
  frequency: 'sometimes',
  severity: 'critical',
  evidence: 'https://outgunweb.com.br/matches/x',
  workaround: 'Sair e entrar na sala',
} as const;

describe.skipIf(!pgAdminUrl)('relatos de bug (OG-429)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;
  const cookies: Record<string, string> = {};
  const post = (url: string, payload: unknown, cookie?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, remoteAddress: `10.30.0.${++ip}`, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } });
  const get = (url: string, cookie?: string) => app.inject({ url, headers: cookie ? { cookie } : {} });
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.update(users).set({ isModerator: true }).where(eq(users.username, 'Jogador2'));
    app = await buildApp({ config: { ...loadConfig({}), databaseUrl: t.url }, database: t, mailer: new MemoryMailer(), logger: false });
    for (const name of ['Jogador1', 'Jogador2']) cookies[name] = cookieOf(await post('/auth/login', { username: name, password: 'outgun-dev' }));
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('sem resumo ou sem o que aconteceu, recusa; completo, grava e o painel mostra os campos', async () => {
    const incomplete = await post('/feedback', { kind: 'bug', text: '', bug: { ...BUG, summary: '  ' } }, cookies.Jogador1);
    expect(incomplete.json().error).toBe('bug_incomplete');
    expect((await post('/feedback', { kind: 'bug', text: '', bug: { ...BUG, actual: '' } }, cookies.Jogador1)).statusCode).toBe(400);
    const ok = await post('/feedback', { kind: 'bug', text: '', context: { version: '2.45.0', client: 'app desktop/Steam' }, bug: BUG }, cookies.Jogador1);
    expect(ok.statusCode).toBe(201);
    const row = (await get('/admin/feedback?kind=bug', cookies.Jogador2)).json().feedback.find((f: { id: number }) => f.id === ok.json().id);
    expect(row).toMatchObject({ kind: 'bug', bug: BUG, context: { version: '2.45.0', client: 'app desktop/Steam' } });
  });

  it('os outros tipos continuam como antes (sem campos de bug)', async () => {
    const ok = await post('/feedback', { kind: 'praise', fidelity: 5, text: 'ótimo' }, cookies.Jogador1);
    expect(ok.statusCode).toBe(201);
    const row = (await get('/admin/feedback', cookies.Jogador2)).json().feedback.find((f: { id: number }) => f.id === ok.json().id);
    expect(row.bug).toBeNull();
  });
});
