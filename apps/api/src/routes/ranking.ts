// SPDX-License-Identifier: GPL-2.0-or-later
// Leaderboard e temporadas (OG-084, D-02): consulta indexada no PostgreSQL (D-24). Temporadas
// encerradas leem a classificação final; o ranking geral soma todas as temporadas (OG-267). Com
// `format`, o rating daquele formato (OG-258, D-42); sem ele, o geral, que soma os três.
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { clans, formatRatings, ratings, seasonChampions, seasons, seasonStandings, users, type ChampionBoard } from '../db/schema.js';
import { activeSeason, formatRatingExpr, MINIMUM_SCORE, ratingExpr } from '../ranking.js';
import { CLAN_MINIMUM_MATCHES, clanLeaderboard } from '../clan-stats.js';
import { LEADERBOARD_MINIMUM_MATCHES, LEADERBOARD_STATS, STAT_IDS, statBoard, statLeaders, type StatId } from '../leaderboard.js';
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
const Champion = Type.Object({
  position: Type.Integer(),
  /** Nome do jogador ou tag do clã, como era no fim da temporada. */
  name: Type.String(),
  clanName: Type.Union([Type.String(), Type.Null()]),
  /** Tag atual do clã (link); null se o clã foi apagado ou é um jogador. */
  clanTag: Type.Union([Type.String(), Type.Null()]),
  /** Rating (jogadores) ou pontos (clãs). */
  value: Type.Number(),
});
const Champions = Type.Array(Champion);
const Entry = Type.Object({
  position: Type.Integer(),
  userId: Type.String(),
  username: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  /** Tag decorada pelo estilo do clã, "(Dk)", "Dk." (OG-338). */
  clanLabel: Type.Union([Type.String(), Type.Null()]),
  score: Type.Number(),
  neg: Type.Integer(),
  rating: Type.Number(),
  matches: Type.Integer(),
});

