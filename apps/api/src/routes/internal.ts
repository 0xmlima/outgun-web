// SPDX-License-Identifier: GPL-2.0-or-later
// Rotas dos game servers (PLAN 5.4): heartbeat das salas e resultado das partidas. Toda chamada é
// autenticada por HMAC (`verifyInternalRequest` de @outgun/tickets).
import { Type, type FastifyPluginAsyncTypebox, type Static, type TArray, type TOptional, type TString } from '@fastify/type-provider-typebox';
import { and, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or } from 'drizzle-orm';
import { PRESETS, ROTATION_KEYS, seriesOver, seriesWinner, seriesWinsNeeded, type RotationKey } from '@outgun/settings';
import type { AppDeps } from '../app.js';
import { adminActions, bans, clanMembers, clans, gameServers, matchEventPlayers, matchEvents, matches, matchPlayers, playerReports, rankedSeries, rooms, users, type MatchEvent } from '../db/schema.js';
import { clanWarSides } from '../clan-war.js';
import { momentStats } from '../match-moments.js';
import { closeSeason, seasonAt } from '../ranking.js';
import { applySkill } from '../skill.js';
import { awardMilestones } from '../milestones.js';
import { recordMatchSocial } from '../social-stats.js';
import { verifyInternalRequest } from '@outgun/tickets';
import { ONLINE_MS } from '../registry.js';
import { applyAcks, panelPresets, platformConfig, takeCommands } from '../platform-config.js';
import { ErrorSchema, GameModeSchema, LobbyPhaseSchema, RankedFormatSchema, RoomId, SeriesBestOfSchema } from './schemas.js';

const Heartbeat = Type.Object({
  server: Type.Object({
    /** Endereço público do servidor; as salas ficam em `<wsBaseUrl>/rooms/<id>`. */
    wsBaseUrl: Type.String({ pattern: '^wss?://', maxLength: 200 }),
    region: Type.String({ pattern: '^[a-z0-9-]{1,32}$' }),
    /** Quantas salas o servidor aceita hospedar (as abertas sob demanda contam). */
    maxRooms: Type.Integer({ minimum: 0, maximum: 1000 }),
    /** Mapas da pasta do servidor, para o painel conferir as rotações (OG-251). */
    maps: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 500 })),
    /** Rotações padrão do servidor por chave (OG-378): o painel parte delas sem rotação salva. */
    rotations: Type.Optional(
      Type.Object(Object.fromEntries(ROTATION_KEYS.map((k) => [k, Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 64 }))])) as Record<RotationKey, TOptional<TArray<TString>>>),
    ),
  }),
  rooms: Type.Array(
    Type.Object({
      id: RoomId,
      name: Type.String({ minLength: 1, maxLength: 40 }),
      mode: GameModeSchema,
      preset: Type.String({ minLength: 1, maxLength: 40 }),
      maxPlayers: Type.Integer({ minimum: 2, maximum: 32 }),
      persistent: Type.Boolean(),
      players: Type.Integer({ minimum: 0, maximum: 32 }),
      map: Type.String({ maxLength: 64 }),
      wsUrl: Type.String({ pattern: '^wss?://', maxLength: 200 }),
      /** Fase do lobby das salas Ranked com formato (OG-252). */
      phase: Type.Optional(LobbyPhaseSchema),
      /** Jogadores na sala (painel admin, OG-087). */
      roster: Type.Optional(
        Type.Array(
          Type.Object({
            uid: Type.Integer({ minimum: 0, maximum: 1_000_000 }),
            name: Type.String({ minLength: 1, maxLength: 32 }),
            team: Type.Integer({ minimum: 0, maximum: 1 }),
            accountId: Type.Optional(Type.String({ format: 'uuid' })),
            /** Bot substituto: conta de quem ele substitui, que pode voltar à vaga (OG-332). */
            replacedAccountId: Type.Optional(Type.String({ format: 'uuid' })),
            bot: Type.Boolean(),
            muted: Type.Integer({ minimum: 0, maximum: 2 }),
          }),
          { maxItems: 32 },
        ),
      ),
    }),
    { maxItems: 64 },
  ),
  /** Resultado dos comandos do painel recebidos nos heartbeats anteriores (OG-087). */
  acks: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.Integer({ minimum: 1 }),
        ok: Type.Boolean(),
        text: Type.Optional(Type.String({ maxLength: 200 })),
        target: Type.Optional(
          Type.Object({
            name: Type.String({ minLength: 1, maxLength: 32 }),
            accountId: Type.Optional(Type.String({ format: 'uuid' })),
            ip: Type.Optional(Type.String({ maxLength: 45 })),
            device: Type.Optional(Type.String({ pattern: '^[0-9a-f]{32}$' })),
          }),
        ),
      }),
      { maxItems: 100 },
    ),
  ),
});

