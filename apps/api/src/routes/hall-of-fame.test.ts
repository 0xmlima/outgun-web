// SPDX-License-Identifier: GPL-2.0-or-later
// Hall da fama (OG-268, RN-RKL-24): guardado na virada da temporada junto da classificação final;
// quadros com menos de 3 classificados mostram só os que houver; selos no perfil e no clã.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { clans, formatRatings, matches, ratings, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { activeSeason, rollSeason } from '../ranking.js';
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
    const { boards, name } = hall.seasons[0];
    expect(name).toBe('Temporada 1');
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
});
