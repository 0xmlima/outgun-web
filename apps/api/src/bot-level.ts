// SPDX-License-Identifier: GPL-2.0-or-later
// Nível do bot substituto (OG-266, RN-RKL-19): a partir do histórico Ranked da conta — posição no
// leaderboard (percentil), K/D e precisão nas últimas partidas. Vai no ticket da sala Ranked e o
// game server o guarda até precisar de um bot no lugar do jogador.
import { sql } from 'drizzle-orm';
import type { Db } from './db/client.js';

/** Partidas Ranked mínimas para sair do nível intermediário. */
export const BOT_LEVEL_MIN_MATCHES = 5;
/** Quantas partidas Ranked recentes entram na conta de K/D e precisão. */
export const BOT_LEVEL_RECENT = 20;
/** Nível sem histórico (intermediário: um pouco abaixo do bot de referência, que é o 4). */
export const DEFAULT_BOT_LEVEL = 3;

export interface BotLevelInput {
  /** Partidas Ranked recentes consideradas (até `BOT_LEVEL_RECENT`). */
  matches: number;
  /** Posição no leaderboard (0 = fora dele) e quantos há nele. */
  rank: number;
  of: number;
  kills: number;
  deaths: number;
  shots: number;
  hits: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 1..5: metade pelo percentil no leaderboard (fora dele conta como o quartil de baixo), um quarto
 * pelo K/D (2,0 ou mais = máximo) e um quarto pela precisão (50% ou mais = máximo).
 */
export function botLevelFrom(h: BotLevelInput): number {
  if (h.matches < BOT_LEVEL_MIN_MATCHES) return DEFAULT_BOT_LEVEL;
  const percentile = h.rank > 0 && h.of > 0 ? 1 - (h.rank - 1) / h.of : 0.25;
  const kd = clamp01(h.kills / Math.max(1, h.deaths) / 2);
  const accuracy = h.shots > 0 ? clamp01(h.hits / h.shots / 0.5) : 0;
  const score = 0.5 * clamp01(percentile) + 0.25 * kd + 0.25 * accuracy;
  return Math.min(5, 1 + Math.floor(score * 5));
}

/** Soma das últimas partidas Ranked da conta (sem as dela como bot). */
export async function recentRanked(db: Db, userId: string): Promise<Omit<BotLevelInput, 'rank' | 'of'>> {
  const rows = await db.execute<{ matches: number; kills: number; deaths: number; shots: number; hits: number }>(sql`
    SELECT count(*)::int AS matches, coalesce(sum(kills), 0)::int AS kills, coalesce(sum(deaths), 0)::int AS deaths,
           coalesce(sum(shots), 0)::int AS shots, coalesce(sum(hits), 0)::int AS hits
    FROM (
      SELECT mp.kills, mp.deaths, coalesce((mp.stats ->> 'shots')::int, 0) AS shots, coalesce((mp.stats ->> 'hits')::int, 0) AS hits
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = ${userId} AND m.ranked AND NOT mp.is_bot
      ORDER BY m.ended_at DESC
      LIMIT ${BOT_LEVEL_RECENT}
    ) recent`);
  const r = rows[0];
  return { matches: Number(r?.matches ?? 0), kills: Number(r?.kills ?? 0), deaths: Number(r?.deaths ?? 0), shots: Number(r?.shots ?? 0), hits: Number(r?.hits ?? 0) };
}
