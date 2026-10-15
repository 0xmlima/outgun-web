// SPDX-License-Identifier: GPL-2.0-or-later
// Perfil público, histórico e partida (OG-085, RN-STA-01/03): estatísticas separadas por modo
// (Ranked e Casual, RN-MOD-05) e a partida com o conteúdo do `save_stats` do original.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { AppDeps, Services } from '../app.js';
import { usernameKey } from '../db/keys.js';
import { matches, matchPlayers, playerMilestones, playerProfiles, rankedSeries, ratings, users } from '../db/schema.js';
import { activeSeason, MINIMUM_SCORE, playerRating } from '../ranking.js';
import { ErrorSchema, GameModeSchema, RankedFormatSchema, SeriesBestOfSchema } from './schemas.js';

const Totals = Type.Object({
  matches: Type.Integer(),
  wins: Type.Integer(),
  losses: Type.Integer(),
  draws: Type.Integer(),
  frags: Type.Integer(),
  kills: Type.Integer(),
  deaths: Type.Integer(),
  captures: Type.Integer(),
  assists: Type.Integer(),
  flagsReturned: Type.Integer(),
  carriersKilled: Type.Integer(),
  shots: Type.Integer(),
  hits: Type.Integer(),
  playSeconds: Type.Integer(),
});
const MatchSummary = Type.Object({
  id: Type.String(),
  endedAt: Type.String(),
  mode: GameModeSchema,
  ranked: Type.Boolean(),
  map: Type.String(),
  /** Título do mapa (`P title`), que a partida e o relatório mostram; o arquivo (`map`) quando faltar (OG-207). */
  mapTitle: Type.String(),
  redScore: Type.Integer(),
  blueScore: Type.Integer(),
});
/** Série Ranked (OG-257, RN-RKL-03): placar e os jogos dela, em ordem. */
const SeriesView = Type.Object({
  id: Type.String(),
  format: RankedFormatSchema,
  bestOf: SeriesBestOfSchema,
  games: Type.Integer(),
  redWins: Type.Integer(),
  blueWins: Type.Integer(),
  /** 0 = vermelho, 1 = azul; null = em andamento ou empatada. */
  winner: Type.Union([Type.Null(), Type.Literal(0), Type.Literal(1)]),
  finished: Type.Boolean(),
  startedAt: Type.String(),
  matches: Type.Array(Type.Object({ id: Type.String(), gameNo: Type.Union([Type.Null(), Type.Integer()]), mapTitle: Type.String(), redScore: Type.Integer(), blueScore: Type.Integer(), endedAt: Type.String() })),
});
const PlayerLine = Type.Object({
  slot: Type.Integer(),
  name: Type.String(),
  username: Type.Union([Type.String(), Type.Null()]),
  team: Type.Integer(),
  isBot: Type.Boolean(),
  frags: Type.Integer(),
  kills: Type.Integer(),
  deaths: Type.Integer(),
  captures: Type.Integer(),
  playSeconds: Type.Integer(),
  scoreDelta: Type.Number(),
  negDelta: Type.Integer(),
  stats: Type.Record(Type.String(), Type.Number()),
});

const won = sql`CASE WHEN ${matchPlayers.team} = 0 THEN ${matches.redScore} > ${matches.blueScore} ELSE ${matches.blueScore} > ${matches.redScore} END`;
const stat = (key: string) => sql<number>`coalesce(sum((${matchPlayers.stats} ->> ${key})::numeric), 0)::int`;

