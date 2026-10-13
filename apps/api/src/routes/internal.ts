// SPDX-License-Identifier: GPL-2.0-or-later
// Rotas dos game servers (PLAN 5.4): heartbeat das salas e resultado das partidas. Toda chamada é
// autenticada por HMAC (`verifyInternalRequest` de @outgun/tickets).
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { and, eq, inArray } from 'drizzle-orm';
import { PRESETS } from '@outgun/settings';
import type { AppDeps } from '../app.js';
import { adminActions, bans, matches, matchPlayers, rooms, seasons, users } from '../db/schema.js';
import { verifyInternalRequest } from '@outgun/tickets';
import { ErrorSchema, GameModeSchema, RoomId } from './schemas.js';

const Heartbeat = Type.Object({
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
    }),
    { maxItems: 64 },
  ),
});

const Count = Type.Integer({ minimum: 0, maximum: 1_000_000 });
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
  scoreDelta: Type.Number({ minimum: 0 }),
  negDelta: Count,
  stats: Type.Record(Type.String({ maxLength: 40 }), Type.Number(), { maxProperties: 64 }),
});
const MatchResult = Type.Object({
  serverMatchId: Type.String({ minLength: 1, maxLength: 64 }),
  roomId: Type.Optional(RoomId),
  mode: GameModeSchema,
  ranked: Type.Boolean(),
  map: Type.String({ minLength: 1, maxLength: 64 }),
  redScore: Type.Integer({ minimum: 0, maximum: 32767 }),
  blueScore: Type.Integer({ minimum: 0, maximum: 32767 }),
  startedAt: Type.String({ format: 'date-time' }),
  endedAt: Type.String({ format: 'date-time' }),
  players: Type.Array(MatchPlayer, { maxItems: 32 }),
});
export type MatchResultBody = Static<typeof MatchResult>;

const MAX_BAN_SECONDS = 7 * 24 * 60 * 60; // ban de sala: no máximo 1 semana, como o /ban do original
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
    }),
  ),
  reason: Type.String({ maxLength: 200 }),
  durationSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_BAN_SECONDS })),
  details: Type.Optional(Type.Record(Type.String({ maxLength: 40 }), Type.Union([Type.String({ maxLength: 200 }), Type.Number()]), { maxProperties: 16 })),
});

const security = [{ gameServerHmac: [] }];

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
          summary: 'Game server informa as salas que hospeda (a cada ~10 s)',
          security,
          body: Heartbeat,
          response: { 200: Type.Object({ updated: Type.Integer() }), 401: ErrorSchema, 422: ErrorSchema },
        },
      },
      async (request, reply) => {
        const serverId = request.serverId!;
        for (const r of request.body.rooms) {
          const preset = PRESETS.find((p) => p.id === r.preset);
          if (!preset || preset.mode !== r.mode) {
            return reply.code(422).send({ error: 'invalid_room', message: `room ${r.id}: preset ${r.preset} is not a ${r.mode} preset` });
          }
        }
        const now = new Date();
        for (const r of request.body.rooms) {
          // Salas novas (as persistentes do próprio servidor) são criadas; nas existentes, só o
          // estado de execução muda: modo, preset e senha pertencem à API.
          await database.db
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
            })
            .onConflictDoUpdate({
              target: rooms.id,
              set: { serverId, wsUrl: r.wsUrl, players: r.players, map: r.map, lastHeartbeatAt: now },
            });
        }
        return { updated: request.body.rooms.length };
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
          const [season] = await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.active, true));
          // Conta excluída entre o fim da partida e o envio: o jogador entra como anônimo.
          const ids = body.players.flatMap((p) => (p.userId ? [p.userId] : []));
          const known = new Set(
            ids.length === 0
              ? []
              : (await tx.select({ id: users.id }).from(users).where(inArray(users.id, ids))).map((u) => u.id),
          );
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
            })
            .returning({ id: matches.id });
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
                stats: p.stats,
              })),
            );
          }
          return { id: match!.id, duplicate: false as const };
        });
        return reply.code(result.duplicate ? 200 : 201).send(result);
      },
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
              details: { serverId: request.serverId!, room: a.roomId, ...(a.target?.ip ? { ip: a.target.ip } : {}), ...a.details },
            })
            .returning({ id: adminActions.id });
          let banId: number | null = null;
          const userId = account(a.target?.accountId);
          const ip = inetOrNull(a.target?.ip);
          // Ban de sala precisa da sala cadastrada (sem ela, viraria ban de plataforma).
          if (a.action === 'ban' && room && (userId || ip)) {
            const createdAt = new Date();
            const [ban] = await tx
              .insert(bans)
              .values({
                userId,
                ip,
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
  if (body.ranked && body.players.some((p) => p.isBot)) return 'bots are not allowed in ranked matches (D-11)';
  if (Date.parse(body.endedAt) < Date.parse(body.startedAt)) return 'endedAt before startedAt';
  const slots = new Set(body.players.map((p) => p.slot));
  if (slots.size !== body.players.length) return 'duplicate player slot';
  return undefined;
}


