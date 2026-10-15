// SPDX-License-Identifier: GPL-2.0-or-later
// Ticket de entrada (OG-083): quem pode entrar em qual sala e o que o ticket diz.
import { fromJwks, verifyTicket } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { deviceHash } from './join.js';
import { hashPassword } from '../auth/password.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { bans, clanMembers, clans, rooms } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';

describe.skipIf(!pgAdminUrl)('entrada nas salas (OG-083)', () => {
  let t: TestDatabase;
  let app: App;
  let keys: ReturnType<typeof fromJwks>;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.insert(rooms).values({ id: 'priv', name: 'Privada', mode: 'casual', preset: 'classic', maxPlayers: 8, passwordHash: await hashPassword('abc12345') });
    const config = { ...loadConfig({}), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    keys = fromJwks((await app.inject('/.well-known/jwks.json')).json());
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Jogador1', password: 'outgun-dev' }, headers: { origin: ORIGIN } });
    cookie = `og_session=${login.cookies.find((c) => c.name === 'og_session')!.value}`;
    userId = login.json().user.id;
    // a tag vem do clã (OG-270): o gatilho copia para users.clan_tag
    const [clan] = await t.db.insert(clans).values({ name: 'Os XY', nameKey: 'os xy', tag: 'XY', tagKey: 'xy' }).returning();
    await t.db.insert(clanMembers).values({ userId, clanId: clan!.id, role: 'leader' });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const join = (room: string, body: Record<string, unknown> = {}, opts: { cookie?: string; ip?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: `/rooms/${room}/join`,
      payload: body,
      remoteAddress: opts.ip ?? '10.3.0.1',
      headers: { origin: ORIGIN, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    });
  const claimsOf = (res: LightMyRequestResponse, room: string) => {
    const r = verifyTicket(res.json().ticket, keys, room);
    if (!r.ok) throw new Error(r.reason);
    return r.claims;
  };

  it('convidado entra no Casual com o nome marcado e o ticket diz que não tem conta', async () => {
    const res = await join('main', { name: 'Visita' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Visita*', guest: true, wsUrl: 'ws://localhost:7700/rooms/main' });
    expect(claimsOf(res, 'main')).toMatchObject({ aud: 'main', name: 'Visita*', acct: false, admin: false, ranked: false, clan: null });
    expect(claimsOf(res, 'main').sub).toMatch(/^guest:/);
  });

  it('convidado não usa nome inválido nem de conta', async () => {
    expect((await join('main', {})).json().error).toBe('invalid_name');
    expect((await join('main', { name: 'JOGADOR1' })).json().error).toBe('name_registered');
  });

  it('convidado só entra em sala Casual; com conta, o Ranked libera', async () => {
    expect((await join('ranked', { name: 'Visita' })).json().error).toBe('account_required');
    const res = await join('ranked', { name: 'ignorado' }, { cookie });
    expect(res.statusCode).toBe(200);
    expect(claimsOf(res, 'ranked')).toMatchObject({ sub: userId, name: 'Jogador1', clan: 'XY', acct: true, ranked: true });
  });

  it('o ticket vale só para a sala pedida', async () => {
    const res = await join('main', {}, { cookie });
    expect(verifyTicket(res.json().ticket, keys, 'ranked')).toEqual({ ok: false, reason: 'wrong_room' });
  });

  it('sala privada pede a senha', async () => {
    expect((await join('priv', { name: 'Visita' })).json().error).toBe('password_required');
    expect((await join('priv', { name: 'Visita', password: 'errada' })).json().error).toBe('wrong_password');
    expect((await join('priv', { name: 'Visita', password: 'abc12345' })).statusCode).toBe(200);
  });

  it('ban por conta ou IP, de sala ou de plataforma; ban vencido ou revogado não conta', async () => {
    const [b] = await t.db.insert(bans).values({ userId, roomId: 'main', expiresAt: new Date(Date.now() + 60_000) }).returning();
    expect((await join('main', {}, { cookie })).json().error).toBe('banned');
    expect((await join('ranked', {}, { cookie })).statusCode).toBe(200);
    await t.db.update(bans).set({ revokedAt: new Date() }).where(eq(bans.id, b!.id));
    expect((await join('main', {}, { cookie })).statusCode).toBe(200);

    await t.db.insert(bans).values({ ip: '10.3.9.9' });
    expect((await join('ranked', {}, { cookie, ip: '10.3.9.9' })).json().error).toBe('banned');
    expect((await join('main', { name: 'Visita' }, { ip: '10.3.9.9' })).json().error).toBe('banned');
    await t.db.insert(bans).values({ ip: '10.3.9.8', expiresAt: new Date(Date.now() - 1000) });
    expect((await join('main', { name: 'Visita' }, { ip: '10.3.9.8' })).statusCode).toBe(200);
  });

  it('ban por dispositivo (OG-104): só o hash vai ao banco e ao ticket', async () => {
    const device = 'navegador-de-teste-0001';
    const ok = await join('main', { name: 'Visita', device });
    expect(claimsOf(ok, 'main').dev).toBe(deviceHash(device));
    expect(ok.body).not.toContain(device);
    await t.db.insert(bans).values({ deviceHash: deviceHash(device), expiresAt: new Date(Date.now() + 60_000) });
    expect((await join('main', { name: 'Visita', device }, { ip: '10.3.7.1' })).json().error).toBe('banned');
    expect((await join('main', {}, { cookie, ip: '10.3.7.2' }).then((r) => r.statusCode))).toBe(200);
    expect((await join('main', { device }, { cookie, ip: '10.3.7.2' })).json().error).toBe('banned');
    expect((await join('main', { name: 'Visita', device: 'curto' })).statusCode).toBe(400);
  });

  it('sala no ar e lotada recusa; endereço vem do heartbeat', async () => {
    await t.db.update(rooms).set({ lastHeartbeatAt: new Date(), wsUrl: 'wss://gs1.example/rooms/main', players: 16 }).where(eq(rooms.id, 'main'));
    expect((await join('main', { name: 'Visita' })).json().error).toBe('room_full');
    await t.db.update(rooms).set({ players: 3 }).where(eq(rooms.id, 'main'));
    expect((await join('main', { name: 'Visita' })).json().wsUrl).toBe('wss://gs1.example/rooms/main');
  });

  it('sala inexistente ou fora do ar (sem endereço de desenvolvimento)', async () => {
    expect((await join('nada', { name: 'Visita' })).statusCode).toBe(404);
    const prod = await buildApp({ config: { ...loadConfig({}), databaseUrl: t.url, devRoomWsUrl: undefined }, database: t, logger: false });
    await t.db.insert(rooms).values({ id: 'fora', name: 'Fora do ar', mode: 'casual', preset: 'classic', maxPlayers: 8 });
    const res = await prod.inject({ method: 'POST', url: '/rooms/fora/join', payload: { name: 'Xis' }, headers: { origin: ORIGIN } });
    expect(res.json().error).toBe('room_offline');
    await prod.close();
  });
});
