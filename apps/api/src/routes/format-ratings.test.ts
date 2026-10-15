// SPDX-License-Identifier: GPL-2.0-or-later
// Rating por formato (OG-258, RN-RKL-13, D-42): cada formato tem rating próprio; o geral soma os três
// mais o acumulado sem formato, e partidas sem formato só aparecem em "Todos".
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { formatRatings, ratings, rooms, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('rating por formato (OG-258)', () => {
  let t: TestDatabase;
  let app: App;
  let ids: Record<string, string>;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.insert(rooms).values({ id: 'r3', name: 'Ranked 3x3', mode: 'ranked', preset: 'ranked', maxPlayers: 6, format: '3x3', bestOf: 1 });
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
  const match = (id: string, format: '3x3' | '4x4' | '5x5' | undefined, players: ReturnType<typeof player>[]) => ({
    serverMatchId: id, roomId: format === '3x3' ? 'r3' : 'ranked', mode: 'ranked', ranked: true, map: 'outgun1', redScore: 1, blueScore: 0,
    startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date().toISOString(), players, ...(format ? { format } : {}),
  });
  const general = async (name: string) => (await t.db.select().from(ratings).where(eq(ratings.userId, ids[name]!)))[0]!;
  const perFormat = async (name: string) => t.db.select().from(formatRatings).where(eq(formatRatings.userId, ids[name]!));

  it('o geral é a soma dos formatos mais o histórico sem formato', async () => {
    expect((await internal('/internal/matches', match('old', undefined, [player(0, 'Jogador1', 50, 2), player(1, 'Jogador2', 10, 1)]))).statusCode).toBe(201);
    expect((await internal('/internal/matches', match('a', '3x3', [player(0, 'Jogador1', 120, 3), player(1, 'Jogador2', 40, 5)]))).statusCode).toBe(201);
    expect((await internal('/internal/matches', match('b', '5x5', [player(0, 'Jogador1', 30, 1), player(1, 'Jogador2', 200, 2)]))).statusCode).toBe(201);
    // quem saiu de uma sala 3x3: soma no 3x3 e no geral, sem contar partida
    const d = { deltaId: 'r3-d1', roomId: 'r3', userId: ids.Jogador1, scoreDelta: 7, negDelta: 1 };
    expect((await internal('/internal/rating-deltas', d)).json()).toEqual({ applied: true });

    for (const name of ['Jogador1', 'Jogador2']) {
      const g = await general(name);
      const f = await perFormat(name);
      const old = name === 'Jogador1' ? { score: 50, neg: 2, matches: 1 } : { score: 10, neg: 1, matches: 1 };
      expect(g.score).toBe(old.score + f.reduce((s, r) => s + r.score, 0));
      expect(g.neg).toBe(old.neg + f.reduce((s, r) => s + r.neg, 0));
      expect(g.matches).toBe(old.matches + f.reduce((s, r) => s + r.matches, 0));
    }
    expect((await perFormat('Jogador1')).find((r) => r.format === '3x3')).toMatchObject({ score: 127, neg: 4, matches: 1 });
    expect((await perFormat('Jogador1')).some((r) => r.format === '4x4')).toBe(false);
  });

  it('leaderboard por formato e geral', async () => {
    const board = async (q: string) => (await app.inject(`/leaderboard${q}`)).json().entries.map((e: { username: string; score: number }) => [e.username, e.score]);
    expect(await board('?format=3x3')).toEqual([['Jogador1', 127]]);
    expect(await board('?format=5x5')).toEqual([['Jogador2', 200]]);
    expect(await board('?format=4x4')).toEqual([]);
    expect(await board('')).toEqual([['Jogador2', 250], ['Jogador1', 207]]);
    const overall = (await app.inject('/leaderboard/overall?format=3x3')).json();
    expect(overall.entries.map((e: { username: string }) => e.username)).toEqual(['Jogador1']);
  });

  it('perfil e partidas filtrados: sem formato só em "Todos"', async () => {
    const profile = (await app.inject('/players/Jogador1?format=3x3')).json();
    expect(profile.ranking).toMatchObject({ score: 127, neg: 4, matches: 1, rank: 1, of: 1 });
    expect(profile.totals.ranked.matches).toBe(1);
    expect((await app.inject('/players/Jogador1')).json().totals.ranked.matches).toBe(3);

    const list = async (q: string) => (await app.inject(`/players/Jogador1/matches${q}`)).json().matches.map((m: { format: string | null }) => m.format);
    expect(await list('?format=3x3')).toEqual(['3x3']);
    expect(await list('?format=4x4')).toEqual([]);
    expect((await list('')).sort()).toEqual(['3x3', '5x5', null].sort());
  });
});
