// SPDX-License-Identifier: GPL-2.0-or-later
// Rotas dos game servers (PLAN 5.4): heartbeat das salas e resultado das partidas. Toda chamada é
// autenticada por HMAC (plugins/internal-auth.ts).
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { and, eq, inArray } from 'drizzle-orm';
import { PRESETS } from '@outgun/settings';
import type { AppDeps } from '../app.js';
import { matches, matchPlayers, rooms, seasons, users } from '../db/schema.js';
import { verifyInternalRequest } from '../plugins/internal-auth.js';
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
  };
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


