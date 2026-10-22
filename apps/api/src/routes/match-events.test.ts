// SPDX-License-Identifier: GPL-2.0-or-later
// Eventos da ranqueada (OG-362): gravados à parte, devolvidos em ordem; reenvio não duplica.
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { matchEventPlayers, matchPlayers, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('eventos da ranqueada (OG-362)', () => {
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

  const internal = (payload: unknown) => {
    const url = '/internal/matches';
    const body = JSON.stringify(payload);
    return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
  };
  const player = (slot: number, name: string) => ({
    slot, userId: ids[name], name, team: slot % 2, isBot: false, frags: 0, kills: 0, deaths: 0, captures: 0, playSeconds: 600, scoreDelta: 0, negDelta: 0, stats: {},
  });
  const match = (id: string, ranked: boolean, events?: unknown) => ({
    serverMatchId: id, roomId: ranked ? 'ranked' : 'main', mode: ranked ? 'ranked' : 'casual', ranked, map: 'outgun1', redScore: 1, blueScore: 0,
    startedAt: '2026-10-13T12:00:00.000Z', endedAt: '2026-10-13T12:10:00.000Z', players: [player(0, 'Jogador1'), player(1, 'Jogador2')], ...(events ? { events } : {}),
  });
  const log = () => ({
    players: [
      { slot: 0, userId: ids.Jogador1, name: 'Jogador1', team: 0, bot: false },
      { slot: 1, userId: ids.Jogador2, name: 'Jogador2', team: 1, bot: false },
      { slot: 1, name: 'Convidado', team: 1, bot: false },
    ],
    events: [
      [52, 'take', 0, 1],
      [80, 'kill', 1, 0, 3, 2, 1, 'rocket'],
      [80, 'drop', 0, 1],
      [131, 'kill', 0, 2, 1, 1, 0, 'deathbringer'],
      [400, 'capture', 1, 0],
    ],
  });

  it('grava e devolve os eventos em ordem; reenvio não duplica', async () => {
    const first = await internal(match('e-1', true, log()));
    expect(first.statusCode).toBe(201);
    const again = await internal(match('e-1', true, log()));
    expect(again.json()).toEqual({ id: first.json().id, duplicate: true });
    const r = (await app.inject(`/matches/${first.json().id}/events`)).json();
    expect(r.events).toEqual(log().events);
    expect(r.players.map((p: { name: string; username: string | null }) => [p.name, p.username])).toEqual([['Jogador1', 'Jogador1'], ['Jogador2', 'Jogador2'], ['Convidado', null]]);
    expect(await t.db.select().from(matchEventPlayers).where(eq(matchEventPlayers.matchId, first.json().id))).toHaveLength(3);
    // OG-363: os stats de momento vão para quem está nos eventos e no fim da partida
    const stats = await t.db.select({ name: matchPlayers.name, stats: matchPlayers.stats }).from(matchPlayers).where(eq(matchPlayers.matchId, first.json().id));
    expect(stats.find((p) => p.name === 'Jogador2')!.stats).toMatchObject({ multiKills: 0, trades: 0, firstKills: 1 });
    expect(stats.find((p) => p.name === 'Jogador1')!.stats).toMatchObject({ firstKills: 0 });
  });

  it('partida sem registro devolve null; eventos só na ranqueada e com jogadores válidos', async () => {
    const plain = await internal(match('e-2', true));
    expect((await app.inject(`/matches/${plain.json().id}/events`)).json()).toEqual({ players: [], events: null });
    expect((await internal(match('e-3', false, log()))).statusCode).toBe(422);
    const bad = log();
    bad.events.push([500, 'kill', 0, 9, 0, 0, 0, 'rocket']);
    expect((await internal(match('e-4', true, bad))).statusCode).toBe(422);
  });
});
