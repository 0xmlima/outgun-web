// SPDX-License-Identifier: GPL-2.0-or-later
// Leaderboard de atributos (OG-352, D-66, RN-LDB): um ranking por stat individual das ranqueadas,
// por temporada mensal ou "sempre", com filtro de formato. Lê `match_players` (os stats estão lá
// desde o OG-080), então vale para todo o histórico. A lista de stats é a única fonte para a página
// (OG-353) e para o hall da fama (OG-354).
import { codeDefaults } from '@outgun/settings';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { usernameKey } from './db/keys.js';
import type { RankedFormat } from './ranking.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Como cada stat é ranqueado (RN-LDB-02): `rate` = por 10 minutos jogados; `ratio` = razão no
 * período; `record` = melhor partida; `average` = média no período.
 */
export type StatKind = 'rate' | 'ratio' | 'record' | 'average';

/** Ordem de exibição; `main` = stat principal, que entra no hall da fama (OG-354). */
export const LEADERBOARD_STATS = [
  { id: 'kills', kind: 'rate', main: true },
  { id: 'captures', kind: 'rate', main: true },
  { id: 'flagsReturned', kind: 'rate', main: true },
  { id: 'flagCarryingTime', kind: 'rate', main: true },
  { id: 'kd', kind: 'ratio', main: true },
  { id: 'accuracy', kind: 'ratio', main: true },
  { id: 'assists', kind: 'rate', main: false },
  { id: 'carriersKilled', kind: 'rate', main: false },
  { id: 'flagsTaken', kind: 'rate', main: false },
  { id: 'frags', kind: 'rate', main: false },
  { id: 'damage', kind: 'rate', main: false },
  { id: 'killStreak', kind: 'record', main: false },
  { id: 'averageLifetime', kind: 'average', main: false },
] as const satisfies readonly { id: string; kind: StatKind; main: boolean }[];

export type StatId = (typeof LEADERBOARD_STATS)[number]['id'];
export const STAT_IDS = LEADERBOARD_STATS.map((s) => s.id) as [StatId, ...StatId[]];

/** Mínimo de ranqueadas no período para aparecer (RN-LDB-04). */
export const LEADERBOARD_MINIMUM_MATCHES = 5;

/** Dano de um acerto no Ranked (sem power-ups): o dano bruto é acertos × isto (RN-LDB-03). */
export const RANKED_ROCKET_DAMAGE = codeDefaults().world.rocketDamage;

const num = (key: string) => `coalesce((mp.stats ->> '${key}')::float8, 0)`;
/** Somas por conta no período; os nomes são as colunas da CTE `per`. */
const SUMS = `
  count(*)::int AS matches,
  sum(mp.play_seconds)::float8 AS play,
  sum(greatest(mp.kills - ${num('botKills')}, 0))::float8 AS kills,
  sum(mp.deaths)::float8 AS deaths,
  sum(mp.captures)::float8 AS captures,
  sum(mp.frags)::float8 AS frags,
  sum(${num('assists')}) AS assists,
  sum(${num('flagsTaken')}) AS flags_taken,
  sum(${num('flagsReturned')}) AS flags_returned,
  sum(${num('carriersKilled')}) AS carriers_killed,
  sum(${num('flagCarryingTime')}) AS flag_carrying_time,
  sum(${num('hits')}) AS hits,
  sum(${num('shots')}) AS shots,
  sum(${num('lifetime')}) AS lifetime,
  max(${num('consecutiveKills')}) AS kill_streak`;

