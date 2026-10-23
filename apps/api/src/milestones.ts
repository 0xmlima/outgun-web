// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos (OG-213, RN-SOC-03): lê o histórico das contas, calcula com `milestonesFrom`
// (@outgun/content) e grava o que faltar. Roda na transação que grava cada partida e, para o
// histórico já gravado, em `cli.js milestones` — idempotente nos dois casos (ON CONFLICT DO NOTHING).
// Só partidas com conta e sem bots no slot; kills em bots (`stats.botKills`) não contam. Desde o
// OG-390 também mortes, tempo jogado, placar sofrido e os stats da partida (jsonb inteiro); desde o
// OG-391, modo, formato, mapa, dia, companheiros, série e os eventos. Os eventos são pesados: ao fim
// de cada partida só os dela (os marcos de evento são de uma partida só); o retroativo lê todos.
import { MILESTONES, milestonesFrom, type MilestoneEvent, type MilestoneMatch } from '@outgun/content';
import { SECRET_MILESTONES, secretMilestonesFrom } from '@outgun/content/secret';
import { sql } from 'drizzle-orm';
import type { Db } from './db/client.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Quais partidas carregam os eventos: todas (retroativo) ou só estas. */
type EventScope = 'all' | readonly string[];

/** Histórico de cada conta em ordem de término. */
async function histories(tx: Db | Tx, userIds: readonly string[], scope: EventScope): Promise<Map<string, MilestoneMatch[]>> {
  const out = new Map<string, MilestoneMatch[]>();
  if (userIds.length === 0) return out;
  const rows = await tx.execute<{
    user_id: string;
    match_id: string;
    ended_at: Date | string;
    res: number;
    kills: number;
    captures: number;
    shots: number;
    hits: number;
    deaths: number;
    play_seconds: number;
    stats: Record<string, number> | null;
    opponent: string | null;
    conceded: number;
    scored: number;
    series_won: boolean;
    sweep: boolean;
    ranked: boolean;
    format: string | null;
    map: string;
    day: string;
    team: number;
    mates: string[] | null;
    series_id: string | null;
    best_of: number | null;
    accounts: number;
    hour: number;
    short_handed: boolean;
    map_time: number | null;
  }>(sql`
    SELECT mp.user_id, m.id AS match_id, m.ended_at,
      sign(CASE WHEN mp.team = 0 THEN m.red_score - m.blue_score ELSE m.blue_score - m.red_score END)::int AS res,
      mp.kills - coalesce((mp.stats ->> 'botKills')::int, 0) AS kills,
      mp.captures,
      coalesce((mp.stats ->> 'shots')::int, 0) AS shots,
      coalesce((mp.stats ->> 'hits')::int, 0) AS hits,
      mp.deaths, mp.play_seconds, mp.stats,
      -- clã x clã (OG-259): adversário, capturas sofridas e a série md3/md5 fechada neste jogo
      CASE WHEN m.clan_war THEN coalesce(CASE WHEN mp.team = 0 THEN m.blue_clan_id ELSE m.red_clan_id END::text, m.id::text) END AS opponent,
      CASE WHEN mp.team = 0 THEN m.blue_score ELSE m.red_score END AS conceded,
      CASE WHEN mp.team = 0 THEN m.red_score ELSE m.blue_score END AS scored,
      coalesce(m.clan_war AND rs.best_of >= 3 AND rs.finished_at IS NOT NULL AND m.game_no = rs.games AND rs.winner = mp.team, false) AS series_won,
      coalesce(least(rs.red_wins, rs.blue_wins) = 0, false) AS sweep,
      m.ranked, m.format, m.map, mp.team, m.series_id, rs.best_of,
      to_char(m.ended_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
      extract(hour FROM m.ended_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      (m.details ->> 'mapTime')::int AS map_time,
      (SELECT count(DISTINCT o.user_id)::int FROM match_players o WHERE o.match_id = m.id AND NOT o.is_bot AND o.user_id IS NOT NULL) AS accounts,
      EXISTS (SELECT 1 FROM jsonb_array_elements(m.substitutions) s WHERE s ->> 'kind' = 'short' AND (s ->> 'team')::int = mp.team) AS short_handed,
      (SELECT array_agg(DISTINCT o.user_id::text) FROM match_players o
        WHERE o.match_id = m.id AND o.team = mp.team AND NOT o.is_bot AND o.user_id IS NOT NULL AND o.user_id <> mp.user_id) AS mates
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    LEFT JOIN ranked_series rs ON rs.id = m.series_id
    WHERE mp.user_id IN (${sql.join(
      userIds.map((id) => sql`${id}`),
      sql`, `,
    )}) AND NOT mp.is_bot
    ORDER BY mp.user_id, m.ended_at, m.id`);
  const events = await eventsOf(
    tx,
    scope === 'all' ? [...new Set(rows.map((r) => r.match_id))] : scope,
  );
  for (const r of rows) {
    const ev = events.get(r.match_id);
    const me = ev ? ev.players.flatMap((p, i) => (p?.userId === r.user_id ? [i] : [])) : [];
    const list = out.get(r.user_id) ?? [];
    list.push({
      matchId: r.match_id,
      endedAt: new Date(r.ended_at).toISOString(),
      result: Math.sign(Number(r.res)) as 1 | 0 | -1,
      kills: Number(r.kills),
      captures: Number(r.captures),
      shots: Number(r.shots),
      hits: Number(r.hits),
      deaths: Number(r.deaths),
      playSeconds: Number(r.play_seconds),
      conceded: Number(r.conceded),
      scored: Number(r.scored),
      ...(r.stats ? { stats: r.stats } : {}),
      ranked: r.ranked,
      ...(r.format ? { format: r.format } : {}),
      map: r.map,
      day: r.day,
      team: Number(r.team),
      mates: r.mates ?? [],
      ...(r.series_id && r.best_of ? { series: { id: r.series_id, bestOf: Number(r.best_of) } } : {}),
      accounts: Number(r.accounts),
      hour: Number(r.hour),
      shortHanded: r.short_handed,
      // `mapTime` em segundos (truncado); os eventos em décimos
      ...(r.map_time !== null ? { endTime: Number(r.map_time) * 10 } : {}),
      ...(ev && me.length > 0 ? { events: { me, teams: Array.from(ev.players, (p) => p?.team ?? -1), log: ev.log } } : {}),
      ...(r.opponent ? { clanWar: { opponent: r.opponent, conceded: Number(r.conceded), seriesWon: r.series_won, sweep: r.series_won && r.sweep } } : {}),
    });
    out.set(r.user_id, list);
  }
  return out;
}

