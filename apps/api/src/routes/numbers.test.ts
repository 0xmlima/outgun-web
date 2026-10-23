// SPDX-License-Identifier: GPL-2.0-or-later
// Números de jogador (OG-410, D-79): únicos de 2 a 99, troca a cada 30 dias, liberados depois de 60
// dias sem jogar (aviso 7 dias antes) e o 1 opcional do líder do mês anterior.
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { notifications, seasonChampions, seasons, users } from '../db/schema.js';
import { MemoryMailer } from '../mail/mailer.js';
import { NUMBER_IDLE_MS, NUMBER_WARNING_MS, releaseIdleNumbers, setNumber, ticketNumber } from '../player-numbers.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'senha-boa-123';
const DAY = 24 * 60 * 60_000;

describe.skipIf(!pgAdminUrl)('números de jogador (OG-410)', () => {
  let t: TestDatabase;
  let app: App;
  let ip = 0;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    const config = { ...loadConfig({ REGISTER_PER_HOUR: '1000' }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    for (const name of ['Ana', 'Bia', 'Caio']) {
      const res = await app.inject({ method: 'POST', url: '/auth/register', headers: { origin: ORIGIN }, remoteAddress: `10.9.0.${++ip}`, payload: { username: name, email: `${name}@x.com`, password: PASSWORD } });
      cookies[name] = `og_session=${(res as LightMyRequestResponse).cookies.find((c) => c.name === 'og_session')!.value}`;
      ids[name] = res.json().user.id;
    }
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const put = (who: string, url: string, payload: unknown) => app.inject({ method: 'PUT', url, headers: { origin: ORIGIN, cookie: cookies[who]! }, payload: payload as Record<string, unknown> });

  it('único de 2 a 99: o segundo a pedir o mesmo número é recusado; 1 e 100 fora da faixa', async () => {
    expect((await put('Ana', '/account/number', { number: 10 })).json()).toMatchObject({ number: 10 });
    expect((await put('Bia', '/account/number', { number: 10 })).json().error).toBe('number_taken');
    expect((await put('Bia', '/account/number', { number: 1 })).statusCode).toBe(400);
    expect((await put('Bia', '/account/number', { number: 100 })).statusCode).toBe(400);
    const both = await Promise.all([setNumber(t.db, ids.Bia!, 20), setNumber(t.db, ids.Caio!, 20)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/account/number', headers: { cookie: cookies.Ana! } })).json().free).not.toContain(10);
  });

  it('sem espera por padrão (2.43.1); com NUMBER_COOLDOWN_DAYS=30, troca só a cada 30 dias', async () => {
    expect((await put('Ana', '/account/number', { number: 12 })).json()).toMatchObject({ number: 12, canChangeAt: null });
    expect((await put('Ana', '/account/number', { number: 10 })).json()).toMatchObject({ number: 10 });
    process.env.NUMBER_COOLDOWN_DAYS = '30';
    expect((await put('Ana', '/account/number', { number: 11 })).json().error).toBe('number_cooldown');
    await t.db.update(users).set({ numberChangedAt: new Date(Date.now() - 31 * DAY) }).where(eq(users.id, ids.Ana!));
    expect((await put('Ana', '/account/number', { number: 11 })).json()).toMatchObject({ number: 11 });
    delete process.env.NUMBER_COOLDOWN_DAYS;
  });

  it('60 dias sem jogar: aviso 7 dias antes e depois o número fica livre, com notificação', async () => {
    const now = Date.now();
    await t.db.update(users).set({ numberChangedAt: new Date(now - (NUMBER_IDLE_MS - NUMBER_WARNING_MS) - DAY) }).where(eq(users.id, ids.Ana!));
    expect(await releaseIdleNumbers(t.db, new Date(now))).toEqual({ warned: 1, released: 0 });
    expect(await releaseIdleNumbers(t.db, new Date(now))).toEqual({ warned: 0, released: 0 });
    expect(await releaseIdleNumbers(t.db, new Date(now + 8 * DAY))).toMatchObject({ released: 1 });
    expect((await t.db.select({ n: users.playerNumber }).from(users).where(eq(users.id, ids.Ana!)))[0]!.n).toBeNull();
    const kinds = (await t.db.select({ kind: notifications.kind, data: notifications.data }).from(notifications).where(eq(notifications.userId, ids.Ana!))).map((n) => [n.kind, n.data.number]);
    expect(kinds).toEqual(expect.arrayContaining([['number_expiring', 11], ['number_released', 11]]));
  });

  it('o 1: só o líder do mês anterior, e só se quiser; ele mantém o número dele', async () => {
    expect((await put('Caio', '/account/number-one', { use: true })).statusCode).toBe(403);
    const [season] = await t.db.insert(seasons).values({ name: 'Temporada 0', startsAt: new Date(Date.now() - 40 * DAY), endsAt: new Date(Date.now() - 10 * DAY), active: false }).returning({ id: seasons.id });
    await t.db.insert(seasonChampions).values({ seasonId: season!.id, board: 'stat:overall', position: 1, userId: ids.Caio!, name: 'Caio', value: 99 });
    await setNumber(t.db, ids.Caio!, 30);
    expect(await ticketNumber(t.db, ids.Caio!)).toEqual({ number: 30, style: 0 });
    expect((await put('Caio', '/account/number-one', { use: true })).json()).toMatchObject({ usingNumberOne: true, number: 30 });
    expect(await ticketNumber(t.db, ids.Caio!)).toEqual({ number: 1, style: 0 });
    expect((await put('Caio', '/account/number-style', { style: 2 })).json()).toMatchObject({ style: 2 });
    expect((await put('Caio', '/account/number-style', { style: 4 })).statusCode).toBe(400);
    expect(await ticketNumber(t.db, ids.Caio!)).toEqual({ number: 1, style: 2 });
  });
});
