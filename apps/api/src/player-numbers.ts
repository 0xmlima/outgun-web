// SPDX-License-Identifier: GPL-2.0-or-later
// Números de jogador (OG-410, D-79, RN-NUM-01): únicos de 2 a 99, por ordem de chegada; espera entre
// trocas em NUMBER_COOLDOWN_DAYS (desligada por padrão desde a 2.43.1, pedido do PO); quem fica 60 dias sem jogar perde o número (aviso 7 dias antes). O 1 é do líder do
// "Melhor do mês" da temporada anterior, de uso opcional, sem perder o número dele.
import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { users } from './db/schema.js';
import { previousPodium } from './ranking.js';
import { notify } from './routes/notifications.js';

export const NUMBER_MIN = 2;
export const NUMBER_MAX = 99;
/** Espera entre trocas de número: NUMBER_COOLDOWN_DAYS (0 = sem espera, o padrão desde a 2.43.1). */
export const numberCooldownMs = () => Math.max(0, Number(process.env.NUMBER_COOLDOWN_DAYS ?? 0) || 0) * 24 * 60 * 60_000;
export const NUMBER_IDLE_MS = 60 * 24 * 60 * 60_000;
export const NUMBER_WARNING_MS = 7 * 24 * 60 * 60_000;

/** Números de 2 a 99 ainda livres. */
export async function freeNumbers(db: Db): Promise<number[]> {
  const taken = new Set((await db.select({ n: users.playerNumber }).from(users).where(isNotNull(users.playerNumber))).map((r) => r.n));
  return Array.from({ length: NUMBER_MAX - NUMBER_MIN + 1 }, (_, i) => NUMBER_MIN + i).filter((n) => !taken.has(n));
}

export interface NumberState {
  number: number | null;
  /** Quando pode trocar de novo (null = já pode). */
  canChangeAt: string | null;
  /** Líder do mês anterior: pode usar o 1. */
  numberOneEligible: boolean;
  /** Pódio do "Melhor do mês" anterior (1..3): o número sai na cor da medalha (OG-532); null = nenhum. */
  medal: number | null;
  usingNumberOne: boolean;
  /** Estilo do número (OG-413). */
  style: number;
  free: number[];
}

export async function numberState(db: Db, userId: string, now = new Date()): Promise<NumberState> {
  const [u] = await db.select({ n: users.playerNumber, at: users.numberChangedAt, one: users.useNumberOne, style: users.numberStyle }).from(users).where(eq(users.id, userId));
  const until = u?.at && numberCooldownMs() > 0 ? new Date(u.at.getTime() + numberCooldownMs()) : null;
  const medal = await previousPodium(db, userId);
  const eligible = medal === 1;
  return { number: u?.n ?? null, canChangeAt: until && until > now ? until.toISOString() : null, numberOneEligible: eligible, medal, usingNumberOne: eligible && (u?.one ?? false), style: u?.style ?? 0, free: await freeNumbers(db) };
}

export type NumberChange = { ok: true } | { ok: false; error: 'invalid_number' | 'number_taken' | 'number_cooldown' };

/** Escolhe (ou tira, com null) o número; o índice único resolve a corrida entre dois pedidos. */
export async function setNumber(db: Db, userId: string, number: number | null, now = new Date()): Promise<NumberChange> {
  if (number !== null && (!Number.isInteger(number) || number < NUMBER_MIN || number > NUMBER_MAX)) return { ok: false, error: 'invalid_number' };
  const [u] = await db.select({ n: users.playerNumber, at: users.numberChangedAt }).from(users).where(eq(users.id, userId));
  if (u?.n === number) return { ok: true };
  if (u?.n && u.at && now.getTime() - u.at.getTime() < numberCooldownMs()) return { ok: false, error: 'number_cooldown' };
  try {
    await db.update(users).set({ playerNumber: number, numberChangedAt: number === null ? u?.at ?? null : now, numberWarnedAt: null }).where(eq(users.id, userId));
    return { ok: true };
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.cause?.code ?? e.code) === '23505') return { ok: false, error: 'number_taken' };
    throw err;
  }
}

/** Estilos do número (OG-413): 0 Bloco, 1 Corrida, 2 Contorno, 3 Estêncil. */
export const NUMBER_STYLES = 4;

/** O número que vai no ticket (1 para o líder do mês que o usa, senão o dele) e o estilo. */
export async function ticketNumber(db: Db, userId: string): Promise<{ number: number; style: number } | null> {
  const [u] = await db.select({ n: users.playerNumber, one: users.useNumberOne, style: users.numberStyle }).from(users).where(eq(users.id, userId));
  const number = u?.one && (await previousPodium(db, userId)) === 1 ? 1 : (u?.n ?? null);
  return number ? { number, style: u?.style ?? 0 } : null;
}

/**
 * Libera os números de quem está há 60 dias sem jogar (desde a última partida, ou desde que escolheu
 * se nunca jogou depois) e avisa 7 dias antes. Idempotente; roda uma vez por dia.
 */
export async function releaseIdleNumbers(db: Db, now = new Date()): Promise<{ warned: number; released: number }> {
  const last = sql<Date>`coalesce(greatest((SELECT max(m.ended_at) FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = ${users.id}), ${users.numberChangedAt}), ${users.numberChangedAt})`;
  const idleSince = (ms: number) => sql`${last} < ${new Date(now.getTime() - ms).toISOString()}::timestamptz`;
  const toWarn = await db
    .select({ id: users.id, n: users.playerNumber })
    .from(users)
    .where(and(isNotNull(users.playerNumber), isNull(users.numberWarnedAt), idleSince(NUMBER_IDLE_MS - NUMBER_WARNING_MS)));
  for (const u of toWarn) {
    await db.update(users).set({ numberWarnedAt: now }).where(eq(users.id, u.id));
    await notify(db, [u.id], 'number_expiring', { number: u.n! });
  }
  const toRelease = await db.select({ id: users.id, n: users.playerNumber }).from(users).where(and(isNotNull(users.playerNumber), idleSince(NUMBER_IDLE_MS)));
  for (const u of toRelease) {
    await db.update(users).set({ playerNumber: null, numberWarnedAt: null }).where(and(eq(users.id, u.id), eq(users.playerNumber, u.n!)));
    await notify(db, [u.id], 'number_released', { number: u.n! });
  }
  // aviso dado e a pessoa voltou a jogar: limpa, para um novo aviso no futuro
  await db.update(users).set({ numberWarnedAt: null }).where(and(isNotNull(users.numberWarnedAt), or(isNull(users.playerNumber), sql`NOT (${idleSince(NUMBER_IDLE_MS - NUMBER_WARNING_MS)})`)!, lt(users.numberWarnedAt, now)));
  return { warned: toWarn.length, released: toRelease.length };
}
