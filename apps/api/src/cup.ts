// SPDX-License-Identifier: GPL-2.0-or-later
// OutCup (OG-520..528, D-88, RN-CUP): copa mensal 2x2 em mata-mata. Calendário da edição, sorteio
// das duplas, chave com cabeças de chave e byes, avanço pelos resultados, W.O., criação da sala do
// confronto e o relógio que roda a cada minuto (idempotente, como a virada da temporada).
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from './db/client.js';
import {
  bans,
  cupAvailability,
  cupDuos,
  cupEntries,
  cupMatches,
  cups,
  matches,
  playerProfiles,
  playerSkill,
  rankedSeries,
  rooms,
  users,
  type CupResolution,
  type NotificationData,
  type RoomCup,
} from './db/schema.js';
import { cupMail } from './mail/templates.js';
import { mailLocale } from './mail/templates.js';
import type { Mailer } from './mail/mailer.js';
import { onlineServers, pickServer } from './registry.js';
import { notify } from './routes/notifications.js';
import { skillValue } from './skill.js';
import { liveBus } from './live.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Q = Db | Tx;
type CupRow = typeof cups.$inferSelect;
type MatchRow = typeof cupMatches.$inferSelect;
type DuoRow = typeof cupDuos.$inferSelect;

/** Mínimo de duplas para a edição acontecer (P14). */
export const CUP_MIN_DUOS = 4;
/** Tolerância depois do horário marcado: quem não está na sala perde por W.O. (RN-CUP-10). */
export const CUP_TOLERANCE_MS = 15 * 60_000;
/** A sala do confronto abre 15 min antes do horário (RN-CUP-09). */
export const CUP_ROOM_LEAD_MS = 15 * 60_000;
/** Aviso de prazo acabando, antes do fim da janela da fase. */
export const CUP_REMIND_MS = 24 * 3600_000;
/** Antecedência mínima de uma proposta de horário. */
export const CUP_PROPOSE_LEAD_MS = 30 * 60_000;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Brasília não tem horário de verão desde 2019: UTC-3 o ano todo (como a temporada). */
const BRASILIA_OFFSET_MS = 3 * HOUR;

/** Meia-noite (Brasília) do dia 1 do mês da edição `AAAA-MM`, mais `months`. */
function monthStart(edition: string, months = 0): Date {
  const [y, m] = edition.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 1) + BRASILIA_OFFSET_MS);
}