const StatIdSchema = Type.Unsafe<StatId>({ type: 'string', enum: STAT_IDS });
const StatKindSchema = Type.Union([Type.Literal('rate'), Type.Literal('ratio'), Type.Literal('record'), Type.Literal('average')]);
const StatEntrySchema = Type.Object({
  position: Type.Integer(),
  userId: Type.String(),
  username: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  clanLabel: Type.Union([Type.String(), Type.Null()]),
  /** Valor na forma de ranquear do stat (por 10 min, razão, recorde ou média). */
  value: Type.Number(),
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
            .select({ userId: formatRatings.userId, username: users.username, clanTag: users.clanTag, clanLabel: users.clanLabel, score: formatRatings.score, neg: formatRatings.neg, rating: formatRatingExpr, matches: formatRatings.matches })
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
            .select({ position: seasonStandings.position, userId: seasonStandings.userId, username: users.username, clanTag: users.clanTag, clanLabel: users.clanLabel, score: seasonStandings.score, neg: seasonStandings.neg, matches: seasonStandings.matches })
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
          .select({ userId: ratings.userId, username: users.username, clanTag: users.clanTag, clanLabel: users.clanLabel, score: ratings.score, neg: ratings.neg, rating: ratingExpr, matches: ratings.matches })
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
        const rows = await db.execute<{ user_id: string; username: string; clan_tag: string | null; clan_label: string | null; score: number; neg: number; matches: number }>(sql`
          SELECT r.user_id, u.username, u.clan_tag, u.clan_label, sum(r.score)::float8 AS score, sum(r.neg)::int AS neg, sum(r.matches)::int AS matches
          FROM ${source} r JOIN users u ON u.id = r.user_id
          GROUP BY r.user_id, u.username, u.clan_tag, u.clan_label, u.username_key
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
            clanLabel: r.clan_label,
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

    // --- leaderboard de atributos (OG-352, D-66, RN-LDB) ---

    /** Temporada pedida (padrão: a ativa) ou null com `overall`; undefined se não existe. */
    async function scopeSeason(season: number | undefined, overall: boolean) {
      if (overall) return null;
      const id = season ?? (await activeSeason(db))?.id;
      const [row] = id ? await db.select().from(seasons).where(eq(seasons.id, id)) : [];
      return row ? { id: row.id, name: row.name, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null, active: row.active } : undefined;
    }
    const StatScope = {
      season: Type.Optional(Type.Integer({ minimum: 1 })),
      overall: Type.Boolean({ default: false }),
      format: Type.Optional(RankedFormatSchema),
    };

    app.get(
      '/leaderboard/stats',
      {
        schema: {
          tags: ['ranking'],
          summary: `Leaderboard de atributos (OG-352): os 3 primeiros de cada stat na temporada (padrão: a ativa) ou de sempre (overall=true); mínimo de ${LEADERBOARD_MINIMUM_MATCHES} ranqueadas`,
          querystring: Type.Object(StatScope),
          response: {
            200: Type.Object({ season: Type.Union([Type.Null(), Season]), minimumMatches: Type.Integer(), stats: Type.Array(Type.Object({ stat: StatIdSchema, kind: StatKindSchema, main: Type.Boolean(), entries: Type.Array(StatEntrySchema) })) }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const { overall, format } = request.query;
        const season = await scopeSeason(request.query.season, overall);
        if (season === undefined) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
        const leaders = await statLeaders(db, { seasonId: season?.id ?? null, format: format ?? null }, 3);
        const main = new Map(LEADERBOARD_STATS.map((x) => [x.id, x.main]));
        return { season, minimumMatches: LEADERBOARD_MINIMUM_MATCHES, stats: leaders.map((l) => ({ ...l, main: main.get(l.stat) ?? false })) };
      },
    );

    app.get(
      '/leaderboard/stats/:stat',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Um stat do leaderboard de atributos (OG-352, RN-LDB-02): lista paginada e, com `player`, a posição dele',
          params: Type.Object({ stat: StatIdSchema }),
          querystring: Type.Object({
            ...StatScope,
            player: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
            limit: Type.Integer({ minimum: 1, maximum: 100, default: 50 }),
            offset: Type.Integer({ minimum: 0, maximum: 100_000, default: 0 }),
          }),
          response: {
            200: Type.Object({ season: Type.Union([Type.Null(), Season]), stat: StatIdSchema, kind: StatKindSchema, minimumMatches: Type.Integer(), total: Type.Integer(), entries: Type.Array(StatEntrySchema), me: Type.Union([Type.Null(), StatEntrySchema]) }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const { overall, format, player, limit, offset } = request.query;
        const { stat } = request.params;
        const season = await scopeSeason(request.query.season, overall);
        if (season === undefined) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
        const board = await statBoard(db, stat, { seasonId: season?.id ?? null, format: format ?? null }, { limit, offset }, player);
        const kind = LEADERBOARD_STATS.find((x) => x.id === stat)!.kind;
        return { season, stat, kind, minimumMatches: LEADERBOARD_MINIMUM_MATCHES, ...board };
      },
    );

    app.get(
      '/hall-of-fame',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Hall da fama (OG-268, RN-RKL-24): os 3 primeiros de cada temporada encerrada no geral, em cada formato e entre os clãs',
          response: {
            200: Type.Object({
              seasons: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  name: Type.String(),
                  endsAt: Type.Union([Type.String(), Type.Null()]),
                  boards: Type.Object({ overall: Champions, '3x3': Champions, '4x4': Champions, '5x5': Champions, clans: Champions }),
                }),
              ),
            }),
          },
        },
      },
      async () => {
        const closed = await db.select().from(seasons).where(eq(seasons.active, false)).orderBy(desc(seasons.startsAt));
        const rows = await db
          .select({ c: seasonChampions, tag: clans.tag })
          .from(seasonChampions)
          .leftJoin(clans, eq(clans.id, seasonChampions.clanId))
          .orderBy(asc(seasonChampions.board), asc(seasonChampions.position));
        return {
          seasons: closed.map((season) => {
            const boards: Record<ChampionBoard, Static<typeof Champions>> = { overall: [], '3x3': [], '4x4': [], '5x5': [], clans: [] };
            for (const { c, tag } of rows) {
              if (c.seasonId === season.id) boards[c.board].push({ position: c.position, name: c.name, clanName: c.clanName, clanTag: tag, value: c.value });
            }
            return { id: season.id, name: season.name, endsAt: season.endsAt?.toISOString() ?? null, boards };
          }),
        };
      },
    );
  };
}
