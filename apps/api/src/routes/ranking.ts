// SPDX-License-Identifier: GPL-2.0-or-later
// Temporadas, leaderboard de atributos (OG-352, D-66), ranking de clãs (OG-274) e hall da fama
// (OG-268). O leaderboard por score/neg (OG-084) saiu com o ranking antigo (OG-353).
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { asc, desc, eq } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { clans, seasonChampions, seasons, type ChampionBoard } from '../db/schema.js';
import { activeSeason, LEADERBOARD_SINCE } from '../ranking.js';
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
          summary: 'Hall da fama (OG-268, OG-354): os 3 primeiros de cada temporada encerrada; desde 2026-11, de cada stat principal do leaderboard (stat:<id>) e dos clãs; antes, do ranking clássico (geral e formatos) e dos clãs',
          response: {
            200: Type.Object({
              seasons: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  name: Type.String(),
                  endsAt: Type.Union([Type.String(), Type.Null()]),
                  /** Temporada do ranking clássico por score/neg (até 2026-10, D-66). */
                  classic: Type.Boolean(),
                  boards: Type.Record(Type.String(), Champions),
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
            const classic = !season.month || season.month < LEADERBOARD_SINCE;
            const empty: ChampionBoard[] = classic ? ['overall', '3x3', '4x4', '5x5', 'clans'] : [...LEADERBOARD_STATS.filter((s) => s.main).map((s) => `stat:${s.id}` as const), 'clans'];
            const boards: Record<string, Static<typeof Champions>> = Object.fromEntries(empty.map((b) => [b, []]));
            for (const { c, tag } of rows) {
              if (c.seasonId === season.id) (boards[c.board] ??= []).push({ position: c.position, name: c.name, clanName: c.clanName, clanTag: tag, value: c.value });
            }
            return { id: season.id, name: season.name, endsAt: season.endsAt?.toISOString() ?? null, classic, boards };
          }),
        };
      },
    );
  };
}
