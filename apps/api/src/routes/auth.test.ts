// SPDX-License-Identifier: GPL-2.0-or-later
// Fluxos de conta de ponta a ponta na API (OG-081): cadastro, login, espera após falhas,
// recuperação de senha pelo e-mail, troca de senha, exportação e exclusão.
import { PassThrough } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMMON_PASSWORD_COUNT } from '../auth/common-passwords.js';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { matches, matchPlayers, passwordResets, sessions, users } from '../db/schema.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

describe.skipIf(!pgAdminUrl)('contas (OG-081)', () => {
  let t: TestDatabase;
  let app: App;
  const mailer = new MemoryMailer();
  const logs = new PassThrough();
  let logText = '';
  logs.on('data', (chunk: Buffer) => (logText += chunk.toString()));
  let ipCounter = 0;
  /** Cada teste usa um IP próprio para não somar falhas de outros testes. */
  const freshIp = () => `10.0.0.${++ipCounter}`;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000', FORGOT_PER_HOUR: '1000' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer, logger: { stream: logs } });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const cookieOf = (res: LightMyRequestResponse) => {
    const c = res.cookies.find((x) => x.name === 'og_session');
    return c?.value ? `og_session=${c.value}` : undefined;
  };
  const post = (url: string, payload: unknown, opts: { cookie?: string | undefined; ip?: string; headers?: Record<string, string> } = {}) =>
    app.inject({
      method: 'POST',
      url,
      payload: payload as Record<string, unknown>,
      remoteAddress: opts.ip ?? '10.1.0.1',
      headers: { origin: ORIGIN, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    });
  const get = (url: string, cookie?: string) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  const register = (username: string, email: string, password = 'senha-boa-123') =>
    post('/auth/register', { username, email, password, language: 'pt-BR' }, { ip: freshIp() });
  const tokenFrom = (text: string) => /#token=([\w-]+)/.exec(text)?.[1];

  it('cadastro entra na hora, com cookie httpOnly e SameSite', async () => {
    const res = await register('Ana', 'Ana@Exemplo.com');
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ username: 'Ana', email: 'Ana@Exemplo.com', isAdmin: false });
    const set = res.cookies.find((c) => c.name === 'og_session')!;
    expect(set).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const me = await get('/auth/me', cookieOf(res));
    expect(me.json().user.username).toBe('Ana');
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.headers['x-content-type-options']).toBe('nosniff');
    const [row] = await t.db.select().from(users).where(eq(users.username, 'Ana'));
    expect(row?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('cadastro valida nome (RN-NOM-01), e-mail e senha', async () => {
    expect((await register(' Ana2', 'a2@x.com')).json().error).toBe('invalid_username');
    expect((await register('A\tB', 'a3@x.com')).json().error).toBe('invalid_username');
    expect((await register('Nome', 'sem-arroba')).json().error).toBe('invalid_email');
    expect((await register('Nome', 'n@x.com', 'curta')).statusCode).toBe(400);
  });

  it('senha comum ou igual ao nome/e-mail é recusada (ASVS 2.1.7)', async () => {
    for (const password of ['password', 'PASSWORD1', 'qwertyuiop', '12345678']) {
      expect((await register('Fraca', 'fraca@x.com', password)).json().error).toBe('weak_password');
    }
    expect((await register('Fraquinha', 'fraca@x.com', 'FRAQUINHA')).json().error).toBe('weak_password');
    expect((await register('Fraquinha', 'f@x.com.br', 'f@x.com.br')).json().error).toBe('weak_password');
    expect((await register('Fraquinha', 'fraca@x.com', 'cavalo-bateria-grampo')).statusCode).toBe(201);
    expect(COMMON_PASSWORD_COUNT).toBeGreaterThan(2000);
  });

  it('nome e e-mail são únicos sem diferenciar maiúsculas', async () => {
    expect((await register('ANA', 'outra@x.com')).json().error).toBe('username_taken');
    expect((await register('Bia', 'ana@exemplo.COM')).json().error).toBe('email_taken');
  });

  it('login aceita o nome sem diferenciar maiúsculas; logout encerra a sessão', async () => {
    const res = await post('/auth/login', { username: 'aNA', password: 'senha-boa-123' }, { ip: freshIp() });
    expect(res.statusCode).toBe(200);
    const cookie = cookieOf(res);
    expect((await get('/auth/me', cookie)).statusCode).toBe(200);
    expect((await post('/auth/logout', {}, { cookie })).statusCode).toBe(204);
    expect((await get('/auth/me', cookie)).statusCode).toBe(401);
  });

  it('erro de login é o mesmo para senha errada e usuário inexistente', async () => {
    const wrong = await post('/auth/login', { username: 'Ana', password: 'errada-123' }, { ip: freshIp() });
    const ghost = await post('/auth/login', { username: 'Fantasma', password: 'errada-123' }, { ip: freshIp() });
    expect(wrong.statusCode).toBe(401);
    expect(ghost.statusCode).toBe(401);
    expect(wrong.json()).toEqual(ghost.json());
  });

  it('após 5 senhas erradas, novas tentativas esperam, até com a senha certa e de outro IP', async () => {
    await register('Caio', 'caio@x.com');
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      expect((await post('/auth/login', { username: 'Caio', password: `errada-${i}` }, { ip })).statusCode).toBe(401);
    }
    const blocked = await post('/auth/login', { username: 'caio', password: 'senha-boa-123' }, { ip });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await post('/auth/login', { username: 'Caio', password: 'senha-boa-123' }, { ip: freshIp() })).statusCode).toBe(429);
  });

  it('o limite por IP vale para qualquer usuário', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await post('/auth/login', { username: `nome${i}`, password: 'errada-123' }, { ip });
    expect((await post('/auth/login', { username: 'Ana', password: 'senha-boa-123' }, { ip })).statusCode).toBe(429);
    expect((await post('/auth/login', { username: 'Ana', password: 'senha-boa-123' }, { ip: freshIp() })).statusCode).toBe(200);
  });

  it('recuperação de senha: mesma resposta exista ou não a conta; link de uso único', async () => {
    await register('Duda', 'duda@x.com');
    const other = await post('/auth/login', { username: 'Duda', password: 'senha-boa-123' }, { ip: freshIp() });
    const oldCookie = cookieOf(other);
    mailer.outbox.length = 0;

    const byName = await post('/auth/password/forgot', { login: 'duda' }, { ip: freshIp() });
    const ghost = await post('/auth/password/forgot', { login: 'ninguem@x.com' }, { ip: freshIp() });
    expect(byName.statusCode).toBe(202);
    expect(ghost.statusCode).toBe(202);
    expect(byName.json()).toEqual(ghost.json());
    await new Promise((r) => setTimeout(r, 50));
    expect(mailer.outbox).toHaveLength(1);
    const mail = mailer.outbox[0]!;
    expect(mail.to).toBe('duda@x.com');
    expect(mail.subject).toContain('redefinir');
    const token = tokenFrom(mail.text)!;
    expect(mail.text).toContain(`${ORIGIN}/reset-password#token=`);

    const reset = await post('/auth/password/reset', { token, password: 'nova-senha-456' }, { ip: freshIp() });
    expect(reset.statusCode).toBe(200);
    expect((await get('/auth/me', cookieOf(reset))).statusCode).toBe(200);
    expect((await get('/auth/me', oldCookie)).statusCode).toBe(401); // outras sessões encerradas
    expect((await post('/auth/password/reset', { token, password: 'outra-senha-789' })).json().error).toBe('invalid_token');
    expect((await post('/auth/login', { username: 'Duda', password: 'senha-boa-123' }, { ip: freshIp() })).statusCode).toBe(401);
    expect((await post('/auth/login', { username: 'Duda', password: 'nova-senha-456' }, { ip: freshIp() })).statusCode).toBe(200);
  });

  it('link de recuperação expira em 30 minutos e por e-mail também funciona', async () => {
    mailer.outbox.length = 0;
    await post('/auth/password/forgot', { login: 'DUDA@x.com', language: 'en' }, { ip: freshIp() });
    await new Promise((r) => setTimeout(r, 50));
    const mail = mailer.outbox[0]!;
    expect(mail.subject).toBe('Outgun Web: reset your password');
    const [row] = await t.db.select().from(passwordResets);
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBeCloseTo(30 * 60_000, -4);
    await t.db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await post('/auth/password/reset', { token: tokenFrom(mail.text)!, password: 'nova-senha-999' });
    expect(res.json().error).toBe('invalid_token');
  });

  it('troca de senha pede a atual e encerra só as outras sessões', async () => {
    const reg = await register('Edu', 'edu@x.com');
    const mine = cookieOf(reg);
    const other = cookieOf(await post('/auth/login', { username: 'Edu', password: 'senha-boa-123' }, { ip: freshIp() }));
    expect((await post('/account/password', { currentPassword: 'errada-000', newPassword: 'nova-senha-1' }, { cookie: mine, ip: freshIp() })).statusCode).toBe(403);
    expect((await post('/account/password', { currentPassword: 'senha-boa-123', newPassword: 'nova-senha-1' }, { cookie: mine, ip: freshIp() })).statusCode).toBe(204);
    expect((await get('/auth/me', mine)).statusCode).toBe(200);
    expect((await get('/auth/me', other)).statusCode).toBe(401);
  });

  it('exportação traz os dados pessoais e nunca o hash da senha', async () => {
    const reg = await register('Fabi', 'fabi@x.com');
    const res = await get('/account/export', cookieOf(reg));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const data = res.json();
    expect(data.account).toMatchObject({ username: 'Fabi', email: 'fabi@x.com' });
    expect(data.sessions).toHaveLength(1);
    expect(res.body).not.toContain('argon2');
    expect((await get('/account/export')).statusCode).toBe(401);
  });

  it('exclusão pede a senha, apaga a conta e deixa as partidas anônimas (RN-PLT-04)', async () => {
    const reg = await register('Gabi', 'gabi@x.com');
    const cookie = cookieOf(reg);
    const userId = reg.json().user.id as string;
    const [match] = await t.db
      .insert(matches)
      .values({ serverId: 'gs', serverMatchId: 'x1', mode: 'casual', ranked: false, map: 'm', redScore: 1, blueScore: 0, startedAt: new Date(), endedAt: new Date() })
      .returning();
    await t.db.insert(matchPlayers).values({ matchId: match!.id, slot: 0, userId, name: 'Gabi', team: 0 });

    const del = (password: string) =>
      app.inject({ method: 'DELETE', url: '/account', payload: { password }, remoteAddress: freshIp(), headers: { origin: ORIGIN, cookie: cookie! } });
    expect((await del('errada-000')).statusCode).toBe(403);
    expect((await del('senha-boa-123')).statusCode).toBe(204);
    expect(await t.db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    const [player] = await t.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, match!.id));
    expect(player).toMatchObject({ userId: null, name: '(anon)' });
    expect((await post('/auth/login', { username: 'Gabi', password: 'senha-boa-123' }, { ip: freshIp() })).statusCode).toBe(401);
    expect((await register('Gabi', 'gabi@x.com')).statusCode).toBe(201); // nome e e-mail livres de novo
  });

  it('CSRF: recusa outra origem e pedido entre sites; só aceita JSON', async () => {
    const payload = { username: 'Ana', password: 'senha-boa-123' };
    expect((await post('/auth/login', payload, { headers: { origin: 'https://malicioso.example' } })).statusCode).toBe(403);
    expect((await post('/auth/login', payload, { headers: { 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403);
    const text = await app.inject({ method: 'POST', url: '/auth/logout', payload: 'x', headers: { 'content-type': 'text/plain' } });
    expect(text.statusCode).toBe(415);
  });

  it('senhas e links de redefinição nunca vão para o log', async () => {
    await register('Hugo', 'hugo@x.com', 'segredo-do-hugo-1');
    await post('/auth/login', { username: 'Hugo', password: 'segredo-do-hugo-2' }, { ip: freshIp() });
    mailer.outbox.length = 0;
    await post('/auth/password/forgot', { login: 'Hugo' }, { ip: freshIp() });
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFrom(mailer.outbox[0]!.text)!;
    await post('/auth/password/reset', { token, password: 'segredo-do-hugo-3' });
    expect(logText.length).toBeGreaterThan(0);
    expect(logText).not.toMatch(/segredo-do-hugo/);
    expect(logText).not.toContain(token);
  });
});
