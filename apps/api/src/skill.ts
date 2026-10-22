// SPDX-License-Identifier: GPL-2.0-or-later
// Rating de habilidade (OG-349, D-65, RN-SKL): OpenSkill Plackett–Luce com os parâmetros padrão da
// biblioteca, um rating por conta, permanente e único para todos os formatos, sem decaimento. Cada
// ranqueada concluída atualiza quem jogou pelo resultado (vitória, derrota ou empate); o placar não
// importa. Começou do zero na implantação: partidas anteriores não foram reprocessadas.
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { ordinal, predictWin, rate, rating } from 'openskill';
import type { Db } from './db/client.js';
import { playerSkill, skillChanges } from './db/schema.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Ranqueadas até sair de "em calibração" (RN-SKL-04). */
export const CALIBRATION_MATCHES = 10;

/** Valor exibido (RN-SKL-04): (μ − 3σ) × 100, inteiro, nunca abaixo de 0. */
export function skillValue(s: { mu: number; sigma: number }): number {
  return Math.max(0, Math.round(ordinal(s) * 100));
}

export interface SkillPlayer {
  userId: string;
  team: 0 | 1;
}

/**
 * Atualiza o rating de quem jogou a ranqueada `matchId` (RN-SKL-02/03): `players` são as contas que
 * começaram a partida, inclusive quem saiu; bots não entram. `winner` vem do placar final (null =
 * empate). Sem conta dos dois lados não há o que comparar.
 */
export async function applySkill(tx: Tx, matchId: string, players: readonly SkillPlayer[], winner: 0 | 1 | null): Promise<void> {
  const teamOf = new Map<string, 0 | 1>();
  for (const p of players) if (!teamOf.has(p.userId)) teamOf.set(p.userId, p.team);
  const ids = [...teamOf.keys()].sort();
  const sides = [ids.filter((id) => teamOf.get(id) === 0), ids.filter((id) => teamOf.get(id) === 1)] as const;
  if (sides[0].length === 0 || sides[1].length === 0) return;

  const start = rating();
  await tx
    .insert(playerSkill)
    .values(ids.map((userId) => ({ userId, mu: start.mu, sigma: start.sigma })))
    .onConflictDoNothing();
  // trava em ordem de id: duas partidas terminando juntas com jogadores em comum não se cruzam
  const rows = await tx.select().from(playerSkill).where(inArray(playerSkill.userId, ids)).orderBy(asc(playerSkill.userId)).for('update');
  const current = new Map(rows.map((r) => [r.userId, { mu: r.mu, sigma: r.sigma }]));
  const before = sides.map((side) => side.map((id) => current.get(id)!));
  const chance = predictWin(before);
  const after = rate(before, { rank: winner === null ? [1, 1] : winner === 0 ? [1, 2] : [2, 1] });

  const now = new Date();
  const changes = [];
  for (const t of [0, 1] as const) {
    for (const [i, userId] of sides[t].entries()) {
      const b = before[t]![i]!;
      const a = after[t]![i]!;
      await tx
        .update(playerSkill)
        .set({ mu: a.mu, sigma: a.sigma, matches: sql`${playerSkill.matches} + 1`, updatedAt: now })
        .where(eq(playerSkill.userId, userId));
      changes.push({ matchId, userId, team: t, muBefore: b.mu, sigmaBefore: b.sigma, muAfter: a.mu, sigmaAfter: a.sigma, winChance: chance[t]! });
    }
  }
  await tx.insert(skillChanges).values(changes);
}

export interface SkillView {
  /** Valor exibido (RN-SKL-04). */
  value: number;
  mu: number;
  sigma: number;
  matches: number;
  calibrating: boolean;
}

export function skillView(s: { mu: number; sigma: number; matches: number }): SkillView {
  return { value: skillValue(s), mu: s.mu, sigma: s.sigma, matches: s.matches, calibrating: s.matches < CALIBRATION_MATCHES };
}

/** Rating atual da conta; null se ainda não jogou ranqueada desde a implantação. */
export async function playerSkillOf(db: Db | Tx, userId: string): Promise<SkillView | null> {
  const [row] = await db.select().from(playerSkill).where(eq(playerSkill.userId, userId));
  return row ? skillView(row) : null;
}

/** Rating com a posição entre as contas com rating (1 = melhor), para o ticket (OG-350). */
export async function playerSkillRank(db: Db | Tx, userId: string): Promise<(SkillView & { rank: number; of: number }) | null> {
  const me = await playerSkillOf(db, userId);
  if (!me) return null;
  const ord = sql`${playerSkill.mu} - 3 * ${playerSkill.sigma}`;
  const [counts] = await db
    .select({ of: sql<number>`count(*)::int`, above: sql<number>`count(*) FILTER (WHERE ${ord} > ${me.mu - 3 * me.sigma})::int` })
    .from(playerSkill);
  return { ...me, rank: (counts?.above ?? 0) + 1, of: counts?.of ?? 1 };
}

export interface SkillChange {
  userId: string;
  team: number;
  before: number;
  after: number;
  /** Chance de vitória prevista do time dele, de 0 a 1. */
  winChance: number;
}

/** Variação de cada conta numa partida (vazio nas anteriores à implantação, Casual e canceladas). */
export async function matchSkillChanges(db: Db | Tx, matchId: string): Promise<SkillChange[]> {
  const rows = await db.select().from(skillChanges).where(eq(skillChanges.matchId, matchId));
  return rows.map((r) => ({
    userId: r.userId,
    team: r.team,
    before: skillValue({ mu: r.muBefore, sigma: r.sigmaBefore }),
    after: skillValue({ mu: r.muAfter, sigma: r.sigmaAfter }),
    winChance: r.winChance,
  }));
}