/** Eventos e jogadores dos eventos (índice = posição) das partidas pedidas. */
async function eventsOf(tx: Db | Tx, matchIds: readonly string[]): Promise<Map<string, { log: MilestoneEvent[]; players: { userId: string | null; team: number }[] }>> {
  const out = new Map<string, { log: MilestoneEvent[]; players: { userId: string | null; team: number }[] }>();
  if (matchIds.length === 0) return out;
  const ids = sql.join(
    matchIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const logs = await tx.execute<{ match_id: string; events: MilestoneEvent[] }>(sql`SELECT match_id, events FROM match_events WHERE match_id IN (${ids})`);
  const players = await tx.execute<{ match_id: string; idx: number; user_id: string | null; team: number }>(
    sql`SELECT match_id, idx, user_id, team FROM match_event_players WHERE match_id IN (${ids}) ORDER BY match_id, idx`,
  );
  for (const l of logs) out.set(l.match_id, { log: l.events, players: [] });
  for (const p of players) {
    const ev = out.get(p.match_id);
    if (ev) ev.players[Number(p.idx)] = { userId: p.user_id, team: Number(p.team) };
  }
  return out;
}

/** Concede os marcos que faltam às contas; devolve quantos foram gravados agora. */
export async function awardMilestones(tx: Db | Tx, userIds: readonly string[], o: { beta: boolean; events?: EventScope }): Promise<number> {
  const all = await histories(tx, [...new Set(userIds)], o.events ?? 'all');
  let added = 0;
  for (const [userId, list] of all) {
    const got = [...milestonesFrom(list, o), ...secretMilestonesFrom(list)];
    if (got.length === 0) continue;
    const res = await tx.execute<{ milestone: string }>(sql`
      INSERT INTO player_milestones (user_id, milestone, achieved_at, match_id)
      VALUES ${sql.join(
        got.map((a) => sql`(${userId}, ${a.id}, ${a.endedAt}, ${a.matchId})`),
        sql`, `,
      )}
      ON CONFLICT (user_id, milestone) DO NOTHING
      RETURNING milestone`);
    added += res.length;
  }
  return added;
}

/**
 * Marcos fora da partida (OG-392): pódio do hall da fama de temporadas encerradas (quadros de
 * jogador, não o dos clãs). Campeão = top 3; Vice (OG-399) = 2º lugar. Data = fim da temporada.
 * Uma temporada só (ao fechar) ou todas (retroativo); devolve quantos foram gravados.
 */
export async function awardSeasonMilestones(tx: Db | Tx, seasonId?: number): Promise<number> {
  const only = seasonId === undefined ? sql`` : sql`AND s.id = ${seasonId}`;
  const res = await tx.execute<{ milestone: string }>(sql`
    INSERT INTO player_milestones (user_id, milestone, achieved_at, match_id)
    SELECT DISTINCT ON (c.user_id, x.milestone) c.user_id, x.milestone, coalesce(s.ends_at, now()), NULL::uuid
    FROM season_champions c JOIN seasons s ON s.id = c.season_id
    CROSS JOIN LATERAL (VALUES ('season_champion'), (CASE WHEN c.position = 2 THEN 'humor_runner_up' END)) x(milestone)
    WHERE c.user_id IS NOT NULL AND c.board <> 'clans' AND c.position <= 3 AND x.milestone IS NOT NULL AND NOT s.active ${only}
    ORDER BY c.user_id, x.milestone, s.ends_at
    ON CONFLICT (user_id, milestone) DO NOTHING
    RETURNING milestone`);
  return res.length;
}

/** Preenchimento retroativo: todas as contas com partidas, em lotes. */
export async function backfillMilestones(db: Db, o: { beta: boolean }, batch = 200): Promise<{ users: number; added: number }> {
  const ids = (await db.execute<{ user_id: string }>(sql`SELECT DISTINCT user_id FROM match_players WHERE user_id IS NOT NULL ORDER BY user_id`)).map((r) => r.user_id);
  let added = 0;
  for (let i = 0; i < ids.length; i += batch) added += await awardMilestones(db, ids.slice(i, i + batch), o);
  added += await awardSeasonMilestones(db);
  return { users: ids.length, added };
}

/** Quem descobriu primeiro cada secreto (RN-SOC-06): menor data, desempate pelo nome. */
export async function firstDiscoverers(db: Db): Promise<Map<string, string>> {
  const rows = await db.execute<{ milestone: string; username: string }>(sql`
    SELECT DISTINCT ON (pm.milestone) pm.milestone, u.username
    FROM player_milestones pm JOIN users u ON u.id = pm.user_id
    WHERE starts_with(pm.milestone, 'secret_')
    ORDER BY pm.milestone, pm.achieved_at, u.username`);
  return new Map(rows.map((r) => [r.milestone, r.username]));
}

/**
 * Calibração (OG-398): quantas contas teriam cada marco pelo histórico, sem gravar, e a fração das
 * contas que jogaram nos últimos 30 dias. Secretos devem ficar em ~1% ou menos.
 */
export async function calibrateMilestones(db: Db, o: { beta: boolean }, batch = 200): Promise<{ active: number; rows: { id: string; users: number; share: number }[] }> {
  const ids = (await db.execute<{ user_id: string }>(sql`SELECT DISTINCT user_id FROM match_players WHERE user_id IS NOT NULL ORDER BY user_id`)).map((r) => r.user_id);
  const [act] = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT mp.user_id)::int AS n FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id IS NOT NULL AND m.ended_at > now() - interval '30 days'`);
  const active = Math.max(1, Number(act?.n ?? 0));
  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += batch) {
    for (const list of (await histories(db, ids.slice(i, i + batch), 'all')).values()) {
      for (const a of [...milestonesFrom(list, o), ...secretMilestonesFrom(list)]) counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    }
  }
  const rows = [...MILESTONES, ...SECRET_MILESTONES].map((m) => ({ id: m.id, users: counts.get(m.id) ?? 0, share: (counts.get(m.id) ?? 0) / active }));
  return { active, rows };
}

