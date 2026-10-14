// SPDX-License-Identifier: GPL-2.0-or-later
// API social (OG-211, RN-SOC-02/03/04): companheiros e rivais mais frequentes, clã, evolução do
// rating e busca de jogadores. Bots e convidados não entram (sem conta). Privacidade (D-39): quem
// esconde companheiros some também das listas dos outros; quem esconde o histórico não tem série
// nem totais por período publicados (o dono continua vendo os próprios dados).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import { usernameKey } from '../db/keys.js';
import { playerProfiles, users } from '../db/schema.js';
import { activeSeason } from '../ranking.js';
import { ErrorSchema } from './schemas.js';

/** Teto de custo: só as últimas partidas do jogador entram nas agregações. */
export const SOCIAL_MATCH_WINDOW = 2000;
/** Pontos da série de evolução (os mais recentes). */
export const PROGRESS_POINTS = 500;
const LIST_SIZE = 10;
const CACHE_MS = 30_000;
const CACHE_MAX = 2000;

const Name = Type.Object({ name: Type.String({ minLength: 1, maxLength: 32 }) });
const Mate = Type.Object({
  username: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  matches: Type.Integer(),
  wins: Type.Integer(),
  losses: Type.Integer(),
});
const PeriodTotals = Type.Object({
  matches: Type.Integer(),
  wins: Type.Integer(),
  kills: Type.Integer(),
  deaths: Type.Integer(),
  captures: Type.Integer(),
  playSeconds: Type.Integer(),
});

/** Cache curto em memória (respostas públicas; a do dono não entra). */
class ShortCache {
  private readonly map = new Map<string, { at: number; value: unknown }>();
  get<T>(key: string, now = Date.now()): T | undefined {
    const hit = this.map.get(key);
    if (!hit || now - hit.at > CACHE_MS) return undefined;
    return hit.value as T;
  }
  set(key: string, value: unknown, now = Date.now()): void {
    if (this.map.size >= CACHE_MAX) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { at: now, value });
  }
}

interface Target {
  id: string;
  username: string;
  clanTag: string | null;
  hideCompanions: boolean;
  hideHistory: boolean;
}

