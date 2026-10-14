// SPDX-License-Identifier: GPL-2.0-or-later
// Beta fechado (OG-106): cadastro só com convite, partida só com conta, feedback com a nota de
// fidelidade e triagem no painel (papéis e auditoria).
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { adminActions, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

describe.skipIf(!pgAdminUrl)('beta fechado (OG-106)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;
  const cookies: Record<string, string> = {};

  const post = (url: string, payload: unknown, cookie?: string, method: 'POST' | 'DELETE' = 'POST') =>
    app.inject({ method, url, payload: payload as object, remoteAddress: `10.20.0.${++ip}`, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } });
  const get = (url: string, cookie?: string) => app.inject({ url, headers: cookie ? { cookie } : {} });
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;
  const register = (username: string, invite?: string) =>
    post('/auth/register', { username, email: `${username.toLowerCase()}@beta.test`, password: 'cavalo-bateria-grampo', ...(invite !== undefined ? { invite } : {}) });

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.update(users).set({ isModerator: true }).where(eq(users.username, 'Jogador2'));
    app = await buildApp({ config: { ...loadConfig({ BETA: '1' }), databaseUrl: t.url }, database: t, mailer: new MemoryMailer(), logger: false });
    for (const name of ['Admin', 'Jogador1', 'Jogador2']) cookies[name] = cookieOf(await post('/auth/login', { username: name, password: 'outgun-dev' }));
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('o cliente sabe que é beta; sem convite (ou com um inválido) não há cadastro', async () => {
    expect((await get('/beta')).json()).toEqual({ beta: true });
    expect((await register('SemConvite')).json().error).toBe('invite_required');
    expect((await register('Errado', 'NAOEXISTE1')).json().error).toBe('invalid_invite');
  });

  it('convites gerados no painel valem o número de usos combinado; revogado não vale', async () => {
    expect((await post('/admin/invites', { count: 2 }, cookies.Jogador2)).statusCode).toBe(403); // moderador não convida
    const before = (await t.db.select({ n: count() }).from(adminActions))[0]!.n;
    const res = await post('/admin/invites', { count: 2, maxUses: 1, note: 'veteranos BR' }, cookies.Admin);
    expect(res.statusCode).toBe(201);
    const [a, b] = res.json().codes as string[];
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    const ok = await register('Veterano1', a!.toLowerCase().replace(/(.{5})/, '$1-')); // aceita minúsculas e hífen
    expect(ok.statusCode).toBe(201);
    cookies.Veterano1 = cookieOf(ok);
    expect((await register('Veterano2', a)).json().error).toBe('invalid_invite'); // já usado
    expect((await post(`/admin/invites/${b}`, {}, cookies.Admin, 'DELETE')).statusCode).toBe(204);
    expect((await register('Veterano3', b)).json().error).toBe('invalid_invite');
    const list = (await get('/admin/invites', cookies.Admin)).json();
    expect(list.beta).toBe(true);
    expect(list.invites.find((i: { code: string }) => i.code === a)).toMatchObject({ uses: 1, usedBy: ['Veterano1'], note: 'veteranos BR', createdBy: 'Admin' });
    expect((await t.db.select({ n: count() }).from(adminActions))[0]!.n).toBe(before + 2);
  });

  it('convidado (sem conta) não entra em sala; com conta entra', async () => {
    const guest = await post('/rooms/main/join', { name: 'Visita' });
    expect(guest.statusCode).toBe(401);
    expect(guest.json().error).toBe('beta_account_required');
    expect((await post('/rooms/main/join', {}, cookies.Veterano1)).statusCode).toBe(200);
  });

  it('feedback só com conta; o painel resume a fidelidade (veteranos à parte) e a triagem é auditada', async () => {
    expect((await post('/feedback', { kind: 'praise', fidelity: 5, text: 'igual ao original' })).statusCode).toBe(401);
    expect((await post('/feedback', { kind: 'other', text: '' }, cookies.Veterano1)).statusCode).toBe(400);
    expect((await post('/feedback', { kind: 'praise', fidelity: 3, veteran: true, text: 'quase' }, cookies.Veterano1)).statusCode).toBe(201);
    // vale a última nota de cada pessoa
    expect((await post('/feedback', { kind: 'praise', fidelity: 5, overall: 4, veteran: true, text: 'agora sim', context: { map: 'outgun1', ping: 120 } }, cookies.Veterano1)).statusCode).toBe(201);
    const bug = await post('/feedback', { kind: 'bug', fidelity: 4, veteran: false, text: '=HYPERLINK("x") travou no mapa verde' }, cookies.Jogador1);
    expect(bug.statusCode).toBe(201);

    expect((await get('/admin/feedback', cookies.Jogador1)).statusCode).toBe(403);
    const panel = (await get('/admin/feedback', cookies.Jogador2)).json();
    expect(panel.summary).toEqual({
      all: { people: 2, average: 4.5, distribution: [0, 0, 0, 1, 1] },
      veterans: { people: 1, average: 5, distribution: [0, 0, 0, 0, 1] },
      openCritical: 0,
    });
    expect(panel.feedback[1]).toMatchObject({ username: 'Veterano1', fidelity: 5, overall: 4, context: { map: 'outgun1', ping: 120 } });
    expect(panel.feedback[1].context.userAgent).toBeDefined();

    const triage = await post(`/admin/feedback/${bug.json().id}`, { status: 'critical', note: 'reproduzido' }, cookies.Jogador2);
    expect(triage.json()).toEqual({ id: bug.json().id, status: 'critical' });
    expect((await get('/admin/feedback?status=critical', cookies.Jogador2)).json().feedback).toHaveLength(1);
    expect((await get('/admin/feedback', cookies.Admin)).json().summary.openCritical).toBe(1);
    const [last] = await t.db.select().from(adminActions).orderBy(adminActions.id).limit(1).offset((await t.db.select({ n: count() }).from(adminActions))[0]!.n - 1);
    expect(last).toMatchObject({ action: 'feedback', actorName: 'Jogador2', targetName: 'Jogador1', reason: 'reproduzido' });

    const csv = await get('/admin/feedback.csv', cookies.Jogador2);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.body.split('\r\n')[0]).toBe('id,data,jogador,tipo,fidelidade,geral,veterano,texto,status,nota,contexto');
    expect(csv.body).toContain(`"'=HYPERLINK(""x"") travou no mapa verde"`); // fórmula neutralizada
  });

  it('fora do beta, cadastro e convidados seguem como antes', async () => {
    const open = await buildApp({ config: { ...loadConfig({}), databaseUrl: t.url }, database: t, mailer: new MemoryMailer(), logger: false });
    expect((await open.inject('/beta')).json()).toEqual({ beta: false });
    const res = await open.inject({ method: 'POST', url: '/auth/register', payload: { username: 'Livre', email: 'livre@x.com', password: 'cavalo-bateria-grampo' }, headers: { origin: ORIGIN }, remoteAddress: '10.21.0.1' });
    expect(res.statusCode).toBe(201);
    expect((await open.inject({ method: 'POST', url: '/rooms/main/join', payload: { name: 'Visita' }, headers: { origin: ORIGIN }, remoteAddress: '10.21.0.2' })).statusCode).toBe(200);
    await open.close();
  });
});