const perTenMinutes = (col: string) => ({ value: `${col} * 600 / play`, total: col });
/** Valor do ranking e total bruto (desempate) de cada stat, sobre as colunas de `per`. */
const EXPRESSIONS: Record<StatId, { value: string; total: string }> = {
  kills: perTenMinutes('kills'),
  captures: perTenMinutes('captures'),
  flagsReturned: perTenMinutes('flags_returned'),
  flagCarryingTime: perTenMinutes('flag_carrying_time'),
  assists: perTenMinutes('assists'),
  carriersKilled: perTenMinutes('carriers_killed'),
  flagsTaken: perTenMinutes('flags_taken'),
  frags: perTenMinutes('frags'),
  damage: perTenMinutes(`(hits * ${RANKED_ROCKET_DAMAGE})`),
  kd: { value: 'kills / greatest(deaths, 1)', total: 'kills' },
  accuracy: { value: 'coalesce(hits / nullif(shots, 0), 0)', total: 'hits' },
  killStreak: { value: 'kill_streak', total: 'kills' },
  // como o `average_lifetime` do original: tempo vivo / (mortes + 1), somado no período
  averageLifetime: { value: 'lifetime / (deaths + matches)', total: 'lifetime' },
};

export type StatEntry = {
  position: number;
  userId: string;
  username: string;
  clanTag: string | null;
  clanLabel: string | null;
  value: number;
  matches: number;
};

export interface BoardScope {
  /** Temporada (mês); null = sempre. */
  seasonId: number | null;
  format: RankedFormat | null;
}

function ranked(stat: StatId, scope: BoardScope): SQL {
  const e = EXPRESSIONS[stat];
  const where = sql.join(
    [
      sql`m.ranked AND NOT mp.is_bot AND mp.user_id IS NOT NULL`,
      ...(scope.seasonId !== null ? [sql`m.season_id = ${scope.seasonId}`] : []),
      ...(scope.format !== null ? [sql`m.format = ${scope.format}`] : []),
    ],
    sql` AND `,
  );
  return sql`
    WITH per AS (
      SELECT mp.user_id, ${sql.raw(SUMS)}
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE ${where}
      GROUP BY mp.user_id
      HAVING count(*) >= ${LEADERBOARD_MINIMUM_MATCHES} AND sum(mp.play_seconds) > 0
    ), scored AS (
      SELECT user_id, matches, (${sql.raw(e.value)})::float8 AS value, (${sql.raw(e.total)})::float8 AS total FROM per
    )
    SELECT (row_number() OVER (ORDER BY s.value DESC, s.total DESC, u.username_key))::int AS position,
      s.user_id AS "userId", u.username, u.clan_tag AS "clanTag", u.clan_label AS "clanLabel", s.value, s.matches, u.username_key
    FROM scored s JOIN users u ON u.id = s.user_id`;
}

/** Um stat: página da lista, total de jogadores e, com `player`, a linha dele (null se fora). */
export async function statBoard(
  db: Db | Tx,
  stat: StatId,
  scope: BoardScope,
  page: { limit: number; offset: number },
  player?: string,
): Promise<{ total: number; entries: StatEntry[]; me: StatEntry | null }> {
  const board = ranked(stat, scope);
  const [count] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM (${board}) b`);
  const strip = ({ username_key: _k, ...r }: StatEntry & { username_key: string }) => r;
  const rows = await db.execute<StatEntry & { username_key: string }>(sql`SELECT * FROM (${board}) b ORDER BY position LIMIT ${page.limit} OFFSET ${page.offset}`);
  const [me] = player ? await db.execute<StatEntry & { username_key: string }>(sql`SELECT * FROM (${board}) b WHERE username_key = ${usernameKey(player)}`) : [];
  return { total: count?.n ?? 0, entries: rows.map(strip), me: me ? strip(me) : null };
}

/** Os `top` primeiros de cada stat (visão geral da página e hall da fama). */
export async function statLeaders(db: Db | Tx, scope: BoardScope, top: number, only?: (s: (typeof LEADERBOARD_STATS)[number]) => boolean): Promise<{ stat: StatId; kind: StatKind; entries: StatEntry[] }[]> {
  const out = [];
  for (const s of LEADERBOARD_STATS.filter(only ?? (() => true))) {
    const { entries } = await statBoard(db, s.id, scope, { limit: top, offset: 0 });
    out.push({ stat: s.id, kind: s.kind, entries });
  }
  return out;
}
