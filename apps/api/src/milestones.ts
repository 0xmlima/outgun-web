// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos (OG-213, RN-SOC-03): lê o histórico das contas, calcula com `milestonesFrom`
// (@outgun/content) e grava o que faltar. Roda na transação que grava cada partida e, para o
// histórico já gravado, em `cli.js milestones` — idempotente nos dois casos (ON CONFLICT DO NOTHING).
// Só partidas com conta e sem bots no slot; kills em bots (`stats.botKills`) não contam. Desde o
// OG-390 também mortes, tempo jogado, placar sofrido e os stats da partida (jsonb inteiro).
import { milestonesFrom, type MilestoneMatch } from '@outgun/content';
import { sql } from 'drizzle-orm';
import type { Db } from './db/client.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Histórico de cada conta em ordem de término. */
async function histories(tx: Db | Tx, userIds: readonly string[]): Promise<Map<string, MilestoneMatch[]>> {
  const out = new Map<string, MilestoneMatch[]>();
  if (userIds.length === 0) return out;
  const rows = await tx.execute<{
    user_id: string;
    match_id: string;
    ended_at: Date | string;
    res: number;
    kills: number;
    captures: number;
    shots: number;
    hits: number;
    deaths: number;
    play_seconds: number;
    stats: Record<string, number> | null;
    opponent: string | null;
    conceded: number;
    series_won: boolean;
    sweep: boolean;
  }>(sql`
    SELECT mp.user_id, m.id AS match_id, m.ended_at,
      sign(CASE WHEN mp.team = 0 THEN m.red_score - m.blue_score ELSE m.blue_score - m.red_score END)::int AS res,
      mp.kills - coalesce((mp.stats ->> 'botKills')::int, 0) AS kills,
      mp.captures,
      coalesce((mp.stats ->> 'shots')::int, 0) AS shots,
      coalesce((mp.stats ->> 'hits')::int, 0) AS hits,
      mp.deaths, mp.play_seconds, mp.stats,
      -- clã x clã (OG-259): adversário, capturas sofridas e a série md3/md5 fechada neste jogo
      CASE WHEN m.clan_war THEN coalesce(CASE WHEN mp.team = 0 THEN m.blue_clan_id ELSE m.red_clan_id END::text, m.id::text) END AS opponent,
      CASE WHEN mp.team = 0 THEN m.blue_score ELSE m.red_score END AS conceded,
      coalesce(m.clan_war AND rs.best_of >= 3 AND rs.finished_at IS NOT NULL AND m.game_no = rs.games AND rs.winner = mp.team, false) AS series_won,
      coalesce(least(rs.red_wins, rs.blue_wins) = 0, false) AS sweep
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    LEFT JOIN ranked_series rs ON rs.id = m.series_id
    WHERE mp.user_id IN (${sql.join(
      userIds.map((id) => sql`${id}`),
      sql`, `,
    )}) AND NOT mp.is_bot
    ORDER BY mp.user_id, m.ended_at, m.id`);
  for (const r of rows) {
    const list = out.get(r.user_id) ?? [];
    list.push({
      matchId: r.match_id,
      endedAt: new Date(r.ended_at).toISOString(),
      result: Math.sign(Number(r.res)) as 1 | 0 | -1,
      kills: Number(r.kills),
      captures: Number(r.captures),
      shots: Number(r.shots),
      hits: Number(r.hits),
      deaths: Number(r.deaths),
      playSeconds: Number(r.play_seconds),
      conceded: Number(r.conceded),
      ...(r.stats ? { stats: r.stats } : {}),
      ...(r.opponent ? { clanWar: { opponent: r.opponent, conceded: Number(r.conceded), seriesWon: r.series_won, sweep: r.series_won && r.sweep } } : {}),
    });
    out.set(r.user_id, list);
  }
  return out;
}

/** Concede os marcos que faltam às contas; devolve quantos foram gravados agora. */
export async function awardMilestones(tx: Db | Tx, userIds: readonly string[], o: { beta: boolean }): Promise<number> {
  const all = await histories(tx, [...new Set(userIds)]);
  let added = 0;
  for (const [userId, list] of all) {
    const got = milestonesFrom(list, o);
    if (got.length === 0) continue;
    const res = await tx.execute<{ milestone: string }>(sql`
      INSERT INTO player_milestones (user_id, milestone, achieved_at, match_id)
      VALUES ${sql.join(
        got.map((a) => sql`(${userId}, ${a.id}, ${a.endedAt}, ${a.matchId})`),
        sql`, `,
      )}
      ON CONFLICT (user_id, milestone) DO NOTHING
      RETURNING milestone`);
    added += res.length;
  }
  return added;
}

/** Preenchimento retroativo: todas as contas com partidas, em lotes. */
export async function backfillMilestones(db: Db, o: { beta: boolean }, batch = 200): Promise<{ users: number; added: number }> {
  const ids = (await db.execute<{ user_id: string }>(sql`SELECT DISTINCT user_id FROM match_players WHERE user_id IS NOT NULL ORDER BY user_id`)).map((r) => r.user_id);
  let added = 0;
  for (let i = 0; i < ids.length; i += batch) added += await awardMilestones(db, ids.slice(i, i + batch), o);
  return { users: ids.length, added };
}
