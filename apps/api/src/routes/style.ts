// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo de jogo (OG-469, D-84, RN-RAD): o perfil de um jogador na temporada (padrão: a
// ativa) ou de sempre, com a temporada anterior para o contorno tracejado (OG-471), e o radar do
// clã pela mediana dos membros (OG-473).
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { desc, eq, lt } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { clanKey, usernameKey } from '../db/keys.js';
import { clans, seasons, users } from '../db/schema.js';
import { LEADERBOARD_MINIMUM_MATCHES, statSince, type BoardScope } from '../leaderboard.js';
import { activeSeason, type RankedFormat } from '../ranking.js';
import { clanStyle, STYLE_AXES, STYLE_FULL_SAMPLE, STYLE_MINIMUM_GAMES, stylePeriod, ARCHETYPES, type Archetype, type StyleAxis, type StyleProfile } from '../style-radar.js';
import { ErrorSchema, RankedFormatSchema } from './schemas.js';

const Season = Type.Object({ id: Type.Integer(), name: Type.String(), startsAt: Type.String(), endsAt: Type.Union([Type.String(), Type.Null()]), active: Type.Boolean() });
export const StyleAxisSchema = Type.Unsafe<StyleAxis>({ type: 'string', enum: [...STYLE_AXES] });
export const ArchetypeSchema = Type.Unsafe<Archetype>({ type: 'string', enum: [...ARCHETYPES] });
/** Um eixo: percentil (0–100) e o valor bruto do detalhe (por 10 min, razão ou segundos). */
export const StyleAxisValue = Type.Object({ axis: StyleAxisSchema, percentile: Type.Integer({ minimum: 0, maximum: 100 }), value: Type.Number() });
/** Radar de um período; `axes` e `archetype` são null abaixo de 3 ranqueadas (RN-RAD-03). */
export const StyleRadarSchema = Type.Object({
  games: Type.Integer(),
  lowSample: Type.Boolean(),
  axes: Type.Union([Type.Null(), Type.Array(StyleAxisValue)]),
  archetype: Type.Union([Type.Null(), ArchetypeSchema]),
  /** Quantos ativos (mínimo da RN-LDB-04) formam a base do percentil. */
  population: Type.Integer(),
});
type StyleRadar = Static<typeof StyleRadarSchema>;

/** Radar de uma conta a partir do perfil do período (undefined = sem radar). */
export function radarOf(profile: StyleProfile | undefined, games: number, population: number): StyleRadar {
  if (!profile) return { games, lowSample: games >= STYLE_MINIMUM_GAMES && games < STYLE_FULL_SAMPLE, axes: null, archetype: null, population };
  return {
    games,
    lowSample: profile.lowSample,
    axes: STYLE_AXES.map((axis) => ({ axis, percentile: profile.percentiles[axis], value: profile.raw[axis] })),
    archetype: profile.archetype,
    population,
  };
}

/** Radar de uma conta num período, consultando (ou reaproveitando do cache) a lista do período. */
export async function playerRadar(db: AppDeps['database']['db'], userId: string, scope: BoardScope): Promise<StyleRadar> {
  const { rows, profiles } = await stylePeriod(db, scope);
  const population = rows.filter((r) => r.games >= LEADERBOARD_MINIMUM_MATCHES).length;
  return radarOf(profiles.get(userId), rows.find((r) => r.userId === userId)?.games ?? 0, population);
}

