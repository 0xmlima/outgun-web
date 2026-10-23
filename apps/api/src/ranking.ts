// SPDX-License-Identifier: GPL-2.0-or-later
// Ranking por temporada (OG-084, D-02, spec plan/specs/ranking.md): descontinuado na v2 (OG-350,
// D-66). As tabelas ficam só para leitura (outubro/2026 é a última temporada); o rating de
// habilidade está em `skill.ts` e o leaderboard de atributos em `leaderboard.ts`. Daqui ficam as
// temporadas mensais e a leitura do histórico antigo.
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { clanLeaderboard } from './clan-stats.js';
import { overallBoard, statLeaders } from './leaderboard.js';
import { awardSeasonMilestones } from './milestones.js';
import { formatRatings, playerProfiles, ratings, seasonChampions, seasons, seasonStandings, type ChampionBoard } from './db/schema.js';

/** `minimum_positive_score_for_ranking` do original: abaixo disso, fora do leaderboard. */
export const MINIMUM_SCORE = 100;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const ratingExpr = sql<number>`(${ratings.score} + 1) / (${ratings.neg} + 1)`;
export const formatRatingExpr = sql<number>`(${formatRatings.score} + 1) / (${formatRatings.neg} + 1)`;

/** Formato do Ranked (OG-250); o rating de cada um fica em `format_ratings` (OG-258, D-42). */
export type RankedFormat = '3x3' | '4x4' | '5x5';

export async function activeSeason(db: Db | Tx): Promise<{ id: number; name: string } | undefined> {
  const [season] = await db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.active, true));
  return season;
}

export interface PlayerRating {
  score: number;
  neg: number;
  participate: boolean;
  /** Posição no leaderboard (0 = fora dele) e quantos há nele. */
  rank: number;
  of: number;
}

