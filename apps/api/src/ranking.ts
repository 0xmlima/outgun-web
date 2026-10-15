// SPDX-License-Identifier: GPL-2.0-or-later
// Ranking por temporada (OG-084, D-02, spec plan/specs/ranking.md): a API só soma os deltas que os
// game servers calculam; o leaderboard ordena por rating = (score+1)/(neg+1), com mínimo de 100
// pontos de score para aparecer e desempate por score.
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { playerProfiles, ratings, seasons, seasonStandings } from './db/schema.js';

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

// --- temporadas mensais (OG-267, RN-RKL-22, D-48) ---

/** Brasília não tem horário de verão desde 2019: UTC-3 o ano todo. */
const BRASILIA_OFFSET_MS = 3 * 3600_000;
const ROLL_LOCK_ID = 80_267;

/** Mês (AAAA-MM) de `at` no horário de Brasília. */
export function seasonMonth(at: Date): string {
  const d = new Date(at.getTime() - BRASILIA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Dia 1 do mês às 00:00 de Brasília. */
export function monthStart(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1) + BRASILIA_OFFSET_MS);
}

/** Grava (de novo) a classificação final da temporada: mesma ordem e mínimo do leaderboard. */
export async function snapshotStandings(tx: Tx, seasonId: number): Promise<void> {
  await tx.delete(seasonStandings).where(eq(seasonStandings.seasonId, seasonId));
  await tx.execute(sql`
    INSERT INTO season_standings (season_id, user_id, position, score, neg, matches)
    SELECT r.season_id, r.user_id,
      row_number() OVER (ORDER BY (r.score + 1) / (r.neg + 1) DESC, r.score DESC, u.username_key),
      r.score, r.neg, r.matches
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.season_id = ${seasonId} AND r.score >= ${MINIMUM_SCORE}`);
}

/**
 * Vira a temporada se o mês (Brasília) mudou: encerra a ativa no dia 1 às 00:00, guarda a
 * classificação final e abre "Temporada AAAA-MM". Idempotente (advisory lock + mês único): dois
 * processos ou um reinício no meio não criam duas. Temporada antiga sem mês passa a ser a do mês
 * corrente. Devolve a temporada aberta, se abriu.
 */
export async function rollSeason(db: Db, now = new Date()): Promise<{ id: number; name: string } | undefined> {
  const month = seasonMonth(now);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ROLL_LOCK_ID})`);
    const [active] = await tx.select().from(seasons).where(eq(seasons.active, true));
    if (active && active.month === null) {
      await tx.update(seasons).set({ month }).where(eq(seasons.id, active.id));
      return undefined;
    }
    if (active && active.month! >= month) return undefined;
    const start = monthStart(month);
    if (active) {
      const endsAt = new Date(Math.max(start.getTime(), active.startsAt.getTime() + 1));
      await tx.update(seasons).set({ active: false, endsAt }).where(eq(seasons.id, active.id));
      await snapshotStandings(tx, active.id);
    }
    const [season] = await tx
      .insert(seasons)
      .values({ name: `Temporada ${month}`, month, startsAt: start, active: true })
      .returning({ id: seasons.id, name: seasons.name });
    return season;
  });
}

/**
 * Temporada em que a partida começou (RN-RKL-22: partida que termina depois da virada conta na
 * temporada em que começou); sem temporada para essa data, a ativa.
 */
export async function seasonAt(db: Db | Tx, startedAt: Date): Promise<{ id: number; active: boolean } | undefined> {
  const [season] = await db
    .select({ id: seasons.id, active: seasons.active })
    .from(seasons)
    .where(and(lte(seasons.startsAt, startedAt), or(isNull(seasons.endsAt), gt(seasons.endsAt, startedAt))))
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  if (season) return season;
  const current = await activeSeason(db);
  return current && { id: current.id, active: true };
}