const Command = Type.Object({
  id: Type.Integer(),
  roomId: RoomId,
  kind: Type.String(),
  uid: Type.Optional(Type.Integer()),
  minutes: Type.Optional(Type.Integer()),
  reason: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  actor: Type.String(),
});

const HeartbeatReply = Type.Object({
  updated: Type.Integer(),
  /** Comandos do painel para salas deste servidor. */
  commands: Type.Array(Command),
  /** Presets Casual do painel e rotações por modo; `version` muda quando algo muda. */
  config: Type.Object({
    version: Type.String(),
    presets: Type.Array(Type.Object({ id: Type.String(), description: Type.String(), overrides: Type.String() })),
    rotations: Type.Object(Object.fromEntries(ROTATION_KEYS.map((k) => [k, Type.Optional(Type.Array(Type.String()))])) as Record<RotationKey, TOptional<TArray<TString>>>),
    /** Mapas publicados pela moderação (OG-367): nome e CRC; o texto sai de `GET /maps/:name`. */
    maps: Type.Array(Type.Object({ name: Type.String(), crc: Type.Integer() })),
    /** Nomes e prefixos ativos dos bots (OG-403). */
    bots: Type.Object({ prefixes: Type.Array(Type.String()), names: Type.Array(Type.String()) }),
  }),
});

const Count = Type.Integer({ minimum: 0, maximum: 1_000_000 });
/** Teto de eventos de uma ranqueada (OG-362), o mesmo do game server. */
export const MATCH_EVENTS_LIMIT = 5000;
/** Jogador num evento: índice na lista de jogadores dos eventos; −1 = ninguém. */
const EventRef = Type.Integer({ minimum: -1, maximum: 127 });
const RoomCoord = Type.Integer({ minimum: 0, maximum: 255 });
const MatchPlayer = Type.Object({
  slot: Type.Integer({ minimum: 0, maximum: 31 }),
  userId: Type.Optional(Type.String({ format: 'uuid' })),
  name: Type.String({ minLength: 1, maxLength: 32 }),
  team: Type.Union([Type.Literal(0), Type.Literal(1)]),
  isBot: Type.Boolean(),
  frags: Type.Integer({ minimum: -1_000_000, maximum: 1_000_000 }),
  kills: Count,
  deaths: Count,
  captures: Count,
  playSeconds: Count,
  /** Deltas do ranking (só em partida ranqueada; o score pode ser negativo, OG-084). */
  scoreDelta: Type.Integer({ minimum: -1_000_000, maximum: 1_000_000 }),
  negDelta: Count,
  /** Clã do jogador que o bot substitui (OG-259, D-46); ignorado em quem não é bot (a API usa o cadastro). */
  clanId: Type.Optional(Type.String({ format: 'uuid' })),
  stats: Type.Record(Type.String({ maxLength: 40 }), Type.Number(), { maxProperties: 64 }),
});
const Num = Type.Number({ minimum: -1e9, maximum: 1e9 });
const PlayerName = Type.String({ maxLength: 32 });
/** Regras, estatísticas de time e capturas (o "save_stats" do original, OG-085). */
const MatchDetails = Type.Object({
  reason: Type.String({ maxLength: 20 }),
  mapTime: Count,
  mapTitle: Type.String({ maxLength: 64 }),
  rules: Type.Object({
    captureLimit: Count,
    winScoreDifference: Count,
    timeLimit: Count,
    extraTime: Count,
    extraTimePeriods: Count,
    suddenDeath: Type.Boolean(),
  }),
  teams: Type.Array(Type.Record(Type.String({ maxLength: 40 }), Num, { maxProperties: 20 }), { minItems: 2, maxItems: 2 }),
  // null antes da string na união: com coerceTypes, o Ajv do Fastify converteria null em "".
  captures: Type.Array(
    Type.Object({ time: Count, team: Type.Union([Type.Literal(0), Type.Literal(1)]), capturer: PlayerName, assistant: Type.Union([Type.Null(), PlayerName]) }),
    { maxItems: 500 },
  ),
  baseScore: Type.Array(Type.Integer({ minimum: 0, maximum: 32767 }), { minItems: 2, maxItems: 2 }),
});

