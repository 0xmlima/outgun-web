// SPDX-License-Identifier: GPL-2.0-or-later
// Perfil público, histórico e partida (OG-085, RN-STA-01/03): estatísticas separadas por modo
// (Ranked e Casual, RN-MOD-05) e a partida com o conteúdo do `save_stats` do original. O Ranked pode
// ser filtrado por formato (OG-258, RN-RKL-13): partidas sem formato só entram em "Todos".
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AppDeps, Services } from '../app.js';
import { usernameKey } from '../db/keys.js';
import { clans, matchEventPlayers, matchEvents, matches, matchPlayers, playerMilestones, playerProfiles, rankedSeries, seasonChampions, seasons, users } from '../db/schema.js';
import { isSecretMilestone, SECRET_MILESTONES } from '@outgun/content/secret';
import { milestoneProgressOf, milestoneRarity, SECRET_TOTAL, unlockedSecrets } from '../milestones.js';
import { matchSkillChanges, playerSkillOf } from '../skill.js';
import { ErrorSchema, GameModeSchema, RankedFormatSchema, SeriesBestOfSchema } from './schemas.js';
import { previousPodium } from '../ranking.js';
import { MatchTeamSchema } from './internal.js';
import { ticketNumber } from '../player-numbers.js';

/** Texto nos dois idiomas (marcos secretos, OG-393). */
const Bilingual = Type.Object({ 'pt-BR': Type.String(), en: Type.String() });
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
  /** Formato do Ranked (OG-250); null em Casual e nas partidas anteriores aos formatos. */
  format: Type.Union([RankedFormatSchema, Type.Null()]),
  /** Partida clã x clã (OG-259, RN-RKL-14). */
  clanWar: Type.Boolean(),
  /** Concluída com bot substituto / com um a menos (OG-263, RN-RKL-20). */
  withBots: Type.Boolean(),
  shortHanded: Type.Boolean(),
  map: Type.String(),
  /** Título do mapa (`P title`), que a partida e o relatório mostram; o arquivo (`map`) quando faltar (OG-207). */
  mapTitle: Type.String(),
  redScore: Type.Integer(),
  blueScore: Type.Integer(),
});
/** Série Ranked (OG-257, RN-RKL-03): placar e os jogos dela, em ordem. */
const SeriesView = Type.Object({
  /** Clã de cada lado (do primeiro jogo que virou o clã), com emblema (OG-489); null = vermelho/azul. */
  teams: Type.Union([Type.Null(), Type.Array(Type.Union([MatchTeamSchema, Type.Null()]))]),
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
  /** Contas escaladas em cada lado no último jogo (prévia do confronto, OG-474). */
  lineup: Type.Tuple([Type.Array(Type.String()), Type.Array(Type.String())]),
  matches: Type.Array(
    Type.Object({ id: Type.String(), gameNo: Type.Union([Type.Null(), Type.Integer()]), mapTitle: Type.String(), redScore: Type.Integer(), blueScore: Type.Integer(), endedAt: Type.String(), withBots: Type.Boolean(), shortHanded: Type.Boolean() }),
  ),
});
/** Pódio no hall da fama (OG-268): temporada, quadro (geral, formato ou clãs) e posição. */
export const Title = Type.Object({ season: Type.String(), board: Type.String(), position: Type.Integer() });
const ClanRef = Type.Object({ tag: Type.String(), name: Type.String() });
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

const Skill = Type.Object({ value: Type.Integer(), mu: Type.Number(), sigma: Type.Number(), matches: Type.Integer(), calibrating: Type.Boolean() });
const SkillChangeLine = Type.Object({ username: Type.String(), team: Type.Integer(), before: Type.Integer(), after: Type.Integer(), winChance: Type.Number() });

const won = sql`CASE WHEN ${matchPlayers.team} = 0 THEN ${matches.redScore} > ${matches.blueScore} ELSE ${matches.blueScore} > ${matches.redScore} END`;
const stat = (key: string) => sql<number>`coalesce(sum((${matchPlayers.stats} ->> ${key})::numeric), 0)::int`;

