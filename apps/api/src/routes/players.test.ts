// SPDX-License-Identifier: GPL-2.0-or-later
// Perfil público e histórico (OG-085): estatísticas por modo, histórico e partida detalhada.
import { signInternalRequest } from '@outgun/tickets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('perfil e histórico (OG-085)', () => {
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

    const send = (payload: unknown) => {
      const body = JSON.stringify(payload);
      const url = '/internal/matches';
      return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
    };
    const line = (slot: number, name: string, team: 0 | 1, frags: number, scoreDelta = 0) => ({
      slot, userId: ids[name], name, team, isBot: false, frags, kills: frags, deaths: 2, captures: team === 0 ? 1 : 0, playSeconds: 300, scoreDelta, negDelta: scoreDelta ? 2 : 0,
      stats: { assists: 1, shots: 40, hits: 10, flagsReturned: 0, carriersKilled: 1, accuracy: 0.25 },
    });
    const details = {
      reason: 'captureLimit', mapTime: 300, mapTitle: 'The Blunt',
      rules: { captureLimit: 1, winScoreDifference: 1, timeLimit: 0, extraTime: 0, extraTimePeriods: 1, suddenDeath: false },
      teams: [{ score: 1, kills: 5, shots: 40 }, { score: 0, kills: 3, shots: 30 }],
      captures: [{ time: 125, team: 0, capturer: 'Jogador1', assistant: null }],
      baseScore: [0, 0],
    };
    const base = { roomId: 'main', map: 'outgun1', startedAt: '2026-10-13T12:00:00.000Z', details };
    expect((await send({ ...base, serverMatchId: 'a', mode: 'casual', ranked: false, redScore: 1, blueScore: 0, endedAt: '2026-10-13T12:05:00.000Z', players: [line(0, 'Jogador1', 0, 5), line(8, 'Jogador2', 1, 3)] })).statusCode).toBe(201);
    expect((await send({ ...base, serverMatchId: 'b', roomId: 'ranked', mode: 'ranked', ranked: true, redScore: 0, blueScore: 0, endedAt: '2026-10-13T13:05:00.000Z', players: [line(0, 'Jogador1', 0, 7, 150), line(8, 'Jogador2', 1, 2, 1)] })).statusCode).toBe(201);
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('perfil público por nome (sem diferenciar maiúsculas e acentos), com totais por modo', async () => {
    const res = await app.inject('/players/jogador1');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ username: 'Jogador1' });
    expect(body.user.email).toBeUndefined();
    expect(body.totals.casual).toMatchObject({ matches: 1, wins: 1, losses: 0, draws: 0, frags: 5, kills: 5, captures: 1, assists: 1, shots: 40, hits: 10, playSeconds: 300 });
    expect(body.totals.ranked).toMatchObject({ matches: 1, wins: 0, draws: 1, frags: 7 });
    expect(body.ranking).toMatchObject({ score: 150, neg: 2, rank: 1, of: 1, matches: 1, minimumScore: 100 });
    expect(body.ranking.rating).toBeCloseTo(151 / 3);
    expect((await app.inject('/players/ninguem')).statusCode).toBe(404);
  });

  it('histórico: mais recentes primeiro, filtro por modo', async () => {
    const all = (await app.inject('/players/Jogador2/matches')).json();
    expect(all.total).toBe(2);
    expect(all.matches.map((m: { mode: string }) => m.mode)).toEqual(['ranked', 'casual']);
    expect(all.matches[1]).toMatchObject({ map: 'outgun1', redScore: 1, blueScore: 0, player: { team: 1, frags: 3 } });
    const casual = (await app.inject('/players/Jogador2/matches?mode=casual')).json();
    expect(casual.total).toBe(1);
  });

  it('partida por URL pública: regras, times, jogadores e capturas', async () => {
    const id = (await app.inject('/players/Jogador1/matches?mode=casual')).json().matches[0].id;
    const res = await app.inject(`/matches/${id}`);
    expect(res.statusCode).toBe(200);
    const m = res.json();
    expect(m.match).toMatchObject({ mode: 'casual', map: 'outgun1', roomId: 'main' });
    expect(m.details.captures).toEqual([{ time: 125, team: 0, capturer: 'Jogador1', assistant: null }]);
    expect(m.players.map((p: { username: string }) => p.username)).toEqual(['Jogador1', 'Jogador2']);
    expect(m.players[0].stats).toMatchObject({ assists: 1, accuracy: 0.25 });
    expect(m.replayUrl).toBeNull();
    expect((await app.inject('/matches/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });
});