const MatchResult = Type.Object({
  serverMatchId: Type.String({ minLength: 1, maxLength: 64 }),
  /** Replay da partida no game server (OG-090). */
  replayUrl: Type.Optional(Type.String({ minLength: 1, maxLength: 512, pattern: '^https?://' })),
  roomId: Type.Optional(RoomId),
  mode: GameModeSchema,
  ranked: Type.Boolean(),
  map: Type.String({ minLength: 1, maxLength: 64 }),
  redScore: Type.Integer({ minimum: 0, maximum: 32767 }),
  blueScore: Type.Integer({ minimum: 0, maximum: 32767 }),
  startedAt: Type.String({ format: 'date-time' }),
  endedAt: Type.String({ format: 'date-time' }),
  details: Type.Optional(MatchDetails),
  /** Formato da sala Ranked (OG-250); ausente nas salas sem formato. */
  format: Type.Optional(RankedFormatSchema),
  /** Série do jogo e placar dela depois deste jogo (OG-250, RN-RKL-03). */
  series: Type.Optional(
    Type.Object({
      serverSeriesId: Type.String({ minLength: 1, maxLength: 80 }),
      bestOf: SeriesBestOfSchema,
      gameNo: Type.Integer({ minimum: 1, maximum: 5 }),
      redWins: Type.Integer({ minimum: 0, maximum: 3 }),
      blueWins: Type.Integer({ minimum: 0, maximum: 3 }),
      finished: Type.Boolean(),
      // um só `type: [integer, null]` em vez de união: com a coerção de tipos do Fastify, cada ramo do
      // `anyOf` convertia o valor do outro (0 do vermelho virava null, ou null virava 0) (OG-329)
      winner: Type.Unsafe<0 | 1 | null>({ type: ['integer', 'null'], minimum: 0, maximum: 1 }),
    }),
  ),
  /** Desconexões permanentes no Ranked (OG-263, RN-RKL-20): bot no lugar ou um a menos. */
  substitutions: Type.Optional(
    Type.Array(Type.Object({ kind: Type.Union([Type.Literal('bot'), Type.Literal('short')]), team: Type.Union([Type.Literal(0), Type.Literal(1)]), atSeconds: Count }), { maxItems: 10 }),
  ),
  players: Type.Array(MatchPlayer, { maxItems: 32 }),
  /**
   * Contas que jogaram a ranqueada, inclusive quem saiu no meio (OG-349, RN-SKL-03); sem o campo
   * (servidor antigo), vale quem está em `players`.
   */
  skillRoster: Type.Optional(Type.Array(Type.Object({ userId: Type.String({ format: 'uuid' }), team: Type.Union([Type.Literal(0), Type.Literal(1)]) }), { maxItems: 32 })),
  /** Eventos da ranqueada (OG-362): abates e ações de bandeira; jogadores = índice em `players`. */
  events: Type.Optional(
    Type.Object({
      players: Type.Array(
        Type.Object({
          slot: Type.Integer({ minimum: 0, maximum: 31 }),
          userId: Type.Optional(Type.String({ format: 'uuid' })),
          name: Type.String({ minLength: 1, maxLength: 32 }),
          team: Type.Union([Type.Literal(0), Type.Literal(1)]),
          bot: Type.Boolean(),
        }),
        { maxItems: 128 },
      ),
      events: Type.Array(
        Type.Union([
          Type.Tuple([Count, Type.Literal('kill'), EventRef, EventRef, RoomCoord, RoomCoord, Type.Integer({ minimum: 0, maximum: 1 }), Type.String({ minLength: 1, maxLength: 16 })]),
          Type.Tuple([Count, Type.Union([Type.Literal('take'), Type.Literal('drop'), Type.Literal('return'), Type.Literal('capture')]), EventRef, Type.Integer({ minimum: 0, maximum: 2 })]),
        ]),
        { maxItems: MATCH_EVENTS_LIMIT },
      ),
    }),
  ),
});
export type MatchResultBody = Static<typeof MatchResult>;

