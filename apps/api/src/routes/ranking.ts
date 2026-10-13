// SPDX-License-Identifier: GPL-2.0-or-later
// Leaderboard e temporadas (OG-084, D-02): consulta indexada no PostgreSQL (D-24).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { ratings, seasons, users } from '../db/schema.js';
import { activeSeason, MINIMUM_SCORE, ratingExpr } from '../ranking.js';
import { ErrorSchema } from './schemas.js';

const Season = Type.Object({ id: Type.Integer(), name: Type.String(), startsAt: Type.String(), endsAt: Type.Union([Type.String(), Type.Null()]), active: Type.Boolean() });
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
          summary: 'Leaderboard da temporada: rating = (score+1)/(neg+1), mínimo de 100 de score, desempate por score',
          querystring: Type.Object({
            season: Type.Optional(Type.Integer({ minimum: 1 })),
            limit: Type.Integer({ minimum: 1, maximum: 100, default: 50 }),
            offset: Type.Integer({ minimum: 0, maximum: 100_000, default: 0 }),
          }),
          response: { 200: Type.Object({ season: Season, total: Type.Integer(), entries: Type.Array(Entry) }), 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const { limit, offset } = request.query;
        const id = request.query.season ?? (await activeSeason(db))?.id;
        const [season] = id ? await db.select().from(seasons).where(eq(seasons.id, id)) : [];
        if (!season) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
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
          season: { id: season.id, name: season.name, startsAt: season.startsAt.toISOString(), endsAt: season.endsAt?.toISOString() ?? null, active: season.active },
          total: count?.n ?? 0,
          entries: rows.map((r, i) => ({ position: offset + i + 1, ...r, rating: Number(r.rating) })),
        };
      },
    );
  };
}