/** Edição (`AAAA-MM`) do mês em que `at` cai, no horário de Brasília; `months` desloca. */
export function editionAt(at: Date, months = 0): string {
  const d = new Date(at.getTime() - BRASILIA_OFFSET_MS);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Datas da edição (RN-CUP-02): inscrições do dia 20 do mês anterior até o último dia às 20h, quando
 * acontece o sorteio; os jogos vão do dia 1 até o fim do mês (`endsAt` exclusivo: meia-noite do dia 1 seguinte).
 */
export function cupDates(edition: string): { registrationOpensAt: Date; drawAt: Date; startsAt: Date; endsAt: Date } {
  const startsAt = monthStart(edition);
  const prev = monthStart(edition, -1);
  return {
    registrationOpensAt: new Date(prev.getTime() + 19 * DAY),
    drawAt: new Date(startsAt.getTime() - 4 * HOUR),
    startsAt,
    endsAt: monthStart(edition, 1),
  };
}

/**
 * Janelas das fases (RN-CUP-03): até 4 fases, uma por semana a partir do dia 1, e a última vai até o
 * fim do mês; com 5 ou mais, o mês é dividido em janelas iguais (em dias inteiros). A copa nunca passa do mês.
 */
export function roundWindows(rounds: number, startsAt: Date, endsAt: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  const days = Math.round((endsAt.getTime() - startsAt.getTime()) / DAY);
  for (let i = 0; i < rounds; i++) {
    const last = i === rounds - 1;
    const from = rounds <= 4 ? 7 * i : Math.floor((days * i) / rounds);
    const to = rounds <= 4 ? 7 * (i + 1) : Math.floor((days * (i + 1)) / rounds);
    out.push({ start: new Date(startsAt.getTime() + from * DAY), end: last ? endsAt : new Date(startsAt.getTime() + to * DAY) });
  }
  return out;
}

/** Fases para `duos` duplas (potência de 2 acima, RN-CUP-06). */
export function roundsFor(duos: number): number {
  return Math.max(1, Math.ceil(Math.log2(duos)));
}

/** Ordem das cabeças de chave na primeira fase (1 × N, 2 × N−1 nos lados opostos da chave). */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

/** Gerador reproduzível (mulberry32) a partir da semente gravada na edição (sorteio auditável). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DrawEntry {
  userId: string;
  name: string;
  rating: number;
}

/**
 * Sorteio das duplas (RN-CUP-05): número ímpar → o último inscrito fica de fora; o resto é
 * embaralhado (Fisher–Yates com a semente) e pareado em ordem, sem balancear. Cabeças de chave pela
 * soma do rating (empate: nomes em ordem). As entradas chegam na ordem de inscrição.
 */
export function drawDuos(entries: readonly DrawEntry[], seed: string): { duos: { players: [DrawEntry, DrawEntry]; seed: number; rating: number }[]; leftOut: DrawEntry | null } {
  const leftOut = entries.length % 2 === 1 ? entries[entries.length - 1]! : null;
  const pool = leftOut ? entries.slice(0, -1) : [...entries];
  const rand = seededRandom(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const pairs: { players: [DrawEntry, DrawEntry]; rating: number }[] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push({ players: [pool[i]!, pool[i + 1]!], rating: pool[i]!.rating + pool[i + 1]!.rating });
  pairs.sort((a, b) => b.rating - a.rating || duoLabel(a.players).localeCompare(duoLabel(b.players)));
  return { duos: pairs.map((p, i) => ({ ...p, seed: i + 1 })), leftOut };
}

const duoLabel = (p: readonly [DrawEntry, DrawEntry]) => `${p[0].name} + ${p[1].name}`;

/** Série md3; final md5 (RN-CUP-07). */
export const bestOfFor = (round: number, rounds: number): 3 | 5 => (round === rounds - 1 ? 5 : 3);

// ---------------------------------------------------------------------------------------------
// Eventos: notificação no portal (na transação) e e-mail depois dela (RN-CUP-12)

export type CupEvent = 'registration_open' | 'drawn' | 'left_out' | 'cancelled' | 'proposed' | 'declined' | 'scheduled' | 'room_open' | 'deadline' | 'result' | 'champion';

export interface CupNotice {
  userIds: string[];
  data: NotificationData & { cupEvent: CupEvent };
}

/** Avisos da OutCup acumulados numa operação; `deliver` manda os e-mails depois do commit. */
export class CupOutbox {
  readonly notices: CupNotice[] = [];
  async add(tx: Q, userIds: readonly (string | null)[], data: CupNotice['data']): Promise<void> {
    const ids = [...new Set(userIds.filter((u): u is string => !!u))];
    if (ids.length === 0) return;
    await notify(tx, ids, 'cup', data);
    this.notices.push({ userIds: ids, data });
  }
}

/** E-mails dos avisos (quem desligou os e-mails da OutCup não recebe). Falha de envio só vai ao log. */
export async function deliver(db: Db, mailer: Mailer, webUrl: string, outbox: CupOutbox, log?: (err: unknown) => void): Promise<void> {
  const ids = [...new Set(outbox.notices.flatMap((n) => n.userIds))];
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: users.id, email: users.email, username: users.username, language: playerProfiles.language, cupEmails: playerProfiles.cupEmails })
    .from(users)
    .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
    .where(inArray(users.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const n of outbox.notices) {
    for (const id of n.userIds) {
      const u = byId.get(id);
      if (!u || u.cupEmails === false) continue;
      await mailer.send(cupMail(u.email, u.username, n.data, webUrl, mailLocale(u.language ?? undefined))).catch((err: unknown) => log?.(err));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Edição

/** Cria a edição se ainda não existe (datas de `cupDates`). */
export async function createCup(tx: Q, edition: string, opensNow?: Date): Promise<CupRow | undefined> {
  const d = cupDates(edition);
  const [row] = await tx
    .insert(cups)
    .values({ edition, ...d, ...(opensNow && opensNow < d.registrationOpensAt ? { registrationOpensAt: opensNow } : {}) })
    .onConflictDoNothing()
    .returning();
  return row;
}

/** Quem jogou ranqueada nos últimos 30 dias: recebe o aviso de inscrição aberta. */
async function recentRankedPlayers(tx: Q, now: Date): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    SELECT DISTINCT mp.user_id FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE m.ranked AND mp.user_id IS NOT NULL AND NOT mp.is_bot AND m.ended_at > ${new Date(now.getTime() - 30 * DAY).toISOString()}`);
  return rows.map((r) => r.user_id);
}

/** Abre a edição do mês seguinte quando chega o dia das inscrições (RN-CUP-01). */
async function ensureNextCup(db: Db, now: Date, outbox: CupOutbox): Promise<void> {
  const edition = editionAt(now, 1);
  if (now < cupDates(edition).registrationOpensAt) return;
  await db.transaction(async (tx) => {
    const row = await createCup(tx, edition);
    if (row) await outbox.add(tx, await recentRankedPlayers(tx, now), { cup: edition, cupEvent: 'registration_open' });
  });
}

/** Conta com ban de plataforma valendo (não se inscreve, RN-CUP-04). */
export async function platformBanned(tx: Q, userId: string, now = new Date()): Promise<boolean> {
  const [ban] = await tx
    .select({ id: bans.id })
    .from(bans)
    .where(and(eq(bans.userId, userId), isNull(bans.roomId), isNull(bans.revokedAt), or(isNull(bans.expiresAt), gte(bans.expiresAt, now))))
    .limit(1);
  return ban !== undefined;
}

/**
 * Sorteio no fechamento (RN-CUP-04/05/06): menos de 4 duplas cancela a edição; senão grava as
 * duplas, a chave inteira (fases futuras vazias) e resolve os byes da primeira fase.
 */
export async function runDraw(tx: Tx, cup: CupRow, outbox: CupOutbox, seed = randomBytes(16).toString('hex')): Promise<void> {
  const entries = await tx
    .select({ userId: cupEntries.userId, name: users.username, mu: playerSkill.mu, sigma: playerSkill.sigma })
    .from(cupEntries)
    .innerJoin(users, eq(users.id, cupEntries.userId))
    .leftJoin(playerSkill, eq(playerSkill.userId, cupEntries.userId))
    .where(eq(cupEntries.cupId, cup.id))
    .orderBy(asc(cupEntries.createdAt), asc(users.username));
  const ids = entries.map((e) => e.userId);
  if (entries.length < CUP_MIN_DUOS * 2) {
    await tx.update(cups).set({ status: 'cancelled', cancelReason: 'min_duos' }).where(eq(cups.id, cup.id));
    await outbox.add(tx, ids, { cup: cup.edition, cupEvent: 'cancelled' });
    return;
  }
  const { duos, leftOut } = drawDuos(
    entries.map((e) => ({ userId: e.userId, name: e.name, rating: e.mu !== null && e.sigma !== null ? skillValue({ mu: e.mu, sigma: e.sigma }) : 0 })),
    seed,
  );
  if (leftOut) {
    await tx.update(cupEntries).set({ leftOut: true }).where(and(eq(cupEntries.cupId, cup.id), eq(cupEntries.userId, leftOut.userId)));
    await outbox.add(tx, [leftOut.userId], { cup: cup.edition, cupEvent: 'left_out' });
  }
  const rows = await tx
    .insert(cupDuos)
    .values(duos.map((d) => ({ cupId: cup.id, player1Id: d.players[0].userId, player2Id: d.players[1].userId, player1Name: d.players[0].name, player2Name: d.players[1].name, seed: d.seed, rating: d.rating })))
    .returning();
  const bySeed = new Map(rows.map((r) => [r.seed, r]));
  const rounds = roundsFor(rows.length);
  const windows = roundWindows(rounds, cup.startsAt, cup.endsAt);
  const order = seedOrder(2 ** rounds);
  const values: (typeof cupMatches.$inferInsert)[] = [];
  for (let r = 0; r < rounds; r++) {
    const count = 2 ** (rounds - r - 1);
    for (let slot = 0; slot < count; slot++) {
      const base = { cupId: cup.id, round: r, slot, bestOf: bestOfFor(r, rounds), windowStart: windows[r]!.start, windowEnd: windows[r]!.end };
      if (r > 0) {
        values.push({ ...base, status: 'pending' });
        continue;
      }
      const a = bySeed.get(order[slot * 2]!);
      const b = bySeed.get(order[slot * 2 + 1]!);
      values.push(
        a && b
          ? { ...base, duoA: a.id, duoB: b.id, status: 'open' }
          : { ...base, duoA: (a ?? b)?.id ?? null, status: 'bye', winnerDuo: (a ?? b)?.id ?? null, resolution: 'bye' },
      );
    }
  }
  await tx.insert(cupMatches).values(values);
  const [running] = await tx.update(cups).set({ status: 'running', rounds, drawSeed: seed }).where(eq(cups.id, cup.id)).returning();
  // byes andam já: as cabeças de chave entram na segunda fase (com `rounds` gravado, senão o bye parece a final)
  const first = await tx.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, 0)));
  for (const m of first) if (m.status === 'bye') await settleNext(tx, running!, m, outbox);
  // dupla e adversário de cada um
  const fresh = await tx.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, 0)));
  const duoById = new Map(rows.map((d) => [d.id, d]));
  for (const d of rows) {
    const m = fresh.find((x) => x.duoA === d.id || x.duoB === d.id);
    const opp = m && m.status === 'open' ? duoById.get(m.duoA === d.id ? m.duoB! : m.duoA!) : undefined;
    for (const [me, partner] of [
      [d.player1Id, d.player2Name],
      [d.player2Id, d.player1Name],
    ] as const) {
      await outbox.add(tx, [me], { cup: cup.edition, cupEvent: 'drawn', partner, ...(opp ? { opponent: duoName(opp), matchId: m!.id } : { bye: true }) });
    }
  }
}

export const duoName = (d: Pick<DuoRow, 'player1Name' | 'player2Name'>) => `${d.player1Name} + ${d.player2Name}`;
const duoPlayers = (d: DuoRow | undefined) => (d ? [d.player1Id, d.player2Id] : []);
const isOver = (s: MatchRow['status']) => s === 'done' || s === 'walkover' || s === 'double_walkover' || s === 'bye';

/**
 * Leva o resultado de `m` para o confronto da fase seguinte (RN-CUP-06/10): com os dois de cima
 * decididos, o confronto abre; um lado vazio (W.O. duplo) → o outro avança direto; os dois vazios →
 * W.O. duplo também. O fim da final encerra a edição.
 */
export async function settleNext(tx: Tx, cup: CupRow, m: MatchRow, outbox: CupOutbox): Promise<void> {
  const rounds = cup.rounds ?? 0;
  if (m.round >= rounds - 1) return finishCup(tx, cup, m, outbox);
  const nextSlot = Math.floor(m.slot / 2);
  const feeders = await tx
    .select()
    .from(cupMatches)
    .where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, m.round), inArray(cupMatches.slot, [nextSlot * 2, nextSlot * 2 + 1])))
    .orderBy(asc(cupMatches.slot));
  const [f0, f1] = feeders;
  const [next] = await tx.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, m.round + 1), eq(cupMatches.slot, nextSlot)));
  if (!next || !f0 || !f1) return;
  const a = isOver(f0.status) ? f0.winnerDuo : null;
  const b = isOver(f1.status) ? f1.winnerDuo : null;
  if (!isOver(f0.status) || !isOver(f1.status)) {
    await tx.update(cupMatches).set({ duoA: a, duoB: b, updatedAt: new Date() }).where(eq(cupMatches.id, next.id));
    return;
  }
  if (a && b) {
    await tx.update(cupMatches).set({ duoA: a, duoB: b, status: 'open', updatedAt: new Date() }).where(eq(cupMatches.id, next.id));
    const duos = await tx.select().from(cupDuos).where(inArray(cupDuos.id, [a, b]));
    const da = duos.find((d) => d.id === a)!;
    const db = duos.find((d) => d.id === b)!;
    await outbox.add(tx, duoPlayers(da), { cup: cup.edition, cupEvent: 'drawn', opponent: duoName(db), matchId: next.id, round: next.round });
    await outbox.add(tx, duoPlayers(db), { cup: cup.edition, cupEvent: 'drawn', opponent: duoName(da), matchId: next.id, round: next.round });
    return;
  }
  const only = a ?? b;
  const [updated] = await tx
    .update(cupMatches)
    .set({ duoA: a, duoB: b, status: only ? 'bye' : 'double_walkover', winnerDuo: only, resolution: only ? 'bye' : 'double_walkover', updatedAt: new Date() })
    .where(eq(cupMatches.id, next.id))
    .returning();
  await settleNext(tx, cup, updated!, outbox);
}

/** Fim da final: campeã e vice (sem campeã se a final teve W.O. duplo), marcos e avisos (RN-CUP-13). */
async function finishCup(tx: Tx, cup: CupRow, finalMatch: MatchRow, outbox: CupOutbox): Promise<void> {
  const champion = finalMatch.winnerDuo;
  const runnerUp = champion ? (finalMatch.duoA === champion ? finalMatch.duoB : finalMatch.duoA) : null;
  await tx.update(cups).set({ status: 'finished', championDuoId: champion, runnerUpDuoId: runnerUp }).where(eq(cups.id, cup.id));
  await awardCupMilestones(tx, cup.id, outbox);
  if (champion) {
    const [d] = await tx.select().from(cupDuos).where(eq(cupDuos.id, champion));
    const everyone = (await tx.select({ id: cupDuos.player1Id, id2: cupDuos.player2Id }).from(cupDuos).where(eq(cupDuos.cupId, cup.id))).flatMap((r) => [r.id, r.id2]);
    await outbox.add(tx, everyone, { cup: cup.edition, cupEvent: 'champion', opponent: d ? duoName(d) : '' });
  }
}

/**
 * Marcos da OutCup (RN-CUP-13), gravados ao fim da edição (e no retroativo, sem `cupId`):
 * participação, vitória em série, final, título, bicampeonato, título invicto e virada numa série.
 */
export async function awardCupMilestones(tx: Q, cupId?: string, outbox?: CupOutbox): Promise<number> {
  const only = cupId ? sql`AND c.id = ${cupId}` : sql``;
  const res = await tx.execute<{ user_id: string; milestone: string }>(sql`
    WITH duo_players AS (
      SELECT d.id AS duo_id, d.cup_id, p.user_id FROM cup_duos d CROSS JOIN LATERAL (VALUES (d.player1_id), (d.player2_id)) p(user_id) WHERE p.user_id IS NOT NULL
    ), facts AS (
      SELECT dp.user_id, 'cup_first' AS milestone, c.ends_at AS at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id WHERE c.status = 'finished' ${only}
      UNION ALL
      SELECT dp.user_id, 'cup_win_match', c.ends_at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id
        JOIN cup_matches m ON m.winner_duo = dp.duo_id AND m.resolution IN ('series', 'tiebreak') WHERE c.status = 'finished' ${only}
      UNION ALL
      SELECT dp.user_id, 'cup_final', c.ends_at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id
        JOIN cup_matches m ON m.cup_id = c.id AND m.round = c.rounds - 1 AND dp.duo_id IN (m.duo_a, m.duo_b) WHERE c.status = 'finished' ${only}
      UNION ALL
      SELECT dp.user_id, 'cup_champion', c.ends_at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id AND c.champion_duo_id = dp.duo_id WHERE c.status = 'finished' ${only}
      UNION ALL
      SELECT dp.user_id, 'cup_unbeaten', c.ends_at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id AND c.champion_duo_id = dp.duo_id
        WHERE c.status = 'finished' ${only} AND NOT EXISTS (
          SELECT 1 FROM cup_matches m WHERE m.cup_id = c.id AND m.winner_duo = dp.duo_id AND m.resolution IN ('series', 'tiebreak')
            AND (CASE WHEN m.duo_a = dp.duo_id THEN m.score_b ELSE m.score_a END) > 0)
      UNION ALL
      SELECT x.user_id, 'cup_bicampeao', max(x.ends_at) FROM (
        SELECT dp.user_id, c.ends_at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id AND c.champion_duo_id = dp.duo_id WHERE c.status = 'finished'
      ) x GROUP BY x.user_id HAVING count(*) >= 2
      UNION ALL
      SELECT dp.user_id, 'cup_comeback', c.ends_at FROM duo_players dp JOIN cups c ON c.id = dp.cup_id
        JOIN cup_matches m ON m.winner_duo = dp.duo_id AND m.resolution = 'series' AND m.series_id IS NOT NULL
        JOIN matches g1 ON g1.series_id = m.series_id AND g1.game_no = 1
        WHERE c.status = 'finished' ${only}
          AND (CASE WHEN m.duo_a = dp.duo_id THEN g1.blue_score > g1.red_score ELSE g1.red_score > g1.blue_score END)
    )
    INSERT INTO player_milestones (user_id, milestone, achieved_at, match_id)
    SELECT DISTINCT ON (user_id, milestone) user_id, milestone, at, NULL::uuid FROM facts ORDER BY user_id, milestone, at
    ON CONFLICT (user_id, milestone) DO NOTHING
    RETURNING user_id, milestone`);
  if (outbox) {
    const byUser = new Map<string, string[]>();
    for (const r of res) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.milestone]);
    for (const [userId, list] of byUser) await notify(tx, [userId], 'milestone', { milestones: list });
  }
  return res.length;
}

// ---------------------------------------------------------------------------------------------
// Resultado de um confronto

/** Grava o resultado e leva a chave adiante; avisa as duas duplas. */
export async function resolveMatch(
  tx: Tx,
  cup: CupRow,
  m: MatchRow,
  r: { winner: string | null; resolution: CupResolution; scoreA?: number | null; scoreB?: number | null },
  outbox: CupOutbox,
): Promise<void> {
  const status = r.resolution === 'walkover' ? 'walkover' : r.resolution === 'double_walkover' ? 'double_walkover' : 'done';
  const [updated] = await tx
    .update(cupMatches)
    .set({ status, winnerDuo: r.winner, resolution: r.resolution, scoreA: r.scoreA ?? null, scoreB: r.scoreB ?? null, proposedAt: null, proposedBy: null, updatedAt: new Date() })
    .where(eq(cupMatches.id, m.id))
    .returning();
  const duos = await tx.select().from(cupDuos).where(inArray(cupDuos.id, [m.duoA, m.duoB].filter((x): x is string => !!x)));
  for (const d of duos) {
    const opp = duos.find((x) => x.id !== d.id);
    await outbox.add(tx, duoPlayers(d), { cup: cup.edition, cupEvent: 'result', matchId: m.id, round: m.round, won: r.winner === d.id, resolution: r.resolution, ...(opp ? { opponent: duoName(opp) } : {}) });
  }
  await settleNext(tx, cup, updated!, outbox);
}

/**
 * Fim da série da sala do confronto (OG-525): o lado vencedor da série leva; série empatada
 * (empates nos jogos) → mais capturas somadas na série, depois a cabeça de chave melhor (desempate).
 */
export async function cupSeriesFinished(tx: Tx, roomId: string, seriesId: string, s: { winner: 0 | 1 | null; redWins: number; blueWins: number }, outbox: CupOutbox): Promise<void> {
  const [m] = await tx.select().from(cupMatches).where(eq(cupMatches.roomId, roomId));
  if (!m || isOver(m.status) || !m.duoA || !m.duoB) return;
  const [cup] = await tx.select().from(cups).where(eq(cups.id, m.cupId));
  if (!cup) return;
  // a dupla A joga no lado vermelho (0), a B no azul (1)
  let winnerSide = s.winner;
  let resolution: CupResolution = 'series';
  if (winnerSide === null) {
    const [caps] = await tx
      .select({ red: sql<number>`coalesce(sum(${matches.redScore}), 0)::int`, blue: sql<number>`coalesce(sum(${matches.blueScore}), 0)::int` })
      .from(matches)
      .where(eq(matches.seriesId, seriesId));
    const duos = await tx.select({ id: cupDuos.id, seed: cupDuos.seed }).from(cupDuos).where(inArray(cupDuos.id, [m.duoA, m.duoB]));
    const seedA = duos.find((d) => d.id === m.duoA)?.seed ?? 0;
    const seedB = duos.find((d) => d.id === m.duoB)?.seed ?? 0;
    winnerSide = (caps?.red ?? 0) !== (caps?.blue ?? 0) ? ((caps?.red ?? 0) > (caps?.blue ?? 0) ? 0 : 1) : seedA <= seedB ? 0 : 1;
    resolution = 'tiebreak';
  }
  await tx.update(cupMatches).set({ seriesId }).where(eq(cupMatches.id, m.id));
  await resolveMatch(tx, cup, m, { winner: winnerSide === 0 ? m.duoA : m.duoB, resolution, scoreA: s.redWins, scoreB: s.blueWins }, outbox);
}

// ---------------------------------------------------------------------------------------------
// Sala do confronto

const ROUND_NAMES_PT: Record<number, string> = { 1: 'Final', 2: 'Semifinal', 4: 'Quartas', 8: 'Oitavas', 16: '16 avos' };

/** Nome curto da fase pelo número de duplas que restam. */
export function roundName(round: number, rounds: number): string {
  return ROUND_NAMES_PT[2 ** (rounds - round - 1)] ?? `Fase ${round + 1}`;
}

/** Abre a sala Ranked 2x2 travada para as 4 contas (RN-CUP-09); sem servidor, tenta no minuto seguinte. */
async function openRoom(tx: Tx, cup: CupRow, m: MatchRow, devRoomWsUrl: string | undefined, outbox: CupOutbox): Promise<boolean> {
  const duos = await tx.select().from(cupDuos).where(inArray(cupDuos.id, [m.duoA!, m.duoB!]));
  const da = duos.find((d) => d.id === m.duoA);
  const db = duos.find((d) => d.id === m.duoB);
  if (!da || !db) return false;
  const server = pickServer(await onlineServers(tx as Db));
  if (!server && !devRoomWsUrl) return false;
  const sides: RoomCup['sides'] = {};
  for (const id of duoPlayers(da)) if (id) sides[id] = 0;
  for (const id of duoPlayers(db)) if (id) sides[id] = 1;
  const id = `c-${randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '0')}`;
  await tx.insert(rooms).values({
    id,
    name: `OutCup ${roundName(m.round, cup.rounds ?? 1)}`,
    mode: 'ranked',
    preset: 'ranked',
    maxPlayers: 4,
    persistent: false,
    format: '2x2',
    bestOf: m.bestOf,
    cup: { matchId: m.id, sides },
    ...(server ? { serverId: server.id, wsUrl: `${server.wsBaseUrl.replace(/\/$/, '')}/rooms/${id}` } : {}),
  });
  await tx.update(cupMatches).set({ roomId: id, status: 'live', updatedAt: new Date() }).where(eq(cupMatches.id, m.id));
  await outbox.add(tx, [...duoPlayers(da), ...duoPlayers(db)], { cup: cup.edition, cupEvent: 'room_open', matchId: m.id, roomId: id, ...(m.scheduledAt ? { at: m.scheduledAt.toISOString() } : {}) });
  return true;
}

/** Os dois jogadores de uma dupla estão na sala (roster do último heartbeat). */
function duoInRoom(d: DuoRow | undefined, roster: readonly { accountId?: string | undefined; bot: boolean }[]): boolean {
  if (!d) return false;
  const here = new Set(roster.filter((r) => !r.bot && r.accountId).map((r) => r.accountId));
  return [d.player1Id, d.player2Id].every((id) => id !== null && here.has(id));
}

// ---------------------------------------------------------------------------------------------
// Relógio (a cada minuto)

export interface CupClock {
  db: Db;
  mailer: Mailer;
  webUrl: string;
  devRoomWsUrl?: string | undefined;
  log?: (err: unknown, msg: string) => void;
}

/**
 * Um passo do relógio da OutCup: abre a edição seguinte, sorteia no fechamento, abre as salas na
 * hora, aplica os W.O. (atraso de 15 min e fim da janela), avisa do prazo e limpa propostas vencidas.
 */
export async function cupTick(c: CupClock, now = new Date()): Promise<void> {
  const outbox = new CupOutbox();
  await ensureNextCup(c.db, now, outbox);
  // sorteio
  const due = await c.db.select().from(cups).where(and(eq(cups.status, 'registration'), lte(cups.drawAt, now)));
  for (const cup of due) await c.db.transaction((tx) => runDraw(tx, cup, outbox));
  const running = await c.db.select().from(cups).where(eq(cups.status, 'running'));
  for (const cup of running) {
    const list = await c.db.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), inArray(cupMatches.status, ['open', 'scheduled', 'live'])));
    for (const m of list) {
      await c.db.transaction(async (tx) => {
        const [fresh] = await tx.select().from(cupMatches).where(eq(cupMatches.id, m.id)).for('update');
        if (!fresh || !fresh.duoA || !fresh.duoB) return;
        const [freshCup] = await tx.select().from(cups).where(eq(cups.id, cup.id));
        if (!freshCup || freshCup.status !== 'running') return;
        const duos = await tx.select().from(cupDuos).where(inArray(cupDuos.id, [fresh.duoA, fresh.duoB]));
        const da = duos.find((d) => d.id === fresh.duoA);
        const db = duos.find((d) => d.id === fresh.duoB);
        // proposta vencida (o horário passou sem aceite)
        if (fresh.proposedAt && fresh.proposedAt.getTime() <= now.getTime() && fresh.status === 'open') {
          await tx.update(cupMatches).set({ proposedAt: null, proposedBy: null, updatedAt: now }).where(eq(cupMatches.id, fresh.id));
        }
        // sala na hora
        if (fresh.status === 'scheduled' && fresh.scheduledAt && fresh.scheduledAt.getTime() - CUP_ROOM_LEAD_MS <= now.getTime() && !fresh.roomId) {
          await openRoom(tx, freshCup, fresh, c.devRoomWsUrl, outbox);
          return;
        }
        // atraso: 15 min depois do horário, quem não está completo na sala perde (RN-CUP-10)
        if ((fresh.status === 'live' || fresh.status === 'scheduled') && fresh.scheduledAt && now.getTime() >= fresh.scheduledAt.getTime() + CUP_TOLERANCE_MS) {
          const [room] = fresh.roomId ? await tx.select().from(rooms).where(eq(rooms.id, fresh.roomId)) : [];
          const started = room && (room.phase === 'countdown' || room.phase === 'game' || room.phase === 'finished');
          const series = fresh.roomId ? await tx.select({ id: rankedSeries.id }).from(rankedSeries).where(eq(rankedSeries.roomId, fresh.roomId)).limit(1) : [];
          if (started || series.length > 0) return;
          const roster = room?.roster ?? [];
          const aHere = duoInRoom(da, roster);
          const bHere = duoInRoom(db, roster);
          if (aHere && bHere) return; // os quatro na sala: o lobby segue (voto e "Pronto")
          await resolveMatch(tx, freshCup, fresh, aHere ? { winner: fresh.duoA, resolution: 'walkover' } : bHere ? { winner: fresh.duoB, resolution: 'walkover' } : { winner: null, resolution: 'double_walkover' }, outbox);
          return;
        }
        // fim da janela sem jogo marcado (RN-CUP-10)
        if (fresh.status === 'open' && now >= fresh.windowEnd) {
          const marks = await tx.select({ userId: cupAvailability.userId, n: sql<number>`cardinality(${cupAvailability.hours})` }).from(cupAvailability).where(eq(cupAvailability.matchId, fresh.id));
          const marked = new Set(marks.filter((x) => x.n > 0).map((x) => x.userId));
          const duoMarked = (d: DuoRow | undefined) => !!d && [d.player1Id, d.player2Id].every((id) => id !== null && marked.has(id));
          const a = duoMarked(da);
          const b = duoMarked(db);
          if (a && b) {
            await tx.update(cupMatches).set({ status: 'dispute', updatedAt: now }).where(eq(cupMatches.id, fresh.id));
            return;
          }
          await resolveMatch(tx, freshCup, fresh, a ? { winner: fresh.duoA, resolution: 'walkover' } : b ? { winner: fresh.duoB, resolution: 'walkover' } : { winner: null, resolution: 'double_walkover' }, outbox);
          return;
        }
        // prazo acabando
        if (fresh.status === 'open' && !fresh.remindedAt && now.getTime() >= fresh.windowEnd.getTime() - CUP_REMIND_MS && now >= fresh.windowStart) {
          await tx.update(cupMatches).set({ remindedAt: now }).where(eq(cupMatches.id, fresh.id));
          await outbox.add(tx, [...duoPlayers(da), ...duoPlayers(db)], { cup: freshCup.edition, cupEvent: 'deadline', matchId: fresh.id, at: fresh.windowEnd.toISOString() });
        }
      });
    }
  }
  if (outbox.notices.length > 0) liveBus.publish('cup');
  await deliver(c.db, c.mailer, c.webUrl, outbox, (err) => c.log?.(err, 'falha no e-mail da OutCup'));
}

/** Confrontos ainda com sala marcada para as próximas horas (página da copa e tela inicial). */
export async function liveCupRooms(db: Db): Promise<{ matchId: string; roomId: string }[]> {
  const rows = await db
    .select({ matchId: cupMatches.id, roomId: cupMatches.roomId })
    .from(cupMatches)
    .where(and(eq(cupMatches.status, 'live'), isNotNull(cupMatches.roomId)));
  return rows.flatMap((r) => (r.roomId ? [{ matchId: r.matchId, roomId: r.roomId }] : []));
}