const RatingDelta = Type.Object({
  deltaId: Type.String({ minLength: 1, maxLength: 80 }),
  roomId: Type.Optional(RoomId),
  userId: Type.String({ format: 'uuid' }),
  scoreDelta: Type.Integer({ minimum: -1_000_000, maximum: 1_000_000 }),
  negDelta: Count,
});

const MAX_BAN_SECONDS = 7 * 24 * 60 * 60; // ban de sala: no máximo 1 semana, como o /ban do original
/** Hash do dispositivo que o ticket levou ao game server (OG-104). */
const DeviceHash = Type.String({ pattern: '^[0-9a-f]{32}$' });

const PlayerReportBody = Type.Object({
  roomId: RoomId,
  map: Type.Optional(Type.String({ maxLength: 64 })),
  reporter: Type.Object({ accountId: Type.Optional(Type.String({ format: 'uuid' })), name: Type.String({ minLength: 1, maxLength: 32 }) }),
  target: Type.Object({
    accountId: Type.Optional(Type.String({ format: 'uuid' })),
    name: Type.String({ minLength: 1, maxLength: 32 }),
    ip: Type.Optional(Type.String({ maxLength: 45 })),
    device: Type.Optional(DeviceHash),
  }),
  reason: Type.String({ minLength: 1, maxLength: 200 }),
});

const AdminAction = Type.Object({
  roomId: RoomId,
  action: Type.Union(
    ['kick', 'ban', 'mute', 'smute', 'unmute', 'forcemap', 'set', 'sayadmin'].map((a) => Type.Literal(a)),
  ),
  actor: Type.Object({ accountId: Type.Optional(Type.String({ format: 'uuid' })), name: Type.String({ minLength: 1, maxLength: 32 }) }),
  target: Type.Optional(
    Type.Object({
      accountId: Type.Optional(Type.String({ format: 'uuid' })),
      name: Type.String({ minLength: 1, maxLength: 32 }),
      ip: Type.Optional(Type.String({ maxLength: 45 })),
      device: Type.Optional(DeviceHash),
    }),
  ),
  reason: Type.String({ maxLength: 200 }),
  durationSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_BAN_SECONDS })),
  details: Type.Optional(Type.Record(Type.String({ maxLength: 40 }), Type.Union([Type.String({ maxLength: 200 }), Type.Number()]), { maxProperties: 16 })),
});

const security = [{ gameServerHmac: [] }];
/** Sala privada sem ninguém por tanto tempo é apagada. */
const ABANDONED_MS = 60 * 60_000;

