// SPDX-License-Identifier: GPL-2.0-or-later
// Ranking por temporada (OG-084, D-02, spec plan/specs/ranking.md): a API só soma os deltas que os
// game servers calculam; o leaderboard ordena por rating = (score+1)/(neg+1), com mínimo de 100
// pontos de score para aparecer e desempate por score.
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { playerProfiles, ratings, seasons } from './db/schema.js';

/** `minimum_positive_score_for_ranking` do original: abaixo disso, fora do leaderboard. */
export const MINIMUM_SCORE = 100;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const ratingExpr = sql<number>`(${ratings.score} + 1) / (${ratings.neg} + 1)`;

export async function activeSeason(db: Db | Tx): Promise<{ id: number; name: string } | undefined> {
  const [season] = await db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.active, true));
  return season;
}

export interface Delta {
  userId: string;
  score: number;
  neg: number;
  /** Conta uma partida ranqueada para o jogador. */
  match: boolean;
}

/** Soma os deltas na temporada (uma linha por conta, criada na primeira partida). */
export async function applyDeltas(tx: Tx, seasonId: number, deltas: readonly Delta[]): Promise<void> {
  for (const d of deltas) {
    if (d.score === 0 && d.neg === 0 && !d.match) continue;
    await tx
      .insert(ratings)
      .values({ userId: d.userId, seasonId, score: d.score, neg: d.neg, matches: d.match ? 1 : 0 })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.seasonId],
        set: {
          score: sql`${ratings.score} + ${d.score}`,
          neg: sql`${ratings.neg} + ${d.neg}`,
          matches: sql`${ratings.matches} + ${d.match ? 1 : 0}`,
          updatedAt: new Date(),
        },
      });
  }
}

export interface PlayerRating {
  score: number;
  neg: number;
  participate: boolean;
  /** Posição no leaderboard (0 = fora dele) e quantos há nele. */
  rank: number;
  of: number;
}

/** Ranking da conta na temporada ativa, para o ticket de entrada. */
export async function playerRating(db: Db, userId: string): Promise<PlayerRating> {
  const season = await activeSeason(db);
  const [profile] = await db.select({ participate: playerProfiles.rankingParticipation }).from(playerProfiles).where(eq(playerProfiles.userId, userId));
  const participate = profile?.participate ?? true;
  if (!season) return { score: 0, neg: 0, participate: false, rank: 0, of: 0 };
  const [mine] = await db
    .select({ score: ratings.score, neg: ratings.neg })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.seasonId, season.id)));
  const score = mine?.score ?? 0;
  const neg = mine?.neg ?? 0;
  const [counts] = await db
    .select({
      of: sql<number>`count(*)::int`,
      above: sql<number>`count(*) FILTER (WHERE ${ratingExpr} > ${(score + 1) / (neg + 1)} OR (${ratingExpr} = ${(score + 1) / (neg + 1)} AND ${ratings.score} > ${score}))::int`,
    })
    .from(ratings)
    .where(and(eq(ratings.seasonId, season.id), sql`${ratings.score} >= ${MINIMUM_SCORE}`));
  const of = counts?.of ?? 0;
  return { score, neg, participate, rank: score >= MINIMUM_SCORE ? (counts?.above ?? 0) + 1 : 0, of };
}

/** Encerra a temporada ativa (fim = agora) e abre `name` como a nova ativa. */
export async function startSeason(db: Db, name: string, now = new Date()): Promise<{ id: number; name: string }> {
  return db.transaction(async (tx) => {
    await tx.update(seasons).set({ active: false, endsAt: now }).where(eq(seasons.active, true));
    const [season] = await tx.insert(seasons).values({ name, startsAt: now, active: true }).returning({ id: seasons.id, name: seasons.name });
    return season!;
  });
}
