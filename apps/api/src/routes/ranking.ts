// SPDX-License-Identifier: GPL-2.0-or-later
// Leaderboard e temporadas (OG-084, D-02): consulta indexada no PostgreSQL (D-24). Temporadas
// encerradas leem a classificação final; o ranking geral soma todas as temporadas (OG-267). Com
// `format`, o rating daquele formato (OG-258, D-42); sem ele, o geral, que soma os três.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { formatRatings, ratings, seasons, seasonStandings, users } from '../db/schema.js';
import { activeSeason, formatRatingExpr, MINIMUM_SCORE, ratingExpr } from '../ranking.js';
import { CLAN_MINIMUM_MATCHES, clanLeaderboard } from '../clan-stats.js';
import { ErrorSchema, RankedFormatSchema } from './schemas.js';

const Season = Type.Object({ id: Type.Integer(), name: Type.String(), startsAt: Type.String(), endsAt: Type.Union([Type.String(), Type.Null()]), active: Type.Boolean() });
const ClanEntry = Type.Object({
  position: Type.Integer(),
  tag: Type.String(),
  name: Type.String(),
  matches: Type.Integer(),
  wins: Type.Integer(),
  draws: Type.Integer(),
  losses: Type.Integer(),
  points: Type.Integer(),
  captureDiff: Type.Integer(),
});
const Entry = Type.Object({
  position: Type.Integer(),
  userId: Type.String(),
  username: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  score: Type.Number(),
  neg: Type.Integer(),
  rating: Type.Number(),
  matches: Type.Integer(),
});