export function internalRoutes({ config, database }: AppDeps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.addHook('preHandler', async (request, reply) => {
      const result = verifyInternalRequest(
        request.headers,
        request.method,
        request.url,
        request.rawBody ?? '',
        config.internalSecrets,
        config.internalMaxSkewMs,
      );
      if (!result.ok) {
        request.log.warn({ reason: result.reason }, 'pedido interno recusado');
        return reply.code(401).send({ error: 'unauthorized', message: 'invalid game server signature' });
      }
      request.serverId = result.serverId;
    });

    app.post(
      '/rooms/heartbeat',
      {
        schema: {
          tags: ['interno'],
          summary: 'Game server informa as salas que hospeda (a cada ~3 s, OG-086)',
          security,
          body: Heartbeat,
          response: { 200: HeartbeatReply, 401: ErrorSchema, 422: ErrorSchema },
        },
      },
      async (request, reply) => {
        const serverId = request.serverId!;
        const panel = await panelPresets(database.db);
        for (const r of request.body.rooms) {
          const preset = PRESETS.find((p) => p.id === r.preset) ?? panel.find((p) => p.id === r.preset);
          if (!preset || preset.mode !== r.mode) {
            return reply.code(422).send({ error: 'invalid_room', message: `room ${r.id}: preset ${r.preset} is not a ${r.mode} preset` });
          }
        }
        const now = new Date();
        const { server, rooms: hosted } = request.body;
        await database.db.transaction(async (tx) => {
          const players = hosted.reduce((n, r) => n + r.players, 0);
          const status = { wsBaseUrl: server.wsBaseUrl, region: server.region, maxRooms: server.maxRooms, rooms: hosted.length, players, lastHeartbeatAt: now, ...(server.maps ? { maps: server.maps } : {}), ...(server.rotations ? { rotations: server.rotations } : {}) };
          await tx.insert(gameServers).values({ id: serverId, ...status }).onConflictDoUpdate({ target: gameServers.id, set: status });
          for (const r of hosted) {
            // Salas novas (as persistentes do próprio servidor) são criadas; nas existentes, só o
            // estado de execução muda: modo, preset e senha pertencem à API.
            await tx
              .insert(rooms)
              .values({
                id: r.id,
                name: r.name,
                mode: r.mode,
                preset: r.preset,
                maxPlayers: r.maxPlayers,
                persistent: r.persistent,
                serverId,
                wsUrl: r.wsUrl,
                players: r.players,
                map: r.map,
                lastHeartbeatAt: now,
                roster: r.roster ?? [],
                phase: r.phase ?? null,
              })
              .onConflictDoUpdate({
                target: rooms.id,
                set: { serverId, wsUrl: r.wsUrl, players: r.players, map: r.map, lastHeartbeatAt: now, roster: r.roster ?? [], phase: r.phase ?? null },
              });
          }
          // Salas que este servidor encerrou saem do ar na hora (o último heartbeat recua para fora
          // da janela, mas ainda diz quando a sala foi vista). Continuam atribuídas a ele: quem
          // entrar de novo reabre a sala no mesmo lugar.
          const ids = hosted.map((r) => r.id);
          await tx
            .update(rooms)
            .set({ players: 0, roster: [], lastHeartbeatAt: new Date(now.getTime() - ONLINE_MS) })
            .where(and(eq(rooms.serverId, serverId), gt(rooms.lastHeartbeatAt, new Date(now.getTime() - ONLINE_MS)), ids.length ? notInArray(rooms.id, ids) : undefined));
          // Salas privadas abandonadas (fora do ar, ou nunca abertas, há uma hora) são apagadas.
          const old = new Date(now.getTime() - ABANDONED_MS);
          await tx
            .delete(rooms)
            .where(and(eq(rooms.persistent, false), or(lt(rooms.lastHeartbeatAt, old), and(isNull(rooms.lastHeartbeatAt), lt(rooms.createdAt, old)))));
          // Sala de lobby Ranked que o servidor fechou (série acabada ou lobby vazio) não reabre (OG-252)
          await tx
            .delete(rooms)
            .where(and(eq(rooms.serverId, serverId), eq(rooms.persistent, false), isNotNull(rooms.format), lt(rooms.lastHeartbeatAt, new Date(now.getTime() - ONLINE_MS + 1))));
        });
        await applyAcks(database.db, serverId, request.body.acks ?? [], now);
        const commands = await takeCommands(database.db, serverId, now);
        return { updated: request.body.rooms.length, commands, config: await platformConfig(database.db) };
      },
    );

    app.post(
      '/matches',
      {
        schema: {
          tags: ['interno'],
          summary: 'Resultado de uma partida encerrada (idempotente por serverMatchId)',
          security,
          body: MatchResult,
          response: {
            200: Type.Object({ id: Type.String(), duplicate: Type.Literal(true) }),
            201: Type.Object({ id: Type.String(), duplicate: Type.Literal(false) }),
            401: ErrorSchema,
            422: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const serverId = request.serverId!;
        const body = request.body;
        const problem = validateMatch(body);
        if (problem) return reply.code(422).send({ error: 'invalid_match', message: problem });

        const result = await database.db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: matches.id })
            .from(matches)
            .where(and(eq(matches.serverId, serverId), eq(matches.serverMatchId, body.serverMatchId)));
          if (existing) return { id: existing.id, duplicate: true as const };

          const [room] = body.roomId ? await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, body.roomId)) : [];
          // temporada em que a partida começou, mesmo que tenha terminado depois da virada (OG-267)
          const season = await seasonAt(tx, new Date(body.startedAt));
          // Conta excluída entre o fim da partida e o envio: o jogador entra como anônimo.
          const ids = [...body.players.flatMap((p) => (p.userId ? [p.userId] : [])), ...(body.skillRoster ?? []).map((r) => r.userId)];
          const known = new Set(
            ids.length === 0
              ? []
              : (await tx.select({ id: users.id }).from(users).where(inArray(users.id, ids))).map((u) => u.id),
          );
          // clã cadastrado de cada jogador ao fim da partida; bot substituto, o do substituído (OG-259)
          const botClans = [...new Set(body.players.flatMap((p) => (p.isBot && p.clanId ? [p.clanId] : [])))];
          const clanOf = new Map<string, string>(
            known.size === 0 ? [] : (await tx.select({ userId: clanMembers.userId, clanId: clanMembers.clanId }).from(clanMembers).where(inArray(clanMembers.userId, [...known]))).map((r) => [r.userId, r.clanId]),
          );
          const realClans = new Set(botClans.length === 0 ? [] : (await tx.select({ id: clans.id }).from(clans).where(inArray(clans.id, botClans))).map((c) => c.id));
          const playerClan = (p: (typeof body.players)[number]) =>
            p.isBot ? (p.clanId && realClans.has(p.clanId) ? p.clanId : null) : p.userId && known.has(p.userId) ? (clanOf.get(p.userId) ?? null) : null;
          const war = body.ranked ? clanWarSides(body.format, body.players.map((p) => ({ team: p.team, clanId: playerClan(p) }))) : undefined;
          // série (OG-250): criada no primeiro jogo; cada jogo regrava o placar dela
          const s = body.series;
          const [series] = s
            ? await tx
                .insert(rankedSeries)
                .values({ serverId, serverSeriesId: s.serverSeriesId, roomId: room?.id ?? null, format: body.format!, bestOf: s.bestOf })
                .onConflictDoUpdate({ target: [rankedSeries.serverId, rankedSeries.serverSeriesId], set: { serverSeriesId: s.serverSeriesId } })
                .returning({ id: rankedSeries.id, games: rankedSeries.games })
            : [];
          if (s && series && s.gameNo > series.games) {
            await tx
              .update(rankedSeries)
              .set({ games: s.gameNo, redWins: s.redWins, blueWins: s.blueWins, winner: s.winner, finishedAt: s.finished ? new Date(body.endedAt) : null })
              .where(eq(rankedSeries.id, series.id));
          }
          const [match] = await tx
            .insert(matches)
            .values({
              serverId,
              serverMatchId: body.serverMatchId,
              roomId: room?.id ?? null,
              seasonId: body.ranked ? (season?.id ?? null) : null,
              mode: body.mode,
              ranked: body.ranked,
              map: body.map,
              redScore: body.redScore,
              blueScore: body.blueScore,
              startedAt: new Date(body.startedAt),
              endedAt: new Date(body.endedAt),
              details: body.details ?? {},
              replayUrl: body.replayUrl ?? null,
              format: body.format ?? null,
              seriesId: series?.id ?? null,
              gameNo: s?.gameNo ?? null,
              clanWar: war !== undefined,
              redClanId: war?.[0] ?? null,
              blueClanId: war?.[1] ?? null,
              substituteBots: (body.substitutions ?? []).filter((x) => x.kind === 'bot').length,
              shortHanded: (body.substitutions ?? []).filter((x) => x.kind === 'short').length,
              substitutions: body.substitutions ?? [],
            })
            .returning({ id: matches.id });
          // multi-kill, troca e primeiro abate (OG-363): de quem está nos eventos e no fim da partida
          const moments = body.events ? momentStats(body.events.events as MatchEvent[], body.events.players.map((p) => p.team)) : null;
          const momentsOf = (p: (typeof body.players)[number]) => {
            if (!moments) return {};
            const sum = { multiKills: 0, trades: 0, firstKills: 0 };
            body.events!.players.forEach((e, i) => {
              if (e.slot !== p.slot || e.name !== p.name || e.team !== p.team || (e.userId ?? null) !== (p.userId ?? null)) return;
              for (const k of ['multiKills', 'trades', 'firstKills'] as const) sum[k] += moments[i]![k];
            });
            return sum;
          };
          if (body.players.length > 0) {
            await tx.insert(matchPlayers).values(
              body.players.map((p) => ({
                matchId: match!.id,
                slot: p.slot,
                userId: p.userId && known.has(p.userId) ? p.userId : null,
                name: p.name,
                team: p.team,
                isBot: p.isBot,
                frags: p.frags,
                kills: p.kills,
                deaths: p.deaths,
                captures: p.captures,
                playSeconds: p.playSeconds,
                scoreDelta: p.scoreDelta,
                negDelta: p.negDelta,
                clanId: playerClan(p),
                stats: { ...p.stats, ...momentsOf(p) },
              })),
            );
          }
          // eventos da ranqueada (OG-362): jogadores com conta só se ela ainda existe
          if (body.events) {
            await tx.insert(matchEvents).values({ matchId: match!.id, events: body.events.events as MatchEvent[] });
            const eventIds = body.events.players.flatMap((p) => (p.userId ? [p.userId] : []));
            const live = new Set(eventIds.length === 0 ? [] : (await tx.select({ id: users.id }).from(users).where(inArray(users.id, eventIds))).map((u) => u.id));
            if (body.events.players.length > 0) {
              await tx.insert(matchEventPlayers).values(
                body.events.players.map((p, idx) => ({ matchId: match!.id, idx, slot: p.slot, userId: p.userId && live.has(p.userId) ? p.userId : null, name: p.name, team: p.team, isBot: p.bot })),
              );
            }
          }
          await recordMatchSocial(tx, match!.id);
          await awardMilestones(tx, [...known], { beta: config.beta, events: [match!.id], notify: true });
          // Rating de habilidade (OG-349, RN-SKL-02/03): pelo placar final, com quem saiu no meio
          if (body.ranked) {
            const roster = body.skillRoster ?? body.players.flatMap((p) => (p.userId && !p.isBot ? [{ userId: p.userId, team: p.team as 0 | 1 }] : []));
            const winner = body.redScore > body.blueScore ? 0 : body.blueScore > body.redScore ? 1 : null;
            await applySkill(tx, match!.id, roster.filter((r) => known.has(r.userId)), winner);
            // partida da temporada que já virou (começou antes da virada): hall da fama regravado (OG-354)
            if (season && !season.active) await closeSeason(tx, season.id);
          }
          return { id: match!.id, duplicate: false as const };
        });
        return reply.code(result.duplicate ? 200 : 201).send(result);
      },
    );

    app.post(
      '/rating-deltas',
      {
        schema: {
          tags: ['interno'],
          summary: 'Descontinuado (OG-350, D-66): aceita e ignora os deltas de score/neg de servidores antigos',
          security,
          body: RatingDelta,
          response: { 200: Type.Object({ applied: Type.Boolean() }), 401: ErrorSchema },
        },
      },
      // ranking por score/neg descontinuado (OG-350, D-66): servidores antigos ainda podem mandar; nada é somado
      async () => ({ applied: false }),
    );

    app.post(
      '/admin-actions',
      {
        schema: {
          tags: ['interno'],
          summary: 'Ação de moderação feita numa sala (auditoria, RN-CHT-04); ban também bloqueia novos tickets',
          security,
          body: AdminAction,
          response: { 201: Type.Object({ id: Type.Integer(), banId: Type.Union([Type.Integer(), Type.Null()]) }), 401: ErrorSchema, 422: ErrorSchema },
        },
      },
      async (request, reply) => {
        const a = request.body;
        if (a.action === 'ban' && (!a.target || !a.durationSeconds)) {
          return reply.code(422).send({ error: 'invalid_action', message: 'ban needs a target and a duration' });
        }
        const result = await database.db.transaction(async (tx) => {
          const [room] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, a.roomId));
          const ids = [a.actor.accountId, a.target?.accountId].filter((x): x is string => Boolean(x));
          const known = new Set(ids.length ? (await tx.select({ id: users.id }).from(users).where(inArray(users.id, ids))).map((u) => u.id) : []);
          const account = (id: string | undefined) => (id && known.has(id) ? id : null);
          const [row] = await tx
            .insert(adminActions)
            .values({
              actorUserId: account(a.actor.accountId),
              actorName: a.actor.name,
              targetUserId: account(a.target?.accountId),
              targetName: a.target?.name ?? null,
              roomId: room?.id ?? null,
              action: a.action,
              reason: a.reason,
              durationSeconds: a.durationSeconds ?? null,
              details: { serverId: request.serverId!, room: a.roomId, ...(a.target?.ip ? { ip: a.target.ip } : {}), ...(a.target?.device ? { device: a.target.device } : {}), ...a.details },
            })
            .returning({ id: adminActions.id });
          let banId: number | null = null;
          const userId = account(a.target?.accountId);
          const ip = inetOrNull(a.target?.ip);
          const deviceHash = a.target?.device ?? null;
          // Ban de sala precisa da sala cadastrada (sem ela, viraria ban de plataforma).
          if (a.action === 'ban' && room && (userId || ip || deviceHash)) {
            const createdAt = new Date();
            const [ban] = await tx
              .insert(bans)
              .values({
                userId,
                ip,
                deviceHash,
                roomId: room.id,
                reason: a.reason,
                createdBy: account(a.actor.accountId),
                createdAt,
                expiresAt: new Date(createdAt.getTime() + a.durationSeconds! * 1000),
              })
              .returning({ id: bans.id });
            banId = ban!.id;
          }
          return { id: row!.id, banId };
        });
        return reply.code(201).send(result);
      },
    );

    app.post(
      '/reports',
      {
        schema: {
          tags: ['interno'],
          summary: 'Denúncia de jogador feita com /report numa sala (OG-104); fica aberta para a moderação',
          security,
          body: PlayerReportBody,
          response: { 201: Type.Object({ id: Type.Integer() }), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const r = request.body;
        const [room] = await database.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, r.roomId));
        const ids = [r.reporter.accountId, r.target.accountId].filter((x): x is string => Boolean(x));
        const known = new Set(ids.length ? (await database.db.select({ id: users.id }).from(users).where(inArray(users.id, ids))).map((u) => u.id) : []);
        const account = (id: string | undefined) => (id && known.has(id) ? id : null);
        const [row] = await database.db
          .insert(playerReports)
          .values({
            roomId: room?.id ?? null,
            serverId: request.serverId!,
            map: r.map ?? null,
            reporterUserId: account(r.reporter.accountId),
            reporterName: r.reporter.name,
            targetUserId: account(r.target.accountId),
            targetName: r.target.name,
            targetIp: inetOrNull(r.target.ip),
            targetDeviceHash: r.target.device ?? null,
            reason: r.reason,
          })
          .returning({ id: playerReports.id });
        request.log.info({ report: row!.id, room: r.roomId, target: r.target.name }, 'denúncia recebida');
        return reply.code(201).send({ id: row!.id });
      },
    );
  };
}

