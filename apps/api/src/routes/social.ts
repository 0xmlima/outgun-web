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
          // resumos de player_pairs (src/social-stats.ts); quem esconde companheiros não aparece aqui
          type Pair = { username: string; clan_tag: string | null; together: number; won_together: number; lost_together: number; against: number; won_against: number; lost_against: number };
          const top = (order: 'together' | 'against') =>
            db.execute<Pair>(sql`
              SELECT u.username, u.clan_tag, pp.together, pp.won_together, pp.lost_together, pp.against, pp.won_against, pp.lost_against
              FROM player_pairs pp
              JOIN users u ON u.id = pp.other_id
              LEFT JOIN player_profiles pr ON pr.user_id = pp.other_id
              WHERE pp.user_id = ${t.id} AND ${sql.raw(`pp.${order}`)} > 0 AND NOT coalesce(pr.hide_companions, false)
              ORDER BY ${sql.raw(`pp.${order}`)} DESC, u.username_key
              LIMIT ${LIST_SIZE}`);
          const [companions, rivals] = await Promise.all([top('together'), top('against')]);
          return {
            hidden: false,
            companions: companions.map((r) => ({ username: r.username, clanTag: r.clan_tag, matches: r.together, wins: r.won_together, losses: r.lost_together })),
            rivals: rivals.map((r) => ({
              username: r.username,
              clanTag: r.clan_tag,
              matches: r.against,
              wins: r.won_against,
              losses: r.lost_against,
              draws: r.against - r.won_against - r.lost_against,
              balance: r.won_against - r.lost_against,
            })),
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
                    SELECT at, sum(score_delta) OVER w AS score, sum(neg_delta) OVER w AS neg
                    FROM rating_points
                    WHERE user_id = ${t.id} AND season_id = ${season.id}
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
          // totais por dia (UTC) de player_daily: 7 e 30 dias contam hoje
          const [p] = await db.execute<Record<string, number>>(sql`
            SELECT
              ${periodColumns('d7', sql`day > current_date - 7`)},
              ${periodColumns('d30', sql`day > current_date - 30`)},
              ${periodColumns('all', sql`true`)}
            FROM player_daily WHERE user_id = ${t.id}`);
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
  const sum = (col: string, as: string) => sql`coalesce(sum(${sql.raw(col)}) FILTER (WHERE ${when}), 0)::int AS ${sql.raw(`${prefix}_${as}`)}`;
  return sql.join([sum('matches', 'matches'), sum('wins', 'wins'), sum('kills', 'kills'), sum('deaths', 'deaths'), sum('captures', 'captures'), sum('play_seconds', 'play')], sql`, `);
}