/** Ranking da conta na temporada ativa, para o ticket de entrada; com `format`, o rating daquele formato. */
export async function playerRating(db: Db, userId: string, format?: RankedFormat): Promise<PlayerRating & { matches: number }> {
  const season = await activeSeason(db);
  const [profile] = await db.select({ participate: playerProfiles.rankingParticipation }).from(playerProfiles).where(eq(playerProfiles.userId, userId));
  const participate = profile?.participate ?? true;
  if (!season) return { score: 0, neg: 0, participate: false, rank: 0, of: 0, matches: 0 };
  const t = format
    ? { table: formatRatings, score: formatRatings.score, neg: formatRatings.neg, matches: formatRatings.matches, expr: formatRatingExpr, scope: and(eq(formatRatings.seasonId, season.id), eq(formatRatings.format, format)) }
    : { table: ratings, score: ratings.score, neg: ratings.neg, matches: ratings.matches, expr: ratingExpr, scope: eq(ratings.seasonId, season.id) };
  const [mine] = await db
    .select({ score: t.score, neg: t.neg, matches: t.matches })
    .from(t.table)
    .where(and(t.scope, eq(t.table.userId, userId)));
  const score = mine?.score ?? 0;
  const neg = mine?.neg ?? 0;
  const value = (score + 1) / (neg + 1);
  const [counts] = await db
    .select({
      of: sql<number>`count(*)::int`,
      above: sql<number>`count(*) FILTER (WHERE ${t.expr} > ${value} OR (${t.expr} = ${value} AND ${t.score} > ${score}))::int`,
    })
    .from(t.table)
    .where(and(t.scope, sql`${t.score} >= ${MINIMUM_SCORE}`));
  const of = counts?.of ?? 0;
  return { score, neg, participate, rank: score >= MINIMUM_SCORE ? (counts?.above ?? 0) + 1 : 0, of, matches: mine?.matches ?? 0 };
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

/** Primeiro mês do leaderboard de atributos (D-66): dele em diante o hall da fama vem dos stats (OG-354). */
export const LEADERBOARD_SINCE = '2026-11';

/**
 * Fecha a temporada: até outubro/2026, a classificação final e o hall da fama do score/neg; desde
 * novembro, o hall da fama pelo leaderboard. Regravar (partida que chega depois da virada) não duplica.
 */
export async function closeSeason(tx: Tx, seasonId: number): Promise<void> {
  const [season] = await tx.select({ month: seasons.month }).from(seasons).where(eq(seasons.id, seasonId));
  if (season?.month && season.month >= LEADERBOARD_SINCE) await snapshotStatChampions(tx, seasonId);
  else await snapshotStandings(tx, seasonId);
  // Campeão da temporada e Vice (OG-392/399); a temporada já não está ativa aqui
  await awardSeasonMilestones(tx, seasonId);
}

/** Hall da fama pelo leaderboard (OG-354, RN-LDB-05): os 3 primeiros de cada stat principal no mês e os clãs. */
async function snapshotStatChampions(tx: Tx, seasonId: number): Promise<void> {
  await tx.delete(seasonChampions).where(eq(seasonChampions.seasonId, seasonId));
  const scope = { seasonId, format: null };
  const leaders = await statLeaders(tx, scope, 3, (s) => s.main);
  // melhor do mês (OG-358): os 3 primeiros do índice geral, no quadro "stat:overall"
  const best = (await overallBoard(tx, scope, { limit: 3, offset: 0 })).entries;
  const rows = best.map((e) => ({ seasonId, board: 'stat:overall' as ChampionBoard, position: e.position, userId: e.userId, name: e.username, value: e.value }));
  rows.push(...leaders.flatMap((l) => l.entries.map((e) => ({ seasonId, board: `stat:${l.stat}` as const, position: e.position, userId: e.userId, name: e.username, value: e.value }))));
  if (rows.length > 0) await tx.insert(seasonChampions).values(rows);
  await snapshotClanChampions(tx, seasonId);
}

/** Grava (de novo) a classificação final da temporada: mesma ordem e mínimo do leaderboard. */
async function snapshotStandings(tx: Tx, seasonId: number): Promise<void> {
  await tx.delete(seasonStandings).where(eq(seasonStandings.seasonId, seasonId));
  await tx.execute(sql`
    INSERT INTO season_standings (season_id, user_id, position, score, neg, matches)
    SELECT r.season_id, r.user_id,
      row_number() OVER (ORDER BY (r.score + 1) / (r.neg + 1) DESC, r.score DESC, u.username_key),
      r.score, r.neg, r.matches
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.season_id = ${seasonId} AND r.score >= ${MINIMUM_SCORE}`);
  await snapshotChampions(tx, seasonId);
}

/**
 * Hall da fama (OG-268, RN-RKL-24): os 3 primeiros da classificação final, de cada formato (mesma
 * ordem e mínimo do leaderboard) e dos clãs, com os nomes de agora. Regravado com a classificação.
 */
async function snapshotChampions(tx: Tx, seasonId: number): Promise<void> {
  await tx.delete(seasonChampions).where(eq(seasonChampions.seasonId, seasonId));
  await tx.execute(sql`
    INSERT INTO season_champions (season_id, board, position, user_id, name, value)
    SELECT s.season_id, 'overall', s.position, s.user_id, u.username, (s.score + 1) / (s.neg + 1)
    FROM season_standings s JOIN users u ON u.id = s.user_id
    WHERE s.season_id = ${seasonId} AND s.position <= 3`);
  await tx.execute(sql`
    INSERT INTO season_champions (season_id, board, position, user_id, name, value)
    SELECT season_id, format::text, position, user_id, username, rating FROM (
      SELECT f.season_id, f.format, f.user_id, u.username, (f.score + 1) / (f.neg + 1) AS rating,
        row_number() OVER (PARTITION BY f.format ORDER BY (f.score + 1) / (f.neg + 1) DESC, f.score DESC, u.username_key) AS position
      FROM format_ratings f JOIN users u ON u.id = f.user_id
      WHERE f.season_id = ${seasonId} AND f.score >= ${MINIMUM_SCORE}
    ) t WHERE position <= 3`);
  await snapshotClanChampions(tx, seasonId);
}

/** Os 3 primeiros clãs da temporada (OG-274), nos dois sistemas. */
async function snapshotClanChampions(tx: Tx, seasonId: number): Promise<void> {
  const clans = await clanLeaderboard(tx, seasonId, 3, 0);
  if (clans.entries.length > 0) {
    await tx.insert(seasonChampions).values(
      clans.entries.map((c) => ({ seasonId, board: 'clans' as const, position: c.position, clanId: c.clanId, name: c.tag, clanName: c.name, value: c.points })),
    );
  }
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
      await closeSeason(tx, active.id);
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