/** Escapa `%`, `_` e `\` para um LIKE de prefixo. */
export function likePrefix(text: string): string {
  return `${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function socialRoutes({ database }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  const cache = new ShortCache();

  async function target(name: string): Promise<Target | undefined> {
    const [row] = await db
      .select({ id: users.id, username: users.username, clanTag: users.clanTag, hideCompanions: playerProfiles.hideCompanions, hideHistory: playerProfiles.hideHistory })
      .from(users)
      .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
      .where(eq(users.usernameKey, usernameKey(name)));
    return row && { ...row, hideCompanions: row.hideCompanions ?? false, hideHistory: row.hideHistory ?? false };
  }
  const isOwner = async (request: FastifyRequest, t: Target) => (await sessions.current(request))?.id === t.id;
  /** Resposta pública em cache; a do dono é sempre calculada (pode ver o que escondeu). */
  async function cached<T>(key: string, owner: boolean, compute: () => Promise<T>): Promise<T> {
    if (owner) return compute();
    const hit = cache.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    cache.set(key, value);
    return value;
  }

  return async (app) => {
    app.get(
      '/players/:name/social',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Companheiros e rivais mais frequentes e o clã do jogador',
          params: Name,
          response: {
            200: Type.Object({
              hidden: Type.Boolean(),
              companions: Type.Array(Mate),
              rivals: Type.Array(Type.Intersect([Mate, Type.Object({ draws: Type.Integer(), balance: Type.Integer() })])),
              clan: Type.Union([Type.Object({ tag: Type.String(), members: Type.Array(Type.String()) }), Type.Null()]),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const t = await target(request.params.name);
        if (!t) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const owner = await isOwner(request, t);
        return cached(`social:${t.id}`, owner, async () => {
          const hidden = t.hideCompanions && !owner;
          const clan = t.clanTag
            ? {
                tag: t.clanTag,
                members: (
                  await db.execute<{ username: string }>(sql`
                    SELECT username FROM users WHERE lower(clan_tag) = lower(${t.clanTag}) ORDER BY username_key LIMIT 50`)
                ).map((r) => r.username),
              }
            : null;
          if (hidden) return { hidden: true, companions: [], rivals: [], clan };
          // resultado de cada partida do jogador: 1 vitória, 0 empate, -1 derrota
          const rows = await db.execute<{ username: string; clan_tag: string | null; together: number; won_together: number; lost_together: number; against: number; won_against: number; lost_against: number }>(sql`
            WITH mine AS (
              SELECT mp.match_id, mp.team,
                sign(CASE WHEN mp.team = 0 THEN m.red_score - m.blue_score ELSE m.blue_score - m.red_score END)::int AS result
              FROM match_players mp JOIN matches m ON m.id = mp.match_id
              WHERE mp.user_id = ${t.id}
              ORDER BY m.ended_at DESC
              LIMIT ${SOCIAL_MATCH_WINDOW}
            )
            SELECT u.username, u.clan_tag,
              count(*) FILTER (WHERE o.team = mine.team)::int AS together,
              count(*) FILTER (WHERE o.team = mine.team AND mine.result > 0)::int AS won_together,
              count(*) FILTER (WHERE o.team = mine.team AND mine.result < 0)::int AS lost_together,
              count(*) FILTER (WHERE o.team <> mine.team)::int AS against,
              count(*) FILTER (WHERE o.team <> mine.team AND mine.result > 0)::int AS won_against,
              count(*) FILTER (WHERE o.team <> mine.team AND mine.result < 0)::int AS lost_against
            FROM mine
            JOIN match_players o ON o.match_id = mine.match_id AND o.user_id IS NOT NULL AND o.user_id <> ${t.id} AND NOT o.is_bot
            JOIN users u ON u.id = o.user_id
            LEFT JOIN player_profiles pp ON pp.user_id = u.id
            WHERE NOT coalesce(pp.hide_companions, false)
            GROUP BY u.id, u.username, u.clan_tag`);
          const all = [...rows];
          const top = <R>(key: (r: (typeof all)[number]) => number, map: (r: (typeof all)[number]) => R) =>
            all
              .filter((r) => key(r) > 0)
              .sort((a, b) => key(b) - key(a) || a.username.localeCompare(b.username))
              .slice(0, LIST_SIZE)
              .map(map);
          return {
            hidden: false,
            companions: top(
              (r) => r.together,
              (r) => ({ username: r.username, clanTag: r.clan_tag, matches: r.together, wins: r.won_together, losses: r.lost_together }),
            ),
            rivals: top(
              (r) => r.against,
              (r) => ({
                username: r.username,
                clanTag: r.clan_tag,
                matches: r.against,
                wins: r.won_against,
                losses: r.lost_against,
                draws: r.against - r.won_against - r.lost_against,
                balance: r.won_against - r.lost_against,
              }),
            ),
            clan,
          };
        });
      },
    );

    app.get(
      '/players/:name/progress',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Evolução: rating por temporada, série da temporada ativa e totais por período',
          params: Name,
          response: {
            200: Type.Object({
              hidden: Type.Boolean(),
              seasons: Type.Array(Type.Object({ id: Type.Integer(), name: Type.String(), active: Type.Boolean(), score: Type.Number(), neg: Type.Integer(), rating: Type.Number(), matches: Type.Integer() })),
              /** Rating acumulado após cada partida ranqueada ou delta da temporada ativa (os últimos 500). */
              series: Type.Array(Type.Object({ at: Type.String(), score: Type.Number(), neg: Type.Integer(), rating: Type.Number() })),
              periods: Type.Union([Type.Object({ days7: PeriodTotals, days30: PeriodTotals, all: PeriodTotals }), Type.Null()]),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const t = await target(request.params.name);
        if (!t) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const owner = await isOwner(request, t);
        return cached(`progress:${t.id}`, owner, async () => {
          const seasons = (
            await db.execute<{ id: number; name: string; active: boolean; score: number; neg: number; matches: number }>(sql`
              SELECT s.id, s.name, s.active, r.score, r.neg, r.matches
              FROM ratings r JOIN seasons s ON s.id = r.season_id
              WHERE r.user_id = ${t.id} ORDER BY s.id DESC`)
          ).map((s) => ({ ...s, rating: (s.score + 1) / (s.neg + 1) }));
          if (t.hideHistory && !owner) return { hidden: true, seasons, series: [], periods: null };
          const season = await activeSeason(db);
          const series = season
            ? (
                await db.execute<{ at: Date | string; score: number; neg: number }>(sql`
                  SELECT at, score, neg FROM (
                    SELECT at, sum(score) OVER w AS score, sum(neg) OVER w AS neg
                    FROM (
                      SELECT m.ended_at AS at, mp.score_delta AS score, mp.neg_delta AS neg
                      FROM match_players mp JOIN matches m ON m.id = mp.match_id
                      WHERE mp.user_id = ${t.id} AND m.ranked AND m.season_id = ${season.id}
                      UNION ALL
                      SELECT created_at, score_delta, neg_delta FROM rating_deltas
                      WHERE user_id = ${t.id} AND season_id = ${season.id}
                    ) d
                    WINDOW w AS (ORDER BY at ROWS UNBOUNDED PRECEDING)
                    ORDER BY at DESC
                    LIMIT ${PROGRESS_POINTS}
                  ) last ORDER BY at`)
              ).map((p) => {
                const score = Number(p.score);
                const neg = Number(p.neg);
                return { at: new Date(p.at).toISOString(), score, neg, rating: (score + 1) / (neg + 1) };
              })
            : [];
          const [p] = await db.execute<Record<string, number>>(sql`
            WITH mine AS (
              SELECT m.ended_at,
                (CASE WHEN mp.team = 0 THEN m.red_score > m.blue_score ELSE m.blue_score > m.red_score END) AS won,
                mp.kills, mp.deaths, mp.captures, mp.play_seconds
              FROM match_players mp JOIN matches m ON m.id = mp.match_id
              WHERE mp.user_id = ${t.id}
            )
            SELECT
              ${periodColumns('d7', sql`ended_at > now() - interval '7 days'`)},
              ${periodColumns('d30', sql`ended_at > now() - interval '30 days'`)},
              ${periodColumns('all', sql`true`)}
            FROM mine`);
          const period = (prefix: string) => ({
            matches: p?.[`${prefix}_matches`] ?? 0,
            wins: p?.[`${prefix}_wins`] ?? 0,
            kills: p?.[`${prefix}_kills`] ?? 0,
            deaths: p?.[`${prefix}_deaths`] ?? 0,
            captures: p?.[`${prefix}_captures`] ?? 0,
            playSeconds: p?.[`${prefix}_play`] ?? 0,
          });
          return { hidden: false, seasons, series, periods: { days7: period('d7'), days30: period('d30'), all: period('all') } };
        });
      },
    );

    app.get(
      '/players',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Busca de jogadores pelo começo do nome (mesma comparação do login) ou pelo clã',
          querystring: Type.Object({
            busca: Type.String({ minLength: 1, maxLength: 32 }),
            limit: Type.Integer({ minimum: 1, maximum: 50, default: 20 }),
            offset: Type.Integer({ minimum: 0, maximum: 10_000, default: 0 }),
          }),
          response: {
            200: Type.Object({
              total: Type.Integer(),
              players: Type.Array(Type.Object({ username: Type.String(), clanTag: Type.Union([Type.String(), Type.Null()]) })),
            }),
          },
        },
      },
      async (request) => {
        const { busca, limit, offset } = request.query;
        const key = usernameKey(busca);
        const clan = busca.trim().toLowerCase();
        const where = key
          ? sql`(username_key LIKE ${likePrefix(key)} OR lower(clan_tag) = ${clan})`
          : sql`lower(clan_tag) = ${clan}`;
        const [count] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users WHERE ${where}`);
        const rows = await db.execute<{ username: string; clan_tag: string | null }>(sql`
          SELECT username, clan_tag FROM users WHERE ${where}
          ORDER BY (username_key = ${key}) DESC, username_key
          LIMIT ${limit} OFFSET ${offset}`);
        return { total: count?.n ?? 0, players: rows.map((r) => ({ username: r.username, clanTag: r.clan_tag })) };
      },
    );
  };
}

/** Totais de um período como colunas `<prefixo>_matches`, `_wins`, `_kills`, `_deaths`, `_captures`, `_play`. */
function periodColumns(prefix: string, when: SQL) {
  const as = (c: string) => sql.raw(`${prefix}_${c}`);
  return sql`count(*) FILTER (WHERE ${when})::int AS ${as('matches')},
    count(*) FILTER (WHERE ${when} AND won)::int AS ${as('wins')},
    coalesce(sum(kills) FILTER (WHERE ${when}), 0)::int AS ${as('kills')},
    coalesce(sum(deaths) FILTER (WHERE ${when}), 0)::int AS ${as('deaths')},
    coalesce(sum(captures) FILTER (WHERE ${when}), 0)::int AS ${as('captures')},
    coalesce(sum(play_seconds) FILTER (WHERE ${when}), 0)::int AS ${as('play')}`;
}
