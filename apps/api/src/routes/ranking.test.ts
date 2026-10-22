// SPDX-License-Identifier: GPL-2.0-or-later
// Ranking por score/neg descontinuado (OG-350, D-66): partidas e deltas não somam mais, não há
// opção de ficar de fora (RN-SKL-06) e o ticket leva o rating de habilidade OpenSkill.
import { fromJwks, signInternalRequest, verifyTicket } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { ratings, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('ranking por score/neg descontinuado (OG-350)', () => {
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

  it('ranqueada e deltas de quem saiu não somam mais score/neg', async () => {
    const body = match('r-1', true, [player(0, 'Jogador1', 120, 3), player(1, 'Jogador2', -2, 7)]);
    expect((await internal('/internal/matches', body)).statusCode).toBe(201);
    const d = { deltaId: 'ranked-x-d1', roomId: 'ranked', userId: ids.Jogador1, scoreDelta: 10, negDelta: 1 };
    expect((await internal('/internal/rating-deltas', d)).json()).toEqual({ applied: false });
    expect(await rating('Jogador1')).toBeUndefined();
    // Casual continua sem poder trazer deltas
    expect((await internal('/internal/matches', match('c-2', false, [player(0, 'Jogador1', 5, 0)]))).statusCode).toBe(422);
  });

  it('ticket leva o rating de habilidade e o nível do bot; não há opção de ficar de fora', async () => {
    const keys = fromJwks((await app.inject('/.well-known/jwks.json')).json());
    const cookie = await login('Jogador1');
    const res = await app.inject({ method: 'POST', url: '/rooms/ranked/join', payload: {}, headers: { origin: ORIGIN, cookie } });
    const r = verifyTicket(res.json().ticket, keys, 'ranked');
    if (!r.ok) throw new Error(r.reason);
    // Jogador1 venceu a r-1 (1 × 0): primeira ranqueada, rating do OpenSkill, 1º de 2
    expect(r.claims.skill).toMatchObject({ rank: 1, of: 2 });
    expect(r.claims.skill!.mu).toBeGreaterThan(25);
    expect(r.claims.botLevel).toBe(3);
    expect((await app.inject({ url: '/account/ranking', headers: { cookie } })).statusCode).toBe(404);
  });

  it('opções do jogador na conta (OG-068): grava, devolve e espelha as favoritas', async () => {
    const cookie = await login('Jogador2');
    const get = () => app.inject({ url: '/account/settings', headers: { cookie } });
    expect((await get()).json()).toEqual({ settings: {}, updatedAt: null });
    const settings = { locale: 'fi', favoriteColors: [3, 1, 99, 2], showNames: 'always' };
    const put = await app.inject({ method: 'PUT', url: '/account/settings', payload: { settings }, headers: { origin: ORIGIN, cookie } });
    expect(put.json()).toEqual({ ok: true });
    expect((await get()).json().settings).toEqual(settings);
    const [profile] = await t.sql`SELECT favorite_colors FROM player_profiles WHERE user_id = ${ids.Jogador2!}`;
    expect(profile?.favorite_colors).toEqual([3, 1, 2]);
    const big = await app.inject({ method: 'PUT', url: '/account/settings', payload: { settings: { x: 'a'.repeat(17_000) } }, headers: { origin: ORIGIN, cookie } });
    expect(big.statusCode).toBe(413);
    expect((await app.inject({ url: '/account/settings' })).statusCode).toBe(401);
  });
});
