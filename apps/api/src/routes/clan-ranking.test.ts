// SPDX-License-Identifier: GPL-2.0-or-later
// Ranking de clãs (OG-274, RN-CLA-07, D-47): vitória 3, empate 1, desempate por saldo de capturas,
// mínimo de 3 partidas clã x clã; por temporada e no geral.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { clans, matches } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { activeSeason, startSeason } from '../ranking.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

describe.skipIf(!pgAdminUrl)('ranking de clãs (OG-274)', () => {
  let t: TestDatabase;
  let app: App;
  const clan: Record<string, string> = {};
  let n = 0;

  const war = async (seasonId: number, red: string, blue: string, redScore: number, blueScore: number) => {
    const at = new Date();
    await t.db.insert(matches).values({
      serverId: 'gs-1', serverMatchId: `m${n++}`, seasonId, mode: 'ranked', ranked: true, map: 'outgun1', redScore, blueScore, startedAt: at, endedAt: at,
      format: '3x3', clanWar: true, redClanId: clan[red]!, blueClanId: clan[blue]!,
    });
  };

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    for (const tag of ['AA', 'BB', 'CC', 'DD']) {
      const [c] = await t.db.insert(clans).values({ name: `Clã ${tag}`, nameKey: `cla ${tag.toLowerCase()}`, tag, tagKey: tag.toLowerCase() }).returning({ id: clans.id });
      clan[tag] = c!.id;
    }
    const config = { ...loadConfig({}), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const board = async (q = '') => (await app.inject(`/leaderboard/clans${q}`)).json();
  const rows = async (q = '') => (await board(q)).entries.map((e: { tag: string; points: number; captureDiff: number }) => [e.tag, e.points, e.captureDiff]);

  it('pontos, desempate por saldo de capturas e mínimo de 3 partidas', async () => {
    const s1 = (await activeSeason(t.db))!.id;
    await war(s1, 'AA', 'BB', 3, 0);
    await war(s1, 'AA', 'CC', 1, 0);
    await war(s1, 'AA', 'BB', 1, 1);
    await war(s1, 'BB', 'CC', 2, 1);
    await war(s1, 'BB', 'DD', 2, 0);
    await war(s1, 'DD', 'BB', 1, 0);
    await war(s1, 'DD', 'AA', 1, 0);
    // AA = V,V,E,D: 7 pts, saldo +3; BB = D,E,V,V,D: 7 pts, saldo -1; DD = D,V,V: 6 pts, saldo 0; CC: 2 partidas, fora
    expect(await rows()).toEqual([
      ['AA', 7, 3],
      ['BB', 7, -1],
      ['DD', 6, 0],
    ]);
    expect((await board()).minimumMatches).toBe(3);
  });

  it('o geral soma as temporadas; temporada nova começa do zero', async () => {
    const s2 = (await startSeason(t.db, 'Temporada 2')).id;
    await war(s2, 'CC', 'DD', 2, 0);
    expect(await rows()).toEqual([]);
    const overall = await rows('?overall=true');
    expect(overall.map((r: unknown[]) => r[0])).toEqual(['AA', 'BB', 'DD', 'CC']); // CC entra no geral: D, D, V = 3 pts em 3 partidas
    expect((await board('?season=999')).error).toBe('season_not_found');
  });
});
