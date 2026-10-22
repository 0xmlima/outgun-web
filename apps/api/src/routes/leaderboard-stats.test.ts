// SPDX-License-Identifier: GPL-2.0-or-later
// Leaderboard de atributos (OG-352, RN-LDB): forma de ranquear de cada stat, mínimo de partidas,
// filtros de temporada e formato, e o que fica fora (Casual, bots, abates em bot).
import { signInternalRequest } from '@outgun/tickets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { rooms, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { RANKED_ROCKET_DAMAGE } from '../leaderboard.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('leaderboard de atributos (OG-352)', () => {
  let t: TestDatabase;
  let app: App;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.insert(rooms).values({ id: 'r3', name: 'Ranked 3x3', mode: 'ranked', preset: 'ranked', maxPlayers: 6, format: '3x3', bestOf: 1 });
    for (const name of ['Ana', 'Bia', 'Caio']) {
      const [u] = await t.db.insert(users).values({ username: name, usernameKey: usernameKey(name), email: `${name}@outgun.local`, emailKey: `${name}@outgun.local`, passwordHash: 'x' }).returning({ id: users.id });
      ids[name] = u!.id;
    }
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });

    // Ana: 5 ranqueadas 3x3 de 10 min; Bia: 5 de 5 min sem formato; Caio: só 4 (fora pelo mínimo)
    let n = 0;
    const send = async (players: object[], ranked = true, format?: '3x3') => {
      const body = JSON.stringify({
        serverMatchId: `m${++n}`, roomId: ranked ? (format ? 'r3' : 'ranked') : 'main', mode: ranked ? 'ranked' : 'casual', ranked, map: 'outgun1', redScore: 1, blueScore: 0,
        startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date().toISOString(), players, ...(format ? { format } : {}),
      });
      const res = await app.inject({ method: 'POST', url: '/internal/matches', payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', '/internal/matches', body) } });
      expect(res.statusCode).toBe(201);
    };
    const line = (slot: number, name: string, team: 0 | 1, playSeconds: number, kills: number, deaths: number, stats: Record<string, number>) => ({
      slot, userId: ids[name], name, team, isBot: false, frags: kills, kills, deaths, captures: stats.captures ?? 0, playSeconds, scoreDelta: 0, negDelta: 0, stats,
    });
    for (let i = 0; i < 5; i++) {
      await send([line(0, 'Ana', 0, 600, 6, 2, { botKills: 1, hits: 10, shots: 40, flagCarryingTime: 30, consecutiveKills: i, lifetime: 500 })], true, '3x3');
      await send([line(0, 'Bia', 1, 300, 4, 0, { hits: 10, shots: 20, flagsReturned: 1, consecutiveKills: 2, lifetime: 280 })]);
    }
    for (let i = 0; i < 4; i++) await send([line(0, 'Caio', 0, 600, 30, 0, { hits: 50, shots: 50 })]);
    // Casual não conta
    await send([line(0, 'Bia', 1, 600, 100, 0, {})], false);
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const board = async (stat: string, q = '') => (await app.inject(`/leaderboard/stats/${stat}?${q}`)).json();
  const values = async (stat: string, q = '') => (await board(stat, q)).entries.map((e: { username: string; value: number }) => [e.username, Number(e.value.toFixed(4))]);

  it('volume por 10 min jogados; abates em bot não contam; mínimo de 5 partidas', async () => {
    // Ana: (6 − 1) × 5 = 25 abates em 50 min = 5 por 10 min; Bia: 20 em 25 min = 8
    expect(await values('kills')).toEqual([['Bia', 8], ['Ana', 5]]);
    expect(await values('flagCarryingTime')).toEqual([['Ana', 30], ['Bia', 0]]);
    expect(await values('damage')).toEqual([['Bia', (50 * RANKED_ROCKET_DAMAGE * 600) / 1500], ['Ana', (50 * RANKED_ROCKET_DAMAGE * 600) / 3000]]);
  });

  it('razão, recorde e média no período', async () => {
    expect(await values('kd')).toEqual([['Bia', 20], ['Ana', 2.5]]);
    expect(await values('accuracy')).toEqual([['Bia', 0.5], ['Ana', 0.25]]);
    expect(await values('killStreak')).toEqual([['Ana', 4], ['Bia', 2]]);
    // Ana: 2500 s / (10 mortes + 5) ; Bia: 1400 / (0 + 5)
    expect(await values('averageLifetime')).toEqual([['Bia', 280], ['Ana', Number((2500 / 15).toFixed(4))]]);
  });

  it('filtro de formato, "sempre" e a posição do jogador', async () => {
    expect(await values('kills', 'format=3x3')).toEqual([['Ana', 5]]);
    expect(await values('kills', 'overall=true')).toEqual([['Bia', 8], ['Ana', 5]]);
    const r = await board('kills', 'player=ana&limit=1');
    expect([r.total, r.entries.length, r.me?.position, r.minimumMatches]).toEqual([2, 1, 2, 5]);
    expect((await board('kills', 'player=Caio')).me).toBeNull();
  });

  it('visão geral: os 3 primeiros de cada stat, com os principais marcados', async () => {
    const overview = (await app.inject('/leaderboard/stats')).json();
    expect(overview.stats.filter((s: { main: boolean }) => s.main).map((s: { stat: string }) => s.stat)).toEqual(['kills', 'captures', 'flagsReturned', 'flagCarryingTime', 'kd', 'accuracy']);
    expect(overview.stats).toHaveLength(13);
    expect(overview.stats[0].entries.map((e: { username: string }) => e.username)).toEqual(['Bia', 'Ana']);
    expect((await app.inject('/leaderboard/stats/nada')).statusCode).toBe(400);
  });
});
