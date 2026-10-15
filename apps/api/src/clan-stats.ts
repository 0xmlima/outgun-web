// SPDX-License-Identifier: GPL-2.0-or-later
// Estatísticas do clã (OG-273, RN-CLA-06): partidas e séries clã x clã (OG-259) e os números dos
// membros enquanto eram do clã. Tudo sai de `match_players.clan_id` e das colunas de clã da partida,
// gravadas no fim de cada jogo: quem sai do clã não leva nem apaga o que fez por ele.
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client.js';

export interface Period {
  /** Partidas que terminaram em [from, to); sem limites = todas. */
  from?: Date;
  to?: Date | null;
}

export type WarTotals = {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  capturesFor: number;
  capturesAgainst: number;
  series: number;
  seriesWon: number;
};

export type Opponent = {
  tag: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
};

export type MemberLine = {
  username: string;
  matches: number;
  kills: number;
  captures: number;
  playSeconds: number;
};

const within = (p: Period): SQL => sql`${p.from ? sql`m.ended_at >= ${p.from.toISOString()}` : sql`true`} AND ${p.to ? sql`m.ended_at < ${p.to.toISOString()}` : sql`true`}`;

/** Partidas clã x clã do clã, do ponto de vista dele: lado, placar a favor e contra, adversário. */
const warRows = (clanId: string, p: Period) => sql`
  SELECT m.id, m.series_id, m.game_no,
    CASE WHEN m.red_clan_id = ${clanId} THEN 0 ELSE 1 END AS side,
    CASE WHEN m.red_clan_id = ${clanId} THEN m.red_score ELSE m.blue_score END AS gf,
    CASE WHEN m.red_clan_id = ${clanId} THEN m.blue_score ELSE m.red_score END AS ga,
    CASE WHEN m.red_clan_id = ${clanId} THEN m.blue_clan_id ELSE m.red_clan_id END AS opponent
  FROM matches m
  WHERE m.clan_war AND (m.red_clan_id = ${clanId} OR m.blue_clan_id = ${clanId}) AND ${within(p)}`;

export async function clanWarTotals(db: Db, clanId: string, p: Period = {}): Promise<WarTotals> {
  const [r] = await db.execute<Record<keyof WarTotals, number>>(sql`
    WITH w AS (${warRows(clanId, p)})
    SELECT count(*)::int AS matches,
      count(*) FILTER (WHERE gf > ga)::int AS wins,
      count(*) FILTER (WHERE gf < ga)::int AS losses,
      count(*) FILTER (WHERE gf = ga)::int AS draws,
      coalesce(sum(gf), 0)::int AS "capturesFor",
      coalesce(sum(ga), 0)::int AS "capturesAgainst",
      (SELECT count(DISTINCT series_id) FROM w WHERE series_id IS NOT NULL)::int AS series,
      -- série vencida: o lado do clã no jogo que a fechou é o vencedor
      (SELECT count(*) FROM w JOIN ranked_series rs ON rs.id = w.series_id
        WHERE rs.finished_at IS NOT NULL AND w.game_no = rs.games AND rs.winner = w.side)::int AS "seriesWon"
    FROM w`);
  return { matches: 0, wins: 0, losses: 0, draws: 0, capturesFor: 0, capturesAgainst: 0, series: 0, seriesWon: 0, ...r };
}

/** Adversários mais frequentes e o retrospecto contra cada um (clãs apagados ficam de fora). */
export async function clanOpponents(db: Db, clanId: string, p: Period = {}, limit = 10): Promise<Opponent[]> {
  const rows = await db.execute<Opponent>(sql`
    WITH w AS (${warRows(clanId, p)})
    SELECT c.tag, c.name, count(*)::int AS matches,
      count(*) FILTER (WHERE gf > ga)::int AS wins,
      count(*) FILTER (WHERE gf < ga)::int AS losses,
      count(*) FILTER (WHERE gf = ga)::int AS draws
    FROM w JOIN clans c ON c.id = w.opponent
    GROUP BY c.id, c.tag, c.name
    ORDER BY count(*) DESC, c.tag_key
    LIMIT ${limit}`);
  return [...rows];
}

