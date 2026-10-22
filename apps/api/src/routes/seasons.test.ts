// SPDX-License-Identifier: GPL-2.0-or-later
// Temporadas mensais (OG-267, RN-RKL-22/23, D-48): virada no dia 1 às 00:00 de Brasília, virada
// repetida, partida que termina depois da virada e o ranking geral (soma das temporadas).
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { matches, ratings, seasons, seasonStandings, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { monthStart, rollSeason, seasonMonth } from '../ranking.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

it('mês da temporada no horário de Brasília (UTC-3)', () => {
  expect(seasonMonth(new Date('2026-11-01T02:59:59Z'))).toBe('2026-10');
  expect(seasonMonth(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
  expect(seasonMonth(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12');
  expect(monthStart('2026-11').toISOString()).toBe('2026-11-01T03:00:00.000Z');
});

describe.skipIf(!pgAdminUrl)('temporadas mensais (OG-267)', () => {
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
  const rankedMatch = (id: string, startedAt: string, endedAt: string, score: number, neg: number) => ({
    serverMatchId: id,
    roomId: 'ranked',
    mode: 'ranked',
    ranked: true,
    map: 'outgun1',
    redScore: 1,
    blueScore: 0,
    startedAt,
    endedAt,
    players: [{ slot: 0, userId: ids.Jogador1, name: 'Jogador1', team: 0, isBot: false, frags: 0, kills: 0, deaths: 0, captures: 0, playSeconds: 600, scoreDelta: score, negDelta: neg, stats: {} }],
  });
  const active = async () => (await t.db.select().from(seasons).where(eq(seasons.active, true)))[0]!;

  it('a temporada antiga sem mês vira a do mês corrente, sem virar', async () => {
    const before = await active();
    expect(await rollSeason(t.db, new Date('2026-10-20T12:00:00Z'))).toBeUndefined();
    expect(await active()).toMatchObject({ id: before.id, month: '2026-10' });
  });

  it('no fim do mês fecha a temporada, guarda a classificação e abre a nova; virada repetida não cria outra', async () => {
    // outubro/2026 é a última temporada do ranking por score/neg (D-66): os dados já estão guardados
    const october = await active();
    await t.db.insert(ratings).values({ userId: ids.Jogador1!, seasonId: october.id, score: 150, neg: 2, matches: 1 });
    expect(await rollSeason(t.db, new Date('2026-11-01T02:59:00Z'))).toBeUndefined();
    const november = await rollSeason(t.db, new Date('2026-11-01T03:00:30Z'));
    expect(november).toMatchObject({ name: 'Temporada 2026-11' });
    expect(await rollSeason(t.db, new Date('2026-11-01T03:01:00Z'))).toBeUndefined();
    await Promise.all([rollSeason(t.db, new Date('2026-11-02T00:00:00Z')), rollSeason(t.db, new Date('2026-11-02T00:00:00Z'))]);
    expect((await t.db.select().from(seasons).where(eq(seasons.month, '2026-11'))).length).toBe(1);

    const closed = (await t.db.select().from(seasons).where(eq(seasons.id, october.id)))[0]!;
    expect(closed).toMatchObject({ active: false, endsAt: new Date('2026-11-01T03:00:00Z') });
    expect(await t.db.select().from(seasonStandings).where(eq(seasonStandings.seasonId, october.id))).toEqual([
      expect.objectContaining({ userId: ids.Jogador1, position: 1, score: 150, neg: 2, matches: 1 }),
    ]);
    expect((await app.inject(`/leaderboard?season=${october.id}`)).json()).toMatchObject({ total: 1, entries: [{ username: 'Jogador1', position: 1 }] });
    expect((await app.inject('/leaderboard')).json()).toMatchObject({ season: { name: 'Temporada 2026-11' }, total: 0 });
  });

  it('partida que começou antes da virada e terminou depois fica na temporada em que começou', async () => {
    const october = (await t.db.select().from(seasons).where(eq(seasons.month, '2026-10')))[0]!;
    const res = await internal('/internal/matches', rankedMatch('o-2', '2026-11-01T02:55:00Z', '2026-11-01T03:05:00Z', 0, 0));
    expect(res.statusCode).toBe(201);
    expect((await t.db.select({ seasonId: matches.seasonId }).from(matches).where(eq(matches.id, res.json().id)))[0]).toEqual({ seasonId: october.id });
  });
});