export function playerRoutes({ database }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  const titles = (where: SQL) => titlesWhere(db, where);
  return async (app) => {
    app.get(
      '/players/:name',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Perfil público: nome, clã, rating de habilidade e estatísticas por modo',
          params: Type.Object({ name: Type.String({ minLength: 1, maxLength: 32 }) }),
          querystring: Type.Object({ format: Type.Optional(RankedFormatSchema) }),
          response: {
            200: Type.Object({
              user: Type.Object({ id: Type.String(), username: Type.String(), clanTag: Type.Union([Type.String(), Type.Null()]), clanLabel: Type.Union([Type.String(), Type.Null()]), createdAt: Type.String() }),
              /** Rating de habilidade OpenSkill (OG-349, RN-SKL-04); null antes da primeira ranqueada. */
              skill: Type.Union([Skill, Type.Null()]),
              totals: Type.Object({ ranked: Totals, casual: Totals }),
              /** Cores favoritas (índices da paleta) e data da última partida (null se escondeu o histórico). */
              favoriteColors: Type.Array(Type.Integer()),
              /** Pódio (1..3) do "Melhor do mês" da temporada anterior (OG-411): cor da medalha; null = nenhum. */
              medal: Type.Union([Type.Integer({ minimum: 1, maximum: 3 }), Type.Null()]),
              /** Número no boneco (OG-410); null = sem número. */
              number: Type.Union([Type.Integer(), Type.Null()]),
              lastMatchAt: Type.Union([Type.String(), Type.Null()]),
              /** Marcos conquistados (OG-213); a partida some se o histórico estiver escondido. */
              milestones: Type.Array(Type.Object({ id: Type.String(), achievedAt: Type.String(), matchId: Type.Union([Type.String(), Type.Null()]) })),
              /** Valor atual de cada marco com alvo (OG-393), para a barra de progresso. */
              milestoneProgress: Type.Record(Type.String(), Type.Number()),
              /** Fração das contas que tem cada marco (OG-393): públicos e só os secretos desta conta. */
              milestoneRarity: Type.Record(Type.String(), Type.Number()),
              /** Secretos (RN-SOC-06): quantos existem e o texto só dos que esta conta desbloqueou. */
              secrets: Type.Object({
                total: Type.Integer(),
                unlocked: Type.Array(
                  Type.Object({ id: Type.String(), name: Bilingual, description: Bilingual, firstBy: Type.Union([Type.String(), Type.Null()]) }),
                ),
              }),
              /** Pódios no hall da fama (OG-268), da temporada mais recente para a mais antiga. */
              titles: Type.Array(Title),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [user] = await db.select().from(users).where(eq(users.usernameKey, usernameKey(request.params.name)));
        if (!user) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const { format } = request.query;
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
          .where(and(eq(matchPlayers.userId, user.id), format ? or(eq(matches.mode, 'casual'), eq(matches.format, format)) : undefined))
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
          user: { id: user.id, username: user.username, clanTag: user.clanTag, clanLabel: user.clanLabel, createdAt: user.createdAt.toISOString() },
          skill: await playerSkillOf(db, user.id),
          totals,
          favoriteColors: profile?.favoriteColors ?? [],
          medal: await previousPodium(db, user.id),
          number: (await ticketNumber(db, user.id))?.number ?? null,
          lastMatchAt: last?.at ? new Date(last.at).toISOString() : null,
          milestones: milestones.map((x) => ({ id: x.id, achievedAt: x.achievedAt.toISOString(), matchId: showHistory ? x.matchId : null })),
          milestoneProgress: await milestoneProgressOf(db, user.id),
          milestoneRarity: Object.fromEntries([...(await milestoneRarity(db))].filter(([id]) => !isSecretMilestone(id) || milestones.some((x) => x.id === id))),
          secrets: { total: SECRET_TOTAL, unlocked: await unlockedSecrets(db, milestones.map((x) => x.id)) },
          titles: await titles(eq(seasonChampions.userId, user.id)),
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
            /** Só partidas Ranked deste formato (OG-258). */
            format: Type.Optional(RankedFormatSchema),
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
        const { mode, format, limit, offset } = request.query;
        const where = and(eq(matchPlayers.userId, user.id), mode ? eq(matches.mode, mode) : undefined, format ? eq(matches.format, format) : undefined);
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
              milestones: Type.Array(Type.Object({ username: Type.String(), milestone: Type.String(), secretName: Type.Optional(Bilingual) })),
              /** Formato, número do jogo e a série, nas partidas de sala com formato (OG-257). */
              format: Type.Union([Type.Null(), RankedFormatSchema]),
              gameNo: Type.Union([Type.Null(), Type.Integer()]),
              series: Type.Union([Type.Null(), SeriesView]),
              /** Clãs de cada lado numa partida clã x clã (OG-259); null se não for ou se um deles foi apagado. */
              clans: Type.Union([Type.Null(), Type.Object({ red: ClanRef, blue: ClanRef })]),
              /** O clã que cada lado foi na rodada (OG-409): tag, nome e cor; null = vermelho x azul. */
              teams: Type.Union([Type.Null(), Type.Array(Type.Union([MatchTeamSchema, Type.Null()]))]),
              /** Variação do rating de habilidade de cada conta (OG-349); vazio antes da implantação e no Casual. */
              skill: Type.Array(SkillChangeLine),
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
          // secretos (OG-394): o nome vai junto, o cliente não tem o catálogo deles
          milestones: (
            await db
              .select({ username: users.username, milestone: playerMilestones.milestone })
              .from(playerMilestones)
              .innerJoin(users, eq(users.id, playerMilestones.userId))
              .where(eq(playerMilestones.matchId, m.id))
              .orderBy(asc(users.usernameKey))
          ).map((x) => {
            const secret = SECRET_MILESTONES.find((s) => s.id === x.milestone);
            return secret ? { ...x, secretName: secret.name } : x;
          }),
          format: m.format,
          gameNo: m.gameNo,
          series: m.seriesId ? await seriesView(m.seriesId) : null,
          clans: await warClans(m),
          teams: m.teamIdentity ?? null,
          skill: await skillLines(m.id),
        };
      },
    );

    app.get(
      '/matches/:id/events',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Eventos de uma partida (OG-362, OG-381): abates e ações de bandeira em ordem; `events` null = partida sem registro',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          response: {
            200: Type.Object({
              players: Type.Array(Type.Object({ slot: Type.Integer(), name: Type.String(), username: Type.Union([Type.Null(), Type.String()]), team: Type.Integer(), isBot: Type.Boolean() })),
              /** Abate: `[t, 'kill', matador, vítima, salaX, salaY, portador, causa]`; bandeira: `[t, tipo, jogador, bandeira]` (t em décimos). */
              events: Type.Union([Type.Null(), Type.Array(Type.Array(Type.Union([Type.Integer(), Type.String()])))]),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [m] = await db.select({ id: matches.id }).from(matches).where(eq(matches.id, request.params.id));
        if (!m) return reply.code(404).send({ error: 'match_not_found', message: 'match not found' });
        const [row] = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id));
        const players = await db
          .select({ slot: matchEventPlayers.slot, name: matchEventPlayers.name, username: users.username, team: matchEventPlayers.team, isBot: matchEventPlayers.isBot })
          .from(matchEventPlayers)
          .leftJoin(users, eq(users.id, matchEventPlayers.userId))
          .where(eq(matchEventPlayers.matchId, m.id))
          .orderBy(asc(matchEventPlayers.idx));
        return { players, events: row?.events ?? null };
      },
    );

    async function skillLines(matchId: string) {
      const changes = await matchSkillChanges(db, matchId);
      if (changes.length === 0) return [];
      const names = new Map((await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, changes.map((c) => c.userId)))).map((u) => [u.id, u.username]));
      return changes.flatMap(({ userId, ...c }) => {
        const username = names.get(userId);
        return username ? [{ username, ...c }] : [];
      });
    }

    async function warClans(m: typeof matches.$inferSelect) {
      if (!m.clanWar || !m.redClanId || !m.blueClanId) return null;
      const list = await db.select({ id: clans.id, tag: clans.tag, name: clans.name }).from(clans).where(inArray(clans.id, [m.redClanId, m.blueClanId]));
      const red = list.find((c) => c.id === m.redClanId);
      const blue = list.find((c) => c.id === m.blueClanId);
      return red && blue ? { red: { tag: red.tag, name: red.name }, blue: { tag: blue.tag, name: blue.name } } : null;
    }

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
      const last = games.at(-1);
      const players = last
        ? await db.select({ team: matchPlayers.team, username: users.username }).from(matchPlayers).innerJoin(users, eq(users.id, matchPlayers.userId)).where(and(eq(matchPlayers.matchId, last.id), eq(matchPlayers.isBot, false)))
        : [];
      const lineup: [string[], string[]] = [players.filter((p) => p.team === 0).map((p) => p.username), players.filter((p) => p.team === 1).map((p) => p.username)];
      return {
        lineup,
        id: s.id,
        format: s.format,
        bestOf: s.bestOf as 1 | 3 | 5,
        games: s.games,
        redWins: s.redWins,
        blueWins: s.blueWins,
        winner: s.winner === 0 ? (0 as const) : s.winner === 1 ? (1 as const) : null,
        finished: s.finishedAt !== null,
        startedAt: s.createdAt.toISOString(),
        teams: games.find((g) => g.teamIdentity)?.teamIdentity ?? null,
        matches: games.map((g) => ({ id: g.id, gameNo: g.gameNo, mapTitle: summary(g).mapTitle, redScore: g.redScore, blueScore: g.blueScore, endedAt: g.endedAt.toISOString(), withBots: g.substituteBots > 0, shortHanded: g.shortHanded > 0 })),
      };
    }
  };
}

function summary(m: typeof matches.$inferSelect) {
  const title = m.details['mapTitle'];
  const mapTitle = typeof title === 'string' && title.trim() ? title.trim() : m.map;
  return { id: m.id, endedAt: m.endedAt.toISOString(), mode: m.mode, ranked: m.ranked, format: m.format, clanWar: m.clanWar, withBots: m.substituteBots > 0, shortHanded: m.shortHanded > 0, map: m.map, mapTitle, redScore: m.redScore, blueScore: m.blueScore };
}

/** Pódios do hall da fama que casam com `where` (conta ou clã), da temporada mais recente para a mais antiga. */
export async function titlesWhere(db: AppDeps['database']['db'], where: SQL | undefined) {
  return db
    .select({ season: seasons.name, board: seasonChampions.board, position: seasonChampions.position })
    .from(seasonChampions)
    .innerJoin(seasons, eq(seasons.id, seasonChampions.seasonId))
    .where(where)
    .orderBy(desc(seasons.startsAt), asc(seasonChampions.position), asc(seasonChampions.board));
}
