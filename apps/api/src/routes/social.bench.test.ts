// SPDX-License-Identifier: GPL-2.0-or-later
// Medição do OG-211: p95 das rotas sociais com 100 mil partidas sintéticas (16 jogadores cada, 2 mil
// contas). Fora da suíte normal: SOCIAL_BENCH=1 pnpm --filter @outgun/api exec vitest run social.bench
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateDown, migrateUp } from '../db/migrate.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const MATCHES = 100_000;
const ACCOUNTS = 2_000;
const RUNS = 200;

describe.skipIf(!pgAdminUrl || !process.env.SOCIAL_BENCH)('API social: desempenho (OG-211)', () => {
  let t: TestDatabase;
  let app: App;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.execute(sql`
      INSERT INTO users (username, username_key, email, email_key, password_hash, clan_tag)
      SELECT 'b' || i, 'b' || i, 'b' || i || '@x', 'b' || i || '@x', 'x', CASE WHEN i % 10 = 0 THEN 'C' || (i % 7) END
      FROM generate_series(1, ${ACCOUNTS}) i`);
    await t.db.execute(sql`
      INSERT INTO matches (id, server_id, server_match_id, room_id, mode, ranked, map, red_score, blue_score, started_at, ended_at, season_id)
      SELECT gen_random_uuid(), 'gs-1', 'm' || i, 'main', CASE WHEN i % 3 = 0 THEN 'ranked' ELSE 'casual' END::game_mode, i % 3 = 0, 'outgun1',
        i % 4, (i * 7) % 4, now() - (i || ' minutes')::interval - interval '5 minutes', now() - (i || ' minutes')::interval,
        CASE WHEN i % 3 = 0 THEN (SELECT id FROM seasons WHERE active) END
      FROM generate_series(1, ${MATCHES}) i`);
    // 16 jogadores por partida; os "populares" (b1..b50) aparecem bem mais, como nos servidores reais
    await t.db.execute(sql`
      INSERT INTO match_players (match_id, slot, user_id, name, team, is_bot, frags, kills, deaths, play_seconds, score_delta, neg_delta)
      SELECT m.id, s, CASE WHEN s = 15 THEN NULL ELSE u.id END, coalesce(u.username, 'bot'), s % 2, s = 15, 3, 3, 2, 300,
        CASE WHEN m.ranked THEN 5 ELSE 0 END, CASE WHEN m.ranked THEN 1 ELSE 0 END
      FROM (SELECT id, ranked, row_number() OVER () AS n FROM matches) m
      CROSS JOIN generate_series(0, 15) s
      LEFT JOIN users u ON u.username = 'b' || (CASE WHEN s < 4 THEN 1 + (m.n * 7 + s) % 50 ELSE 1 + (m.n * 31 + s * 101) % ${ACCOUNTS} END)
      ON CONFLICT DO NOTHING`);
    // refaz a 0014: o preenchimento dela gera os resumos sociais das partidas acima
    await migrateDown(t.sql, 1);
    await migrateUp(t.sql);
    await t.db.execute(sql`VACUUM ANALYZE`);
    const config = { ...loadConfig({}), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
  }, 600_000);
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const p95 = async (url: (i: number) => string) => {
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const res = await app.inject(url(i));
      times.push(performance.now() - t0);
      expect(res.statusCode).toBe(200);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length * 0.95)]!;
  };

  it('p95 < 50 ms sem cache (um jogador diferente por pedido) e na busca', async () => {
    // os populares (b1..b50, ~8 mil partidas cada) e jogadores comuns (~600)
    const social = await p95((i) => `/players/b${i < 50 ? i + 1 : 51 + i}/social`);
    const progress = await p95((i) => `/players/b${i + 300}/progress`);
    const search = await p95((i) => `/players?busca=b${(i % 90) + 10}`);
    console.log(`p95 social ${social.toFixed(1)} ms, progress ${progress.toFixed(1)} ms, busca ${search.toFixed(1)} ms`);
    expect(Math.max(social, progress, search)).toBeLessThan(50);
  }, 600_000);
});
