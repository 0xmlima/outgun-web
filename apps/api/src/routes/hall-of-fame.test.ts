// SPDX-License-Identifier: GPL-2.0-or-later
// Hall da fama (OG-268, RN-RKL-24): guardado na virada da temporada junto da classificação final;
// quadros com menos de 3 classificados mostram só os que houver; selos no perfil e no clã.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { clans, formatRatings, matches, matchPlayers, ratings, seasonChampions, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { activeSeason, closeSeason, rollSeason } from '../ranking.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

describe.skipIf(!pgAdminUrl)('hall da fama (OG-268)', () => {
  let t: TestDatabase;
  let app: App;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    const config = { ...loadConfig({}), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('guarda os 3 primeiros de cada quadro na virada; menos de 3, só os que houver', async () => {
    await rollSeason(t.db, new Date('2026-10-10T12:00:00Z')); // a temporada do seed vira "2026-10"
    const season = (await activeSeason(t.db))!.id;
    const ids = Object.fromEntries((await t.db.select({ id: users.id, name: users.username }).from(users)).map((u) => [u.name, u.id]));
    await t.db.insert(ratings).values([
      { userId: ids.Admin!, seasonId: season, score: 300, neg: 2, matches: 5 },
      { userId: ids.Jogador1!, seasonId: season, score: 200, neg: 9, matches: 5 },
      { userId: ids.Jogador2!, seasonId: season, score: 50, neg: 0, matches: 1 }, // abaixo do mínimo
    ]);
    await t.db.insert(formatRatings).values({ userId: ids.Jogador1!, seasonId: season, format: '3x3', score: 150, neg: 1, matches: 3 });
    const clan: Record<string, string> = {};
    for (const tag of ['nn', 'BC']) {
      const [c] = await t.db.insert(clans).values({ name: `Clã ${tag}`, nameKey: `cla ${tag.toLowerCase()}`, tag, tagKey: tag.toLowerCase() }).returning({ id: clans.id });
      clan[tag] = c!.id;
    }
    for (let i = 0; i < 3; i++) {
      const at = new Date('2026-10-11T12:00:00Z');
      await t.db.insert(matches).values({
        serverId: 'gs-1', serverMatchId: `w${i}`, seasonId: season, mode: 'ranked', ranked: true, map: 'outgun1', redScore: 1, blueScore: 0, startedAt: at, endedAt: at,
        format: '3x3', clanWar: true, redClanId: clan.nn!, blueClanId: clan.BC!,
      });
    }

    await rollSeason(t.db, new Date('2026-11-01T03:00:01Z'));
    const hall = (await app.inject('/hall-of-fame')).json();
    expect(hall.seasons).toHaveLength(1);
    const { boards, name, classic } = hall.seasons[0];
    expect([name, classic]).toEqual(['Temporada 1', true]);
    expect(boards.overall.map((c: { name: string; position: number }) => [c.position, c.name])).toEqual([
      [1, 'Admin'],
      [2, 'Jogador1'],
    ]);
    expect(boards['3x3']).toEqual([{ position: 1, name: 'Jogador1', clanName: null, clanTag: null, value: 151 / 2 }]);
    expect(boards['4x4']).toEqual([]);
    expect(boards.clans.map((c: { name: string; value: number }) => [c.name, c.value])).toEqual([
      ['nn', 9],
      ['BC', 0],
    ]);

    const profile = (await app.inject('/players/Jogador1')).json();
    expect(profile.titles).toEqual([
      { season: 'Temporada 1', board: '3x3', position: 1 },
      { season: 'Temporada 1', board: 'overall', position: 2 },
    ]);
    const page = (await app.inject('/clans/nn')).json();
    expect(page.clan.titles).toEqual([{ season: 'Temporada 1', board: 'clans', position: 1 }]);
  });

  it('desde novembro/2026: os 3 primeiros de cada stat principal do leaderboard (OG-354)', async () => {
    const november = (await activeSeason(t.db))!.id;
    const ids = Object.fromEntries((await t.db.select({ id: users.id, name: users.username }).from(users)).map((u) => [u.name, u.id]));
    // 5 ranqueadas de 10 min: Admin com mais abates, Jogador1 com mais capturas; Jogador2 só 4 (fora)
    for (let i = 0; i < 5; i++) {
      const at = new Date(`2026-11-1${i}T12:00:00Z`);
      const [m] = await t.db
        .insert(matches)
        .values({ serverId: 'gs-1', serverMatchId: `n${i}`, seasonId: november, mode: 'ranked', ranked: true, map: 'outgun1', redScore: 1, blueScore: 0, startedAt: at, endedAt: at })
        .returning({ id: matches.id });
      const line = (slot: number, name: string, team: number, kills: number, captures: number) => ({
        matchId: m!.id, slot, userId: ids[name]!, name, team, kills, deaths: 1, captures, playSeconds: 600, stats: { hits: 5, shots: 10 },
      });
      await t.db.insert(matchPlayers).values([line(0, 'Admin', 0, 9, 0), line(1, 'Jogador1', 1, 3, 2), ...(i < 4 ? [line(2, 'Jogador2', 1, 20, 5)] : [])]);
    }
    await rollSeason(t.db, new Date('2026-12-01T03:00:01Z'));
    const hall = (await app.inject('/hall-of-fame')).json();
    const nov = hall.seasons.find((x: { name: string }) => x.name === 'Temporada 2026-11');
    expect(nov.classic).toBe(false);
    expect(Object.keys(nov.boards)).toEqual(['stat:kills', 'stat:captures', 'stat:flagsReturned', 'stat:flagCarryingTime', 'stat:kd', 'stat:accuracy', 'clans']);
    expect(nov.boards['stat:kills'].map((c: { name: string; value: number }) => [c.name, c.value])).toEqual([['Admin', 9], ['Jogador1', 3]]);
    expect(nov.boards['stat:captures'][0]).toMatchObject({ position: 1, name: 'Jogador1', value: 2 });
    const titles = (await app.inject('/players/Jogador1')).json().titles;
    expect(titles).toContainEqual({ season: 'Temporada 2026-11', board: 'stat:captures', position: 1 });
    // regravar não duplica
    await t.db.transaction((tx) => closeSeason(tx, november));
    expect((await t.db.select().from(seasonChampions).where(eq(seasonChampions.seasonId, november))).filter((c) => c.board === 'stat:kills')).toHaveLength(2);
  });
});