/** `ip` válido para a coluna inet (IPv4 ou IPv6 simples); senão o ban fica só pela conta. */
function inetOrNull(ip: string | undefined): string | null {
  if (!ip) return null;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[0-9a-f:]+$/i.test(ip) ? ip : null;
}

/** Regras de consistência que o esquema JSON não expressa. */
export function validateMatch(body: MatchResultBody): string | undefined {
  if (body.ranked && body.mode !== 'ranked') return 'ranked match must be in ranked mode';
  // no Ranked, bot só como substituto (RN-RKL-19, D-46): até 2, cada um declarado em `substitutions`, sem conta nem pontos
  const bots = body.players.filter((p) => p.isBot);
  const subBots = (body.substitutions ?? []).filter((s) => s.kind === 'bot').length;
  if (body.substitutions?.length && body.mode !== 'ranked') return 'substitutions only in ranked mode';
  if (subBots > 2) return 'at most 2 substitute bots per ranked match';
  if (body.mode === 'ranked' && bots.length > subBots) return 'bots are only allowed in ranked matches as substitutes (D-46)';
  if (bots.some((p) => p.userId || p.scoreDelta !== 0 || p.negDelta !== 0)) return 'bots have no account nor ranking deltas';
  if (!body.ranked && body.players.some((p) => p.scoreDelta !== 0 || p.negDelta !== 0)) return 'ranking deltas only in ranked matches';
  if (Date.parse(body.endedAt) < Date.parse(body.startedAt)) return 'endedAt before startedAt';
  if (body.events?.events.some((e) => (e[1] === 'kill' ? [e[2], e[3]] : [e[2]]).some((i) => i >= body.events!.players.length))) return 'event player out of range';
  if (body.format && body.mode !== 'ranked') return 'format only in ranked mode';
  const s = body.series;
  if (s) {
    if (!body.format) return 'series without format';
    const need = seriesWinsNeeded(s.bestOf);
    if (s.gameNo > s.bestOf || s.redWins + s.blueWins > s.gameNo || s.redWins > need || s.blueWins > need) return 'invalid series score';
    const score = { bestOf: s.bestOf, games: s.gameNo, wins: [s.redWins, s.blueWins] as [number, number] };
    if (s.finished !== seriesOver(score) || s.winner !== seriesWinner(score)) return 'invalid series state';
  }
  const slots = new Set(body.players.map((p) => p.slot));
  if (slots.size !== body.players.length) return 'duplicate player slot';
  return undefined;
}