/** Números dos membros pelo clã (partidas jogadas com o clã, de qualquer modo), quem mais jogou primeiro. */
export async function clanMembersStats(db: Db, clanId: string, p: Period = {}): Promise<{ totals: Omit<MemberLine, 'username'>; members: MemberLine[] }> {
  const rows = await db.execute<MemberLine>(sql`
    SELECT u.username, count(*)::int AS matches, coalesce(sum(mp.kills), 0)::int AS kills,
      coalesce(sum(mp.captures), 0)::int AS captures, coalesce(sum(mp.play_seconds), 0)::int AS "playSeconds"
    FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
    WHERE mp.clan_id = ${clanId} AND NOT mp.is_bot AND ${within(p)}
    GROUP BY u.id, u.username, u.username_key
    ORDER BY count(*) DESC, u.username_key`);
  const [t] = await db.execute<{ matches: number }>(sql`
    SELECT count(DISTINCT mp.match_id)::int AS matches FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.clan_id = ${clanId} AND NOT mp.is_bot AND ${within(p)}`);
  const members = [...rows];
  return {
    totals: {
      matches: t?.matches ?? 0,
      kills: members.reduce((s, m) => s + m.kills, 0),
      captures: members.reduce((s, m) => s + m.captures, 0),
      playSeconds: members.reduce((s, m) => s + m.playSeconds, 0),
    },
    members,
  };
}

// --- ranking de clãs (OG-274, RN-CLA-07, D-47) ---

/** Pontos por partida clã x clã e o mínimo de partidas para aparecer. */
export const CLAN_WIN_POINTS = 3;
export const CLAN_DRAW_POINTS = 1;
export const CLAN_MINIMUM_MATCHES = 3;

export type ClanStanding = {
  position: number;
  tag: string;
  name: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  /** Saldo de capturas (desempate). */
  captureDiff: number;
};

/**
 * Ranking de clãs na temporada `seasonId` (pela temporada da partida) ou no geral (todas): vitória 3,
 * empate 1, desempate por saldo de capturas e depois pela tag; mínimo de 3 partidas.
 */
export async function clanLeaderboard(db: Db, seasonId: number | null, limit: number, offset: number): Promise<{ total: number; entries: ClanStanding[] }> {
  const scope = seasonId === null ? sql`true` : sql`m.season_id = ${seasonId}`;
  const board = sql`
    WITH sides AS (
      SELECT m.red_clan_id AS clan, m.red_score AS gf, m.blue_score AS ga FROM matches m WHERE m.clan_war AND ${scope}
      UNION ALL
      SELECT m.blue_clan_id, m.blue_score, m.red_score FROM matches m WHERE m.clan_war AND ${scope}
    )
    SELECT c.tag, c.name, c.tag_key, count(*)::int AS matches,
      count(*) FILTER (WHERE gf > ga)::int AS wins,
      count(*) FILTER (WHERE gf = ga)::int AS draws,
      count(*) FILTER (WHERE gf < ga)::int AS losses,
      (${CLAN_WIN_POINTS} * count(*) FILTER (WHERE gf > ga) + ${CLAN_DRAW_POINTS} * count(*) FILTER (WHERE gf = ga))::int AS points,
      coalesce(sum(gf - ga), 0)::int AS "captureDiff"
    FROM sides JOIN clans c ON c.id = sides.clan
    GROUP BY c.id, c.tag, c.name, c.tag_key
    HAVING count(*) >= ${CLAN_MINIMUM_MATCHES}`;
  const [count] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM (${board}) b`);
  const rows = await db.execute<Omit<ClanStanding, 'position'> & { tag_key: string }>(sql`
    SELECT * FROM (${board}) b ORDER BY points DESC, "captureDiff" DESC, tag_key LIMIT ${limit} OFFSET ${offset}`);
  return { total: count?.n ?? 0, entries: rows.map(({ tag_key: _key, ...r }, i) => ({ position: offset + i + 1, ...r })) };
}
