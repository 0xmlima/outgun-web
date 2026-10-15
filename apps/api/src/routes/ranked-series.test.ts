// SPDX-License-Identifier: GPL-2.0-or-later
// Formatos e séries do Ranked (OG-250, RN-RKL-01..03): cada jogo é uma ranqueada normal ligada à
// série; a série guarda o placar por lado; partidas sem formato continuam valendo.
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { matches, rankedSeries, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { validateMatch, type MatchResultBody } from './internal.js';

const SECRET = 'segredo-de-teste-0123456789';

const base = (id: string): MatchResultBody => ({
  serverMatchId: id,
  roomId: 'ranked',
  mode: 'ranked',
  ranked: true,
  map: 'outgun1',
  redScore: 1,
  blueScore: 0,
  startedAt: '2026-10-15T12:00:00Z',
  endedAt: '2026-10-15T12:10:00Z',
  players: [],
});
const series = (gameNo: number, redWins: number, blueWins: number, finished: boolean, winner: 0 | 1 | null) => ({
  serverSeriesId: 'ranked-x-s1',
  bestOf: 3 as const,
  gameNo,
  redWins,
  blueWins,
  finished,
  winner,
});

it('valida formato e placar da série', () => {
  expect(validateMatch({ ...base('a'), format: '3x3', series: series(2, 2, 0, true, 0) })).toBeUndefined();
  expect(validateMatch({ ...base('a'), format: '3x3', series: series(2, 1, 1, false, null) })).toBeUndefined();
  expect(validateMatch({ ...base('a'), series: series(1, 1, 0, false, null) })).toBe('series without format');
  expect(validateMatch({ ...base('a'), mode: 'casual', ranked: false, format: '3x3' })).toBe('format only in ranked mode');
  expect(validateMatch({ ...base('a'), format: '3x3', series: series(2, 2, 0, false, null) })).toBe('invalid series state');
  expect(validateMatch({ ...base('a'), format: '3x3', series: series(4, 2, 1, true, 0) })).toBe('invalid series score');
});

describe.skipIf(!pgAdminUrl)('séries do Ranked na API (OG-250)', () => {
  let t: TestDatabase;
  let app: App;
  let player: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    player = (await t.db.select({ id: users.id }).from(users).where(eq(users.username, 'Jogador1')))[0]!.id;
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const post = (payload: unknown) => {
    const url = '/internal/matches';
    const body = JSON.stringify(payload);
    return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
  };
  const game = (id: string, s: ReturnType<typeof series>) => ({
    ...base(id),
    format: '3x3',
    series: s,
    players: [{ slot: 0, userId: player, name: 'Jogador1', team: 0, isBot: false, frags: 0, kills: 0, deaths: 0, captures: 0, playSeconds: 600, scoreDelta: 10, negDelta: 1, stats: {} }],
  });

  it('md3 em 2-1: três jogos ranqueados ligados à mesma série, que guarda o vencedor', async () => {
    expect((await post(game('g1', series(1, 1, 0, false, null)))).statusCode).toBe(201);
    expect((await post(game('g2', series(2, 1, 1, false, null)))).statusCode).toBe(201);
    expect((await post(game('g3', series(3, 1, 2, true, 1)))).statusCode).toBe(201);
    // reenvio de um jogo antigo não volta o placar
    expect((await post(game('g2', series(2, 1, 1, false, null)))).statusCode).toBe(200);
    const [s] = await t.db.select().from(rankedSeries);
    expect(s).toMatchObject({ format: '3x3', bestOf: 3, games: 3, redWins: 1, blueWins: 2, winner: 1, roomId: 'ranked' });
    expect(s!.finishedAt).toEqual(new Date('2026-10-15T12:10:00Z'));
    const games = await t.db.select({ gameNo: matches.gameNo, ranked: matches.ranked, format: matches.format }).from(matches).where(eq(matches.seriesId, s!.id));
    expect(games.sort((a, b) => a.gameNo! - b.gameNo!)).toEqual([1, 2, 3].map((gameNo) => ({ gameNo, ranked: true, format: '3x3' })));
  });

  it('partida sem formato continua aceita e fica sem série', async () => {
    expect((await post({ ...base('antiga'), players: [] })).statusCode).toBe(201);
    const [m] = await t.db.select().from(matches).where(eq(matches.serverMatchId, 'antiga'));
    expect(m).toMatchObject({ format: null, seriesId: null, gameNo: null });
  });
});