export function styleRoutes({ database }: AppDeps): FastifyPluginAsyncTypebox {
  const { db } = database;
  /** Temporada pedida (padrão: a ativa) ou null com `overall`; undefined se não existe. */
  async function scopeSeason(id: number | undefined, overall: boolean) {
    if (overall) return null;
    const want = id ?? (await activeSeason(db))?.id;
    const [row] = want ? await db.select().from(seasons).where(eq(seasons.id, want)) : [];
    return row;
  }
  return async (app) => {
    app.get(
      '/players/:name/style',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Radar de estilo (OG-469, RN-RAD): 6 eixos em percentil contra os ativos da temporada (padrão: a ativa) ou de sempre (overall=true), o arquétipo e a temporada anterior',
          params: Type.Object({ name: Type.String({ minLength: 1, maxLength: 32 }) }),
          querystring: Type.Object({
            season: Type.Optional(Type.Integer({ minimum: 1 })),
            overall: Type.Boolean({ default: false }),
            format: Type.Optional(RankedFormatSchema),
          }),
          response: {
            200: Type.Object({
              username: Type.String(),
              season: Type.Union([Type.Null(), Season]),
              radar: StyleRadarSchema,
              /** Temporada anterior à pedida (contorno tracejado); null em "sempre" ou sem temporada anterior. */
              previous: Type.Union([Type.Null(), Type.Object({ season: Season, radar: StyleRadarSchema })]),
              /** Eixos com contadores novos (RN-LDB-03): data da primeira ranqueada que os tem. */
              since: Type.Object({ defense: Type.Union([Type.Null(), Type.String()]), team: Type.Union([Type.Null(), Type.String()]) }),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [user] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.usernameKey, usernameKey(request.params.name)));
        if (!user) return reply.code(404).send({ error: 'player_not_found', message: 'player not found' });
        const { overall, format } = request.query;
        const season = await scopeSeason(request.query.season, overall);
        if (season === undefined) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
        const fmt: RankedFormat | null = format ?? null;
        const radar = await playerRadar(db, user.id, { seasonId: season?.id ?? null, format: fmt });
        const [before] = season ? await db.select().from(seasons).where(lt(seasons.startsAt, season.startsAt)).orderBy(desc(seasons.startsAt)).limit(1) : [];
        const previous = before ? { season: seasonOut(before), radar: await playerRadar(db, user.id, { seasonId: before.id, format: fmt }) } : null;
        const [defense, team] = await Promise.all([statSince(db, 'defenses'), statSince(db, 'trades')]);
        reply.header('cache-control', 'public, max-age=60');
        return { username: user.username, season: season ? seasonOut(season) : null, radar, previous, since: { defense, team } };
      },
    );

    const ClanAxisSchema = Type.Object({ axis: StyleAxisSchema, percentile: Type.Integer({ minimum: 0, maximum: 100 }) });
    app.get(
      '/clans/:tag/style',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Radar do clã (OG-473, RN-RAD-05): mediana dos percentis dos membros pelas ranqueadas jogadas pelo clã, arquétipo, ponto forte e fraco, e o radar de cada membro',
          params: Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }) }),
          querystring: Type.Object({ season: Type.Optional(Type.Integer({ minimum: 1 })), overall: Type.Boolean({ default: false }) }),
          response: {
            200: Type.Object({
              tag: Type.String(),
              season: Type.Union([Type.Null(), Season]),
              /** null = nenhum membro com 3 ranqueadas pelo clã no período. */
              clan: Type.Union([
                Type.Null(),
                Type.Object({ axes: Type.Array(ClanAxisSchema), archetype: ArchetypeSchema, strongest: StyleAxisSchema, weakest: StyleAxisSchema, members: Type.Integer() }),
              ]),
              members: Type.Array(Type.Object({ username: Type.String(), radar: StyleRadarSchema })),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [clan] = await db.select({ id: clans.id, tag: clans.tag }).from(clans).where(eq(clans.tagKey, clanKey(request.params.tag)));
        if (!clan) return reply.code(404).send({ error: 'clan_not_found', message: 'clan not found' });
        const season = await scopeSeason(request.query.season, request.query.overall);
        if (season === undefined) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
        const style = await clanStyle(db, clan.id, { seasonId: season?.id ?? null, format: null });
        reply.header('cache-control', 'public, max-age=60');
        return { tag: clan.tag, season: season ? seasonOut(season) : null, ...clanStyleOut(style) };
      },
    );
  };
}

export function seasonOut(s: typeof seasons.$inferSelect) {
  return { id: s.id, name: s.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt?.toISOString() ?? null, active: s.active };
}

/** Resposta do radar do clã (OG-473), também usada na prévia do clã x clã (OG-474). */
export function clanStyleOut(style: Awaited<ReturnType<typeof clanStyle>>) {
  const withRadar = style.members.filter((m) => m.profile).length;
  return {
    clan: style.clan
      ? { axes: STYLE_AXES.map((axis) => ({ axis, percentile: style.clan!.percentiles[axis] })), archetype: style.clan.archetype, strongest: style.clan.strongest, weakest: style.clan.weakest, members: withRadar }
      : null,
    members: style.members.map((m) => ({ username: m.username, radar: radarOf(m.profile, m.games, style.population) })),
  };
}