export function playerRoutes({ database }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  return async (app) => {
    app.get(
      '/players/:name',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Perfil público: nome, clã, posição no ranking e estatísticas por modo',
          params: Type.Object({ name: Type.String({ minLength: 1, maxLength: 32 }) }),
          response: {
            200: Type.Object({
              user: Type.Object({ id: Type.String(), username: Type.String(), clanTag: Type.Union([Type.String(), Type.Null()]), createdAt: Type.String() }),
              ranking: Type.Union([
                Type.Object({ season: Type.String(), score: Type.Number(), neg: Type.Integer(), rating: Type.Number(), rank: Type.Integer(), of: Type.Integer(), matches: Type.Integer(), minimumScore: Type.Integer() }),
                Type.Null(),
              ]),
              totals: Type.Object({ ranked: Totals, casual: Totals }),
              /** Cores favoritas (índices da paleta) e data da última partida (null se escondeu o histórico). */
              favoriteColors: Type.Array(Type.Integer()),
              lastMatchAt: Type.Union([Type.String(), Type.Null()]),
              /** Marcos conquistados (OG-213); a partida some se o histórico estiver escondido. */
              milestones: Type.Array(Type.Object({ id: Type.String(), achievedAt: Type.String(), matchId: Type.Union([Type.String(), Type.Null()]) })),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [user] = await db.select().from(users).where(eq(users.usernameKey, usernameKey(request.params.name)));
        if (!user) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const season = await activeSeason(db);
        let ranking = null;
        if (season) {
          const r = await playerRating(db, user.id);
          const [row] = await db.select({ matches: ratings.matches }).from(ratings).where(and(eq(ratings.userId, user.id), eq(ratings.seasonId, season.id)));
          ranking = { season: season.name, score: r.score, neg: r.neg, rating: (r.score + 1) / (r.neg + 1), rank: r.rank, of: r.of, matches: row?.matches ?? 0, minimumScore: MINIMUM_SCORE };
        }
        const rows = await db
          .select({
            mode: matches.mode,
            matches: sql<number>`count(*)::int`,
            wins: sql<number>`count(*) FILTER (WHERE ${won})::int`,
            draws: sql<number>`count(*) FILTER (WHERE ${matches.redScore} = ${matches.blueScore})::int`,
            frags: sql<number>`coalesce(sum(${matchPlayers.frags}), 0)::int`,
            kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
            deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
            captures: sql<number>`coalesce(sum(${matchPlayers.captures}), 0)::int`,
            assists: stat('assists'),
            flagsReturned: stat('flagsReturned'),
            carriersKilled: stat('carriersKilled'),
            shots: stat('shots'),
            hits: stat('hits'),
            playSeconds: sql<number>`coalesce(sum(${matchPlayers.playSeconds}), 0)::int`,
          })
          .from(matchPlayers)
          .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
          .where(eq(matchPlayers.userId, user.id))
          .groupBy(matches.mode);
        const empty = { matches: 0, wins: 0, losses: 0, draws: 0, frags: 0, kills: 0, deaths: 0, captures: 0, assists: 0, flagsReturned: 0, carriersKilled: 0, shots: 0, hits: 0, playSeconds: 0 };
        const totals = { ranked: { ...empty }, casual: { ...empty } };
        for (const { mode, ...t } of rows) totals[mode] = { ...t, losses: t.matches - t.wins - t.draws };
        const [profile] = await db.select({ favoriteColors: playerProfiles.favoriteColors, hideHistory: playerProfiles.hideHistory }).from(playerProfiles).where(eq(playerProfiles.userId, user.id));
        const showHistory = !profile?.hideHistory || (await sessions.current(request))?.id === user.id;
        const [last] = showHistory
          ? await db.select({ at: sql<Date>`max(${matches.endedAt})` }).from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId)).where(eq(matchPlayers.userId, user.id))
          : [];
        const milestones = await db
          .select({ id: playerMilestones.milestone, achievedAt: playerMilestones.achievedAt, matchId: playerMilestones.matchId })
          .from(playerMilestones)
          .where(eq(playerMilestones.userId, user.id))
          .orderBy(asc(playerMilestones.achievedAt));
        return {
          user: { id: user.id, username: user.username, clanTag: user.clanTag, createdAt: user.createdAt.toISOString() },
          ranking,
          totals,
          favoriteColors: profile?.favoriteColors ?? [],
          lastMatchAt: last?.at ? new Date(last.at).toISOString() : null,
          milestones: milestones.map((x) => ({ id: x.id, achievedAt: x.achievedAt.toISOString(), matchId: showHistory ? x.matchId : null })),
        };
      },
    );

    app.get(
      '/players/:name/matches',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Histórico de partidas do jogador (mais recentes primeiro)',
          params: Type.Object({ name: Type.String({ minLength: 1, maxLength: 32 }) }),
          querystring: Type.Object({
            mode: Type.Optional(GameModeSchema),
            limit: Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
            offset: Type.Integer({ minimum: 0, maximum: 100_000, default: 0 }),
          }),
          response: {
            200: Type.Object({
              total: Type.Integer(),
              /** O jogador escondeu o histórico (OG-211, D-39); o dono continua vendo. */
              hidden: Type.Boolean(),
              matches: Type.Array(Type.Intersect([MatchSummary, Type.Object({ replayUrl: Type.Union([Type.Null(), Type.String()]), player: Type.Omit(PlayerLine, ['username', 'stats']) })])),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [user] = await db
          .select({ id: users.id, hideHistory: playerProfiles.hideHistory })
          .from(users)
          .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
          .where(eq(users.usernameKey, usernameKey(request.params.name)));
        if (!user) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        if (user.hideHistory && (await sessions.current(request))?.id !== user.id) return { total: 0, hidden: true, matches: [] };
        const { mode, limit, offset } = request.query;
        const where = and(eq(matchPlayers.userId, user.id), mode ? eq(matches.mode, mode) : undefined);
        const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId)).where(where);
        const rows = await db
          .select({ m: matches, p: matchPlayers })
          .from(matchPlayers)
          .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
          .where(where)
          .orderBy(desc(matches.endedAt))
          .limit(limit)
          .offset(offset);
        return {
          total: count?.n ?? 0,
          hidden: false,
          matches: rows.map(({ m, p }) => ({
            ...summary(m),
            replayUrl: m.replayUrl,
            player: { slot: p.slot, name: p.name, team: p.team, isBot: p.isBot, frags: p.frags, kills: p.kills, deaths: p.deaths, captures: p.captures, playSeconds: p.playSeconds, scoreDelta: p.scoreDelta, negDelta: p.negDelta },
          })),
        };
      },
    );

    app.get(
      '/rooms/:id/last-match',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Última partida registrada de uma sala (o "Ver relatório" do fim de partida, OG-214)',
          params: Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }) }),
          querystring: Type.Object({ after: Type.Optional(Type.String({ format: 'date-time' })) }),
          response: { 200: Type.Object({ id: Type.String() }), 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const { after } = request.query;
        const [m] = await db
          .select({ id: matches.id })
          .from(matches)
          .where(and(eq(matches.roomId, request.params.id), after ? gte(matches.endedAt, new Date(after)) : undefined))
          .orderBy(desc(matches.endedAt))
          .limit(1);
        if (!m) return reply.code(404).send({ error: 'match_not_found', message: 'match not found' });
        return m;
      },
    );

    app.get(
      '/matches/:id',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Partida: regras, estatísticas de time, de cada jogador e capturas',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          response: {
            200: Type.Object({
              match: Type.Intersect([MatchSummary, Type.Object({ startedAt: Type.String(), roomId: Type.Union([Type.String(), Type.Null()]), seasonId: Type.Union([Type.Integer(), Type.Null()]) })]),
              details: Type.Record(Type.String(), Type.Unknown()),
              players: Type.Array(PlayerLine),
              /** Replay da partida, quando houver (OG-090; o game server apaga após a retenção). */
              replayUrl: Type.Union([Type.Null(), Type.String()]),
              /** Marcos conquistados nesta partida (OG-213). */
              milestones: Type.Array(Type.Object({ username: Type.String(), milestone: Type.String() })),
              /** Formato, número do jogo e a série, nas partidas de sala com formato (OG-257). */
              format: Type.Union([Type.Null(), RankedFormatSchema]),
              gameNo: Type.Union([Type.Null(), Type.Integer()]),
              series: Type.Union([Type.Null(), SeriesView]),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [m] = await db.select().from(matches).where(eq(matches.id, request.params.id));
        if (!m) return reply.code(404).send({ error: 'match_not_found', message: 'match not found' });
        const players = await db
          .select({ p: matchPlayers, username: users.username })
          .from(matchPlayers)
          .leftJoin(users, eq(users.id, matchPlayers.userId))
          .where(eq(matchPlayers.matchId, m.id))
          .orderBy(asc(matchPlayers.team), desc(matchPlayers.frags), asc(matchPlayers.slot));
        return {
          match: { ...summary(m), startedAt: m.startedAt.toISOString(), roomId: m.roomId, seasonId: m.seasonId },
          details: m.details,
          players: players.map(({ p, username }) => ({
            slot: p.slot, name: p.name, username, team: p.team, isBot: p.isBot, frags: p.frags, kills: p.kills, deaths: p.deaths, captures: p.captures,
            playSeconds: p.playSeconds, scoreDelta: p.scoreDelta, negDelta: p.negDelta, stats: p.stats,
          })),
          replayUrl: m.replayUrl,
          milestones: await db
            .select({ username: users.username, milestone: playerMilestones.milestone })
            .from(playerMilestones)
            .innerJoin(users, eq(users.id, playerMilestones.userId))
            .where(eq(playerMilestones.matchId, m.id))
            .orderBy(asc(users.usernameKey)),
          format: m.format,
          gameNo: m.gameNo,
          series: m.seriesId ? await seriesView(m.seriesId) : null,
        };
      },
    );

    app.get(
      '/series/:id',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Série Ranked: formato, placar, vencedor e os relatórios de cada jogo (OG-257)',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          response: { 200: Type.Object({ series: SeriesView }), 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const series = await seriesView(request.params.id);
        if (!series) return reply.code(404).send({ error: 'series_not_found', message: 'series not found' });
        return { series };
      },
    );

    async function seriesView(id: string) {
      const [s] = await db.select().from(rankedSeries).where(eq(rankedSeries.id, id));
      if (!s || (s.bestOf !== 1 && s.bestOf !== 3 && s.bestOf !== 5)) return null;
      const games = await db.select().from(matches).where(eq(matches.seriesId, id)).orderBy(asc(matches.gameNo), asc(matches.endedAt));
      return {
        id: s.id,
        format: s.format,
        bestOf: s.bestOf as 1 | 3 | 5,
        games: s.games,
        redWins: s.redWins,
        blueWins: s.blueWins,
        winner: s.winner === 0 ? (0 as const) : s.winner === 1 ? (1 as const) : null,
        finished: s.finishedAt !== null,
        startedAt: s.createdAt.toISOString(),
        matches: games.map((g) => ({ id: g.id, gameNo: g.gameNo, mapTitle: summary(g).mapTitle, redScore: g.redScore, blueScore: g.blueScore, endedAt: g.endedAt.toISOString() })),
      };
    }
  };
}

function summary(m: typeof matches.$inferSelect) {
  const title = m.details['mapTitle'];
  const mapTitle = typeof title === 'string' && title.trim() ? title.trim() : m.map;
  return { id: m.id, endedAt: m.endedAt.toISOString(), mode: m.mode, ranked: m.ranked, map: m.map, mapTitle, redScore: m.redScore, blueScore: m.blueScore };
}
