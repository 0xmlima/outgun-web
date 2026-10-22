// SPDX-License-Identifier: GPL-2.0-or-later
// Resumos da API social (OG-211, migration 0014): pares de contas, totais por dia e pontos de rating,
// atualizados na mesma transação que grava a partida ou o delta avulso.
import { sql } from 'drizzle-orm';
import type { Db } from './db/client.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Soma a partida `matchId` (já gravada com os jogadores) nos resumos sociais. */
export async function recordMatchSocial(tx: Tx, matchId: string): Promise<void> {
  await tx.execute(sql`
    INSERT INTO player_pairs AS pp (user_id, other_id, together, won_together, lost_together, against, won_against, lost_against)
    SELECT a.user_id, b.user_id,
      count(*) FILTER (WHERE a.team = b.team),
      count(*) FILTER (WHERE a.team = b.team AND r.res > 0),
      count(*) FILTER (WHERE a.team = b.team AND r.res < 0),
      count(*) FILTER (WHERE a.team <> b.team),
      count(*) FILTER (WHERE a.team <> b.team AND r.res > 0),
      count(*) FILTER (WHERE a.team <> b.team AND r.res < 0)
    FROM match_players a
    JOIN match_players b ON b.match_id = a.match_id AND b.user_id IS NOT NULL AND b.user_id <> a.user_id AND NOT b.is_bot
    JOIN matches m ON m.id = a.match_id
    CROSS JOIN LATERAL (SELECT sign(CASE WHEN a.team = 0 THEN m.red_score - m.blue_score ELSE m.blue_score - m.red_score END) AS res) r
    WHERE a.match_id = ${matchId} AND a.user_id IS NOT NULL AND NOT a.is_bot
    GROUP BY a.user_id, b.user_id
    ON CONFLICT (user_id, other_id) DO UPDATE SET
      together = pp.together + EXCLUDED.together,
      won_together = pp.won_together + EXCLUDED.won_together,
      lost_together = pp.lost_together + EXCLUDED.lost_together,
      against = pp.against + EXCLUDED.against,
      won_against = pp.won_against + EXCLUDED.won_against,
      lost_against = pp.lost_against + EXCLUDED.lost_against`);
  await tx.execute(sql`
    INSERT INTO player_daily AS d (user_id, day, matches, wins, kills, deaths, captures, play_seconds)
    SELECT mp.user_id, (m.ended_at AT TIME ZONE 'UTC')::date, count(*),
      count(*) FILTER (WHERE CASE WHEN mp.team = 0 THEN m.red_score > m.blue_score ELSE m.blue_score > m.red_score END),
      sum(mp.kills), sum(mp.deaths), sum(mp.captures), sum(mp.play_seconds)
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.match_id = ${matchId} AND mp.user_id IS NOT NULL
    GROUP BY mp.user_id, (m.ended_at AT TIME ZONE 'UTC')::date
    ON CONFLICT (user_id, day) DO UPDATE SET
      matches = d.matches + EXCLUDED.matches,
      wins = d.wins + EXCLUDED.wins,
      kills = d.kills + EXCLUDED.kills,
      deaths = d.deaths + EXCLUDED.deaths,
      captures = d.captures + EXCLUDED.captures,
      play_seconds = d.play_seconds + EXCLUDED.play_seconds`);
  // `rating_points` (evolução do score/neg) não recebe mais nada: ranking descontinuado (OG-350, D-66)
}