export function rankingRoutes({ database }: AppDeps): FastifyPluginAsyncTypebox {
  const { db } = database;
  return async (app) => {
    app.get(
      '/seasons',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Temporadas do ranking (a ativa recebe as partidas Ranked)',
          response: { 200: Type.Object({ seasons: Type.Array(Season) }) },
        },
      },
      async () => {
        const list = await db.select().from(seasons).orderBy(desc(seasons.startsAt));
        return {
          seasons: list.map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt?.toISOString() ?? null, active: s.active })),
        };
      },
    );

    app.get(
      '/leaderboard',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Leaderboard da temporada (geral ou de um formato, OG-258): rating = (score+1)/(neg+1), mínimo de 100 de score, desempate por score',
          querystring: Type.Object({
            season: Type.Optional(Type.Integer({ minimum: 1 })),
            format: Type.Optional(RankedFormatSchema),
            limit: Type.Integer({ minimum: 1, maximum: 100, default: 50 }),
            offset: Type.Integer({ minimum: 0, maximum: 100_000, default: 0 }),
          }),
          response: { 200: Type.Object({ season: Season, total: Type.Integer(), entries: Type.Array(Entry) }), 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const { format, limit, offset } = request.query;
        const id = request.query.season ?? (await activeSeason(db))?.id;
        const [season] = id ? await db.select().from(seasons).where(eq(seasons.id, id)) : [];
        if (!season) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
        const out = { id: season.id, name: season.name, startsAt: season.startsAt.toISOString(), endsAt: season.endsAt?.toISOString() ?? null, active: season.active };
        if (format) {
          const where = and(eq(formatRatings.seasonId, season.id), eq(formatRatings.format, format), sql`${formatRatings.score} >= ${MINIMUM_SCORE}`);
          const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(formatRatings).where(where);
          const rows = await db
            .select({ userId: formatRatings.userId, username: users.username, clanTag: users.clanTag, score: formatRatings.score, neg: formatRatings.neg, rating: formatRatingExpr, matches: formatRatings.matches })
            .from(formatRatings)
            .innerJoin(users, eq(users.id, formatRatings.userId))
            .where(where)
            .orderBy(desc(formatRatingExpr), desc(formatRatings.score), users.usernameKey)
            .limit(limit)
            .offset(offset);
          return { season: out, total: count?.n ?? 0, entries: rows.map((r, i) => ({ position: offset + i + 1, ...r, rating: Number(r.rating) })) };
        }
        // Temporada encerrada: a classificação final guardada na virada (OG-267).
        const [final] = season.active ? [] : await db.select({ n: sql<number>`count(*)::int` }).from(seasonStandings).where(eq(seasonStandings.seasonId, season.id));
        if (final && final.n > 0) {
          const rows = await db
            .select({ position: seasonStandings.position, userId: seasonStandings.userId, username: users.username, clanTag: users.clanTag, score: seasonStandings.score, neg: seasonStandings.neg, matches: seasonStandings.matches })
            .from(seasonStandings)
            .innerJoin(users, eq(users.id, seasonStandings.userId))
            .where(eq(seasonStandings.seasonId, season.id))
            .orderBy(seasonStandings.position)
            .limit(limit)
            .offset(offset);
          return { season: out, total: final.n, entries: rows.map((r) => ({ ...r, rating: (r.score + 1) / (r.neg + 1) })) };
        }
        const where = and(eq(ratings.seasonId, season.id), sql`${ratings.score} >= ${MINIMUM_SCORE}`);
        const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(ratings).where(where);
        const rows = await db
          .select({ userId: ratings.userId, username: users.username, clanTag: users.clanTag, score: ratings.score, neg: ratings.neg, rating: ratingExpr, matches: ratings.matches })
          .from(ratings)
          .innerJoin(users, eq(users.id, ratings.userId))
          .where(where)
          .orderBy(desc(ratingExpr), desc(ratings.score), users.usernameKey)
          .limit(limit)
          .offset(offset);
        return {
          season: out,
          total: count?.n ?? 0,
          entries: rows.map((r, i) => ({ position: offset + i + 1, ...r, rating: Number(r.rating) })),
        };
      },
    );
    app.get(
      '/leaderboard/overall',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Ranking geral de todas as temporadas (OG-267), opcionalmente de um formato (OG-258): soma de score e neg, rating = (score+1)/(neg+1), mínimo de 100 de score',
          querystring: Type.Object({
            format: Type.Optional(RankedFormatSchema),
            limit: Type.Integer({ minimum: 1, maximum: 100, default: 50 }),
            offset: Type.Integer({ minimum: 0, maximum: 100_000, default: 0 }),
          }),
          response: { 200: Type.Object({ seasons: Type.Integer(), total: Type.Integer(), entries: Type.Array(Entry) }) },
        },
      },
      async (request) => {
        const { format, limit, offset } = request.query;
        const source = format ? sql`(SELECT user_id, score, neg, matches FROM format_ratings WHERE format = ${format})` : sql`ratings`;
        const [counts] = await db.execute<{ seasons: number; total: number }>(sql`
          SELECT (SELECT count(*)::int FROM seasons) AS seasons,
            (SELECT count(*)::int FROM (SELECT 1 FROM ${source} r GROUP BY user_id HAVING sum(score) >= ${MINIMUM_SCORE}) t) AS total`);
        const rows = await db.execute<{ user_id: string; username: string; clan_tag: string | null; score: number; neg: number; matches: number }>(sql`
          SELECT r.user_id, u.username, u.clan_tag, sum(r.score)::float8 AS score, sum(r.neg)::int AS neg, sum(r.matches)::int AS matches
          FROM ${source} r JOIN users u ON u.id = r.user_id
          GROUP BY r.user_id, u.username, u.clan_tag, u.username_key
          HAVING sum(r.score) >= ${MINIMUM_SCORE}
          ORDER BY (sum(r.score) + 1) / (sum(r.neg) + 1) DESC, sum(r.score) DESC, u.username_key
          LIMIT ${limit} OFFSET ${offset}`);
        return {
          seasons: counts?.seasons ?? 0,
          total: counts?.total ?? 0,
          entries: rows.map((r, i) => ({
            position: offset + i + 1,
            userId: r.user_id,
            username: r.username,
            clanTag: r.clan_tag,
            score: Number(r.score),
            neg: r.neg,
            rating: (Number(r.score) + 1) / (r.neg + 1),
            matches: r.matches,
          })),
        };
      },
    );

    app.get(
      '/leaderboard/clans',
      {
        schema: {
          tags: ['ranking'],
          summary: `Ranking de clãs (OG-274, D-47): partidas clã x clã da temporada (padrão: a ativa) ou de todas (overall=true); vitória 3, empate 1, desempate por saldo de capturas, mínimo de ${CLAN_MINIMUM_MATCHES} partidas`,
          querystring: Type.Object({
            season: Type.Optional(Type.Integer({ minimum: 1 })),
            overall: Type.Boolean({ default: false }),
            limit: Type.Integer({ minimum: 1, maximum: 100, default: 50 }),
            offset: Type.Integer({ minimum: 0, maximum: 100_000, default: 0 }),
          }),
          response: {
            200: Type.Object({ season: Type.Union([Type.Null(), Season]), minimumMatches: Type.Integer(), total: Type.Integer(), entries: Type.Array(ClanEntry) }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const { overall, limit, offset } = request.query;
        let out = null;
        if (!overall) {
          const id = request.query.season ?? (await activeSeason(db))?.id;
          const [season] = id ? await db.select().from(seasons).where(eq(seasons.id, id)) : [];
          if (!season) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
          out = { id: season.id, name: season.name, startsAt: season.startsAt.toISOString(), endsAt: season.endsAt?.toISOString() ?? null, active: season.active };
        }
        const board = await clanLeaderboard(db, out?.id ?? null, limit, offset);
        return { season: out, minimumMatches: CLAN_MINIMUM_MATCHES, ...board };
      },
    );
  };
}
