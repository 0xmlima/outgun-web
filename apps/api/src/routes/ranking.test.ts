// SPDX-License-Identifier: GPL-2.0-or-later
// Ranking e temporadas (OG-084): deltas idempotentes, Casual não altera, leaderboard e opt-out.
import { fromJwks, signInternalRequest, verifyTicket } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { ratings, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { startSeason } from '../ranking.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('ranking e temporadas (OG-084)', () => {
  let t: TestDatabase;
  let app: App;
  let ids: Record<string, string>;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    ids = Object.fromEntries((await t.db.select({ id: users.id, name: users.username }).from(users)).map((u) => [u.name, u.id]));
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const internal = (url: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
  };
  const player = (slot: number, name: string, scoreDelta: number, negDelta: number) => ({
    slot, userId: ids[name], name, team: slot % 2, isBot: false, frags: 0, kills: 0, deaths: 0, captures: 0, playSeconds: 600, scoreDelta, negDelta, stats: {},
  });
  const match = (id: string, ranked: boolean, players: ReturnType<typeof player>[]) => ({
    serverMatchId: id, roomId: ranked ? 'ranked' : 'main', mode: ranked ? 'ranked' : 'casual', ranked, map: 'outgun1', redScore: 1, blueScore: 0,
    startedAt: '2026-10-13T12:00:00.000Z', endedAt: '2026-10-13T12:10:00.000Z', players,
  });
  const rating = async (name: string) => (await t.db.select().from(ratings).where(eq(ratings.userId, ids[name]!)))[0];
  const login = async (username: string) => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'outgun-dev' }, headers: { origin: ORIGIN } });
    return `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;
  };

  it('partida ranqueada soma os deltas na temporada; reenvio não duplica', async () => {
    const body = match('r-1', true, [player(0, 'Jogador1', 120, 3), player(1, 'Jogador2', -2, 7)]);
    expect((await internal('/internal/matches', body)).statusCode).toBe(201);
    expect((await internal('/internal/matches', body)).statusCode).toBe(200);
    expect(await rating('Jogador1')).toMatchObject({ score: 120, neg: 3, matches: 1 });
    expect(await rating('Jogador2')).toMatchObject({ score: -2, neg: 7, matches: 1 });
  });

  it('partida Casual não altera o ranking (e não pode trazer deltas)', async () => {
    expect((await internal('/internal/matches', match('c-1', false, [player(0, 'Jogador1', 0, 0)]))).statusCode).toBe(201);
    expect((await internal('/internal/matches', match('c-2', false, [player(0, 'Jogador1', 5, 0)]))).statusCode).toBe(422);
    expect(await rating('Jogador1')).toMatchObject({ score: 120, neg: 3, matches: 1 });
  });

  it('deltas de quem saiu: somados uma vez só, sem contar partida', async () => {
    const d = { deltaId: 'ranked-x-d1', roomId: 'ranked', userId: ids.Jogador1, scoreDelta: 10, negDelta: 1 };
    expect((await internal('/internal/rating-deltas', d)).json()).toEqual({ applied: true });
    expect((await internal('/internal/rating-deltas', d)).json()).toEqual({ applied: false });
    expect(await rating('Jogador1')).toMatchObject({ score: 130, neg: 4, matches: 1 });
  });

  it('leaderboard: rating = (score+1)/(neg+1), mínimo de 100, desempate por score', async () => {
    await internal('/internal/matches', match('r-2', true, [player(0, 'Admin', 299, 2), player(1, 'Jogador2', 100, 0)]));
    // Admin 299/2 → 100; Jogador2 98/7 → fora (score < 100); Jogador1 130/4 → 26,2
    const res = await app.inject('/leaderboard');
    expect(res.statusCode).toBe(200);
    const { season, total, entries } = res.json();
    expect(season).toMatchObject({ active: true });
    expect(total).toBe(2);
    expect(entries.map((e: { username: string; position: number }) => [e.position, e.username])).toEqual([[1, 'Admin'], [2, 'Jogador1']]);
    expect(entries[0].rating).toBeCloseTo(100);
  });

  it('ticket leva o ranking da conta (força no time e participação); opt-out vale na próxima entrada', async () => {
    const keys = fromJwks((await app.inject('/.well-known/jwks.json')).json());
    const cookie = await login('Jogador1');
    const join = async () => {
      const res = await app.inject({ method: 'POST', url: '/rooms/ranked/join', payload: {}, headers: { origin: ORIGIN, cookie } });
      const r = verifyTicket(res.json().ticket, keys, 'ranked');
      if (!r.ok) throw new Error(r.reason);
      return r.claims.rating;
    };
    expect(await join()).toEqual({ score: 130, neg: 4, participate: true, rank: 2, of: 2 });
    const off = await app.inject({ method: 'PUT', url: '/account/ranking', payload: { participate: false }, headers: { origin: ORIGIN, cookie } });
    expect(off.json()).toEqual({ participate: false });
    expect((await join())?.participate).toBe(false);
    expect((await app.inject({ url: '/account/ranking', headers: { cookie } })).json()).toMatchObject({ rank: 2, participate: false });
  });

  it('nova temporada: ranking recomeça; a anterior continua consultável', async () => {
    const old = (await app.inject('/leaderboard')).json().season.id;
    const season = await startSeason(t.db, 'Temporada 2');
    expect((await app.inject('/leaderboard')).json()).toMatchObject({ season: { id: season.id, active: true }, total: 0, entries: [] });
    expect((await app.inject(`/leaderboard?season=${old}`)).json().total).toBe(2);
    const list = (await app.inject('/seasons')).json().seasons;
    expect(list.filter((s: { active: boolean }) => s.active)).toHaveLength(1);
    await internal('/internal/matches', match('r-3', true, [player(0, 'Jogador1', 5, 1)]));
    const rows = await t.db.select().from(ratings).where(eq(ratings.userId, ids.Jogador1!));
    expect(rows.find((r) => r.seasonId === season.id)).toMatchObject({ score: 5, neg: 1 });
  });
});
