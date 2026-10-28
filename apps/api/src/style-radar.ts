// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo de jogo (OG-469, D-84, RN-RAD): 6 eixos em percentil contra os ativos do período
// e o arquétipo que sai do formato. Uma consulta só por período traz todas as contas; o perfil de um
// jogador, a mediana do clã (OG-473) e a sombra do top 10 (OG-476) saem da mesma lista.
import { sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { LEADERBOARD_MINIMUM_MATCHES, type BoardScope } from './leaderboard.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Ordem fixa (RN-RAD-01): duelo à direita, time à esquerda, bandeira embaixo. */
export const STYLE_AXES = ['kills', 'accuracy', 'survival', 'flag', 'defense', 'team'] as const;
export type StyleAxis = (typeof STYLE_AXES)[number];
export type AxisValues = Record<StyleAxis, number>;

/** Amostra (RN-RAD-03): abaixo de 3 ranqueadas não há radar; de 3 a 9 é "poucos jogos". */
export const STYLE_MINIMUM_GAMES = 3;
export const STYLE_FULL_SAMPLE = 10;

export const ARCHETYPES = ['shooter', 'runner', 'wall', 'support', 'survivor', 'joker'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
/** Amplitude (maior − menor percentil) abaixo disto = Coringa (RN-RAD-04). */
export const JOKER_AMPLITUDE = 20;
const ARCHETYPE_OF_AXIS: Record<StyleAxis, Archetype> = { kills: 'shooter', accuracy: 'shooter', survival: 'survivor', flag: 'runner', defense: 'wall', team: 'support' };

/**
 * Percentil (0–100) de um valor contra a população (sem o próprio jogador): fração dos que ficam
 * abaixo, com metade dos empates. Sozinho no período = 100.
 */
export function percentileOf(value: number, others: readonly number[]): number {
  if (others.length === 0) return 100;
  let below = 0;
  let equal = 0;
  for (const o of others) {
    if (o < value) below++;
    else if (o === value) equal++;
  }
  return Math.round(((below + equal / 2) / others.length) * 100);
}

/** Arquétipo (RN-RAD-04); no empate do eixo mais alto vale a ordem de STYLE_AXES. */
export function archetypeOf(p: AxisValues): Archetype {
  const values = STYLE_AXES.map((a) => p[a]);
  if (Math.max(...values) - Math.min(...values) < JOKER_AMPLITUDE) return 'joker';
  let best: StyleAxis = STYLE_AXES[0];
  for (const a of STYLE_AXES) if (p[a] > p[best]) best = a;
  return ARCHETYPE_OF_AXIS[best];
}

/** Somas de uma conta no período, já nos valores brutos dos eixos. */
export interface StyleRow {
  userId: string;
  username: string;
  usernameKey: string;
  clanTag: string | null;
  games: number;
  raw: AxisValues;
}

export interface StyleProfile extends StyleRow {
  lowSample: boolean;
  percentiles: AxisValues;
  archetype: Archetype;
}

const num = (key: string) => `coalesce((mp.stats ->> '${key}')::float8, 0)`;
const per10 = (col: string) => `CASE WHEN play > 0 THEN ${col} * 600 / play ELSE 0 END`;

/** Uma linha por conta com pelo menos uma ranqueada no período (RN-RAD-01/02: sem bots nem Casual). */
export async function styleRows(db: Db | Tx, scope: BoardScope): Promise<StyleRow[]> {
  const where = sql.join(
    [
      sql`m.ranked AND NOT mp.is_bot AND mp.user_id IS NOT NULL`,
      ...(scope.seasonId !== null ? [sql`m.season_id = ${scope.seasonId}`] : []),
      ...(scope.format !== null ? [sql`m.format = ${scope.format}`] : []),
    ],
    sql` AND `,
  );
  // Defesa: `defenses` e `carriersKilled` só se sobrepõem quando o portador inimigo morre perto do
  // nosso portador (raro); somar os dois é o que a RN-RAD-01 pede.
  const rows = await db.execute<{ user_id: string; username: string; username_key: string; clan_tag: string | null; games: number } & AxisValues>(sql`
    WITH per AS (
      SELECT mp.user_id, count(*)::int AS games, sum(mp.play_seconds)::float8 AS play, sum(mp.deaths)::float8 AS deaths,
        sum(greatest(mp.kills - ${sql.raw(num('botKills'))}, 0))::float8 AS kills,
        sum(${sql.raw(num('hits'))}) AS hits, sum(${sql.raw(num('shots'))}) AS shots, sum(${sql.raw(num('lifetime'))}) AS lifetime,
        sum(${sql.raw(num('flagsTaken'))} + 3 * mp.captures) AS flag,
        sum(${sql.raw(num('flagsReturned'))} + ${sql.raw(num('carriersKilled'))} + ${sql.raw(num('defenses'))}) AS defense,
        sum(${sql.raw(num('assists'))} + ${sql.raw(num('trades'))}) AS team
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE ${where}
      GROUP BY mp.user_id
    )
    SELECT p.user_id, u.username, u.username_key, u.clan_tag, p.games,
      (${sql.raw(per10('kills'))})::float8 AS kills,
      coalesce(hits / nullif(shots, 0), 0)::float8 AS accuracy,
      (lifetime / (deaths + games))::float8 AS survival,
      (${sql.raw(per10('flag'))})::float8 AS flag,
      (${sql.raw(per10('defense'))})::float8 AS defense,
      (${sql.raw(per10('team'))})::float8 AS team
    FROM per p JOIN users u ON u.id = p.user_id`);
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    usernameKey: r.username_key,
    clanTag: r.clan_tag,
    games: r.games,
    raw: Object.fromEntries(STYLE_AXES.map((a) => [a, Number(r[a])])) as AxisValues,
  }));
}

/**
 * Perfil de cada conta com radar (≥ 3 ranqueadas): percentil contra os ativos do período (mínimo da
 * RN-LDB-04), sem contar a si mesma. Quem tem 3 ou 4 partidas tem radar mas não entra na população.
 */
export function styleProfiles(rows: readonly StyleRow[]): Map<string, StyleProfile> {
  const population = rows.filter((r) => r.games >= LEADERBOARD_MINIMUM_MATCHES);
  const out = new Map<string, StyleProfile>();
  for (const r of rows) {
    if (r.games < STYLE_MINIMUM_GAMES) continue;
    const others = population.filter((o) => o.userId !== r.userId);
    const percentiles = Object.fromEntries(STYLE_AXES.map((a) => [a, percentileOf(r.raw[a], others.map((o) => o.raw[a]))])) as AxisValues;
    out.set(r.userId, { ...r, lowSample: r.games < STYLE_FULL_SAMPLE, percentiles, archetype: archetypeOf(percentiles) });
  }
  return out;
}

/** Cache curto por período: o cálculo percorre a temporada inteira. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rows: StyleRow[]; profiles: Map<string, StyleProfile> }>();

export async function stylePeriod(db: Db | Tx, scope: BoardScope): Promise<{ rows: StyleRow[]; profiles: Map<string, StyleProfile> }> {
  const key = `${scope.seasonId ?? 'all'}:${scope.format ?? 'all'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const rows = await styleRows(db, scope);
  const entry = { at: Date.now(), rows, profiles: styleProfiles(rows) };
  cache.set(key, entry);
  return entry;
}

/** Para os testes, que gravam partidas entre uma consulta e outra. */
export function clearStyleCache(): void {
  cache.clear();
}
