// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo de jogo (OG-469, D-84, RN-RAD): o perfil de um jogador na temporada (padrão: a
// ativa) ou de sempre, com a temporada anterior para o contorno tracejado (OG-471), e o radar do
// clã pela mediana dos membros (OG-473).
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { desc, eq, inArray, lt } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { clanKey, usernameKey } from '../db/keys.js';
import { clanMembers, clans, matches, seasons, users } from '../db/schema.js';
import { LEADERBOARD_MINIMUM_MATCHES, overallBoard, statSince, type BoardScope } from '../leaderboard.js';
import { activeSeason, type RankedFormat } from '../ranking.js';
import { clanStyle, lineupStyle, MATCH_STYLE_MIN_SECONDS, matchStyle, medianProfile, STYLE_AXES, STYLE_FULL_SAMPLE, STYLE_MINIMUM_GAMES, stylePeriod, ARCHETYPES, type Archetype, type StyleAxis, type StyleProfile } from '../style-radar.js';
import { ErrorSchema, RankedFormatSchema } from './schemas.js';

const Season = Type.Object({ id: Type.Integer(), name: Type.String(), startsAt: Type.String(), endsAt: Type.Union([Type.String(), Type.Null()]), active: Type.Boolean() });
export const StyleAxisSchema = Type.Unsafe<StyleAxis>({ type: 'string', enum: [...STYLE_AXES] });
export const ArchetypeSchema = Type.Unsafe<Archetype>({ type: 'string', enum: [...ARCHETYPES] });
/** Um eixo: percentil (0–100) e o valor bruto do detalhe (por 10 min, razão ou segundos). */
export const StyleAxisValue = Type.Object({ axis: StyleAxisSchema, percentile: Type.Integer({ minimum: 0, maximum: 100 }), value: Type.Number() });
/** Percentil de um grupo (mediana): sem valor bruto. */
const ClanAxisSchema = Type.Object({ axis: StyleAxisSchema, percentile: Type.Integer({ minimum: 0, maximum: 100 }) });
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
            /** Sombra cinza (OG-476): mediana do clã do jogador ou do top 10 da lista geral do período. */
            reference: Type.Optional(Type.Union([Type.Literal('clan'), Type.Literal('top10')])),
          }),
          response: {
            200: Type.Object({
              username: Type.String(),
              /** Clã atual (a opção "meu clã" some sem ele). */
              clanTag: Type.Union([Type.Null(), Type.String()]),
              /** Nome e cor primária do clã atual (cartão para compartilhar, OG-478). */
              clan: Type.Union([Type.Null(), Type.Object({ tag: Type.String(), name: Type.String(), color: Type.Union([Type.Null(), Type.String()]) })]),
              /** Referência pedida; null sem dados (clã sem ninguém com radar, período vazio). */
              reference: Type.Union([Type.Null(), Type.Object({ kind: Type.String(), members: Type.Integer(), axes: Type.Array(ClanAxisSchema) })]),
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
        const scope = { seasonId: season?.id ?? null, format: fmt };
        let reference: { kind: string; members: number; axes: { axis: StyleAxis; percentile: number }[] } | null = null;
        const [membership] = await db.select({ id: clans.id, tag: clans.tag, name: clans.name, color: clans.primaryColor }).from(clanMembers).innerJoin(clans, eq(clans.id, clanMembers.clanId)).where(eq(clanMembers.userId, user.id));
        if (request.query.reference === 'clan' && membership) {
          const style = await clanStyle(db, membership.id, scope);
          const m = style && medianOut(style.clan, style.members.filter((x) => x.profile).length);
          if (m) reference = { kind: 'clan', members: m.members, axes: m.axes };
        } else if (request.query.reference === 'top10') {
          // top 10 da lista geral (RN-LDB-06); com menos elegíveis, quem houver
          const top = (await overallBoard(db, scope, { limit: 10, offset: 0 })).entries;
          const { profiles } = await stylePeriod(db, scope);
          const list = top.flatMap((e) => (profiles.has(e.userId) ? [profiles.get(e.userId)!] : []));
          const m = medianOut(medianProfile(list), list.length);
          if (m) reference = { kind: 'top10', members: m.members, axes: m.axes };
        }
        reply.header('cache-control', 'public, max-age=60');
        return { username: user.username, clanTag: membership?.tag ?? null, clan: membership ? { tag: membership.tag, name: membership.name, color: membership.color } : null, reference, season: season ? seasonOut(season) : null, radar, previous, since: { defense, team } };
      },
    );

    app.get(
      '/clans/:tag/style',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Radar do clã (OG-473, RN-RAD-05): mediana dos percentis dos membros pelas ranqueadas jogadas pelo clã, arquétipo, ponto forte e fraco, e o radar de cada membro',
          params: Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }) }),
          querystring: Type.Object({
            season: Type.Optional(Type.Integer({ minimum: 1 })),
            overall: Type.Boolean({ default: false }),
            /** Tag de um rival: só as partidas clã x clã contra ele (OG-474). */
            against: Type.Optional(Type.String({ minLength: 1, maxLength: 8 })),
          }),
          response: {
            200: Type.Object({
              tag: Type.String(),
              season: Type.Union([Type.Null(), Season]),
              /** Partidas do clã no recorte; com `against`, abaixo de 10 é "poucos jogos" (RN-RAD-03). */
              matches: Type.Integer(),
              lowSample: Type.Boolean(),
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
        let against: string | undefined;
        if (request.query.against) {
          const [rival] = await db.select({ id: clans.id }).from(clans).where(eq(clans.tagKey, clanKey(request.query.against)));
          if (!rival) return reply.code(404).send({ error: 'clan_not_found', message: 'clan not found' });
          against = rival.id;
        }
        const style = await clanStyle(db, clan.id, { seasonId: season?.id ?? null, format: null }, against ? { against } : {});
        reply.header('cache-control', 'public, max-age=60');
        return { tag: clan.tag, season: season ? seasonOut(season) : null, matches: style.matches, lowSample: !!against && style.matches < STYLE_FULL_SAMPLE, ...clanStyleOut(style) };
      },
    );

    app.get(
      '/matches/:id/style',
      {
        schema: {
          tags: ['perfil'],
          summary: `Radar da partida (OG-475): para cada conta de uma ranqueada, os 6 eixos daquela partida em percentil contra os ativos da temporada e o radar da temporada; menos de ${MATCH_STYLE_MIN_SECONDS} s jogados = partida curta demais`,
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          response: {
            200: Type.Object({
              /** Casual não tem radar (RN-RAD-02): `players` vazio. */
              ranked: Type.Boolean(),
              minimumSeconds: Type.Integer(),
              players: Type.Array(
                Type.Object({
                  username: Type.String(),
                  short: Type.Boolean(),
                  /** Eixos da partida; null se curta demais. */
                  match: Type.Union([Type.Null(), Type.Array(StyleAxisValue)]),
                  season: StyleRadarSchema,
                }),
              ),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [m] = await db.select({ id: matches.id, ranked: matches.ranked, seasonId: matches.seasonId }).from(matches).where(eq(matches.id, request.params.id));
        if (!m) return reply.code(404).send({ error: 'match_not_found', message: 'match not found' });
        reply.header('cache-control', 'public, max-age=60');
        if (!m.ranked) return { ranked: false, minimumSeconds: MATCH_STYLE_MIN_SECONDS, players: [] };
        const style = await matchStyle(db, m.id, m.seasonId);
        const ids = style.players.map((p) => p.userId);
        const names = new Map((ids.length ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.username]));
        const seasonGames = new Map((await stylePeriod(db, { seasonId: m.seasonId, format: null })).rows.map((r) => [r.userId, r.games]));
        return {
          ranked: true,
          minimumSeconds: MATCH_STYLE_MIN_SECONDS,
          players: style.players.map((p) => ({
            username: names.get(p.userId) ?? '',
            short: p.short,
            match: p.percentiles && p.raw ? STYLE_AXES.map((axis) => ({ axis, percentile: p.percentiles![axis], value: p.raw![axis] })) : null,
            season: radarOf(p.season, seasonGames.get(p.userId) ?? 0, style.population),
          })),
        };
      },
    );

    const MedianSchema = Type.Object({ axes: Type.Array(ClanAxisSchema), archetype: ArchetypeSchema, strongest: StyleAxisSchema, weakest: StyleAxisSchema, members: Type.Integer() });
    const SideSchema = Type.Object({
      clan: Type.Union([Type.Null(), Type.String()]),
      /** Mediana de quem tem radar no lado; null se ninguém tem. */
      median: Type.Union([Type.Null(), MedianSchema]),
      players: Type.Array(Type.Object({ username: Type.String(), radar: StyleRadarSchema })),
    });
    const names = Type.String({ maxLength: 400, default: '' });
    app.get(
      '/style/lineup',
      {
        schema: {
          tags: ['perfil'],
          summary: 'Radar de um confronto (OG-474, OG-477): mediana de cada lado na temporada ativa; com a tag do clã do lado, só as partidas pelo clã de quem está escalado (RN-RAD-05)',
          querystring: Type.Object({
            /** Nomes separados por vírgula; quem não tem conta fica de fora. */
            red: names,
            blue: names,
            redClan: Type.Optional(Type.String({ minLength: 1, maxLength: 8 })),
            blueClan: Type.Optional(Type.String({ minLength: 1, maxLength: 8 })),
          }),
          response: { 200: Type.Object({ season: Type.Union([Type.Null(), Season]), sides: Type.Tuple([SideSchema, SideSchema]) }) },
        },
      },
      async (request, reply) => {
        const q = request.query;
        const season = await scopeSeason(undefined, false);
        const scope = { seasonId: season?.id ?? null, format: null };
        const side = async (list: string, tag: string | undefined) => {
          const keys = [...new Set(list.split(',').map((n) => n.trim()).filter(Boolean).map(usernameKey))].slice(0, 16);
          const found = keys.length ? await db.select({ id: users.id, username: users.username, key: users.usernameKey }).from(users).where(inArray(users.usernameKey, keys)) : [];
          const players = keys.flatMap((k) => found.filter((f) => f.key === k));
          const [clan] = tag ? await db.select({ id: clans.id, tag: clans.tag }).from(clans).where(eq(clans.tagKey, clanKey(tag))) : [];
          const s = await lineupStyle(db, scope, players, clan?.id ?? null);
          return {
            clan: clan?.tag ?? null,
            median: medianOut(s.median, s.members.filter((m) => m.profile).length),
            players: s.members.map((m) => ({ username: m.username, radar: radarOf(m.profile, m.games, s.population) })),
          };
        };
        const sides = [await side(q.red, q.redClan), await side(q.blue, q.blueClan)] as const;
        reply.header('cache-control', 'public, max-age=30');
        return { season: season ? seasonOut(season) : null, sides: [...sides] as [typeof sides[0], typeof sides[1]] };
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
    clan: medianOut(style.clan, withRadar),
    members: style.members.map((m) => ({ username: m.username, radar: radarOf(m.profile, m.games, style.population) })),
  };
}

/** Mediana de um grupo na resposta: percentis na ordem fixa, arquétipo, ponto forte e fraco. */
function medianOut(m: ReturnType<typeof medianProfile>, members: number) {
  return m ? { axes: STYLE_AXES.map((axis) => ({ axis, percentile: m.percentiles[axis] })), archetype: m.archetype, strongest: m.strongest, weakest: m.weakest, members } : null;
}
