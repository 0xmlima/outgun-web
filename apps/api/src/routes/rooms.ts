// SPDX-License-Identifier: GPL-2.0-or-later
// Lista pública de salas (substitui a lista do master server do original) e criação de sala
// privada Casual (OG-086, RN-CFG-03).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { PRESETS, presetSettings } from '@outgun/settings';
import { asc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { AppDeps, Services } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { gameServers, rooms } from '../db/schema.js';
import { onlineServers, pickServer, roomListed, roomOnline } from '../registry.js';
import { ErrorSchema, GameModeSchema, RoomId } from './schemas.js';

const RoomSummary = Type.Object({
  id: RoomId,
  name: Type.String(),
  mode: GameModeSchema,
  preset: Type.String(),
  hasPassword: Type.Boolean(),
  maxPlayers: Type.Integer(),
  players: Type.Integer(),
  map: Type.Union([Type.String(), Type.Null()]),
  online: Type.Boolean(),
  persistent: Type.Boolean(),
  /** Região do servidor que hospeda (ou vai hospedar) a sala. */
  region: Type.Union([Type.String(), Type.Null()]),
});

const HOUR = 60 * 60_000;
/** Nome de sala: imprimível, sem espaços nas pontas. */
const RoomName = Type.String({ minLength: 1, maxLength: 40, pattern: '^[^\\s\\x00-\\x1f\\x7f](.*[^\\s\\x00-\\x1f\\x7f])?$' });

export function roomRoutes({ config, database }: AppDeps, { sessions, rateLimit }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  return async (app) => {
    app.get(
      '/rooms',
      {
        schema: {
          tags: ['salas'],
          summary: 'Salas no ar (e as da plataforma que abrem sob demanda), com jogadores e mapa',
          querystring: Type.Object({ mode: Type.Optional(GameModeSchema) }),
          response: { 200: Type.Object({ rooms: Type.Array(RoomSummary) }) },
        },
      },
      async (request) => {
        const now = Date.now();
        const list = await db
          .select({ room: rooms, region: gameServers.region })
          .from(rooms)
          .leftJoin(gameServers, eq(gameServers.id, rooms.serverId))
          .where(request.query.mode ? eq(rooms.mode, request.query.mode) : undefined)
          .orderBy(asc(rooms.mode), asc(rooms.id));
        const canSpawn = config.devRoomWsUrl !== undefined || (await onlineServers(db, now)).length > 0;
        return {
          rooms: list
            .filter(({ room }) => roomListed(room, canSpawn, now))
            .map(({ room: r, region }) => {
              const online = roomOnline(r, now);
              return {
                id: r.id,
                name: r.name,
                mode: r.mode,
                preset: r.preset,
                hasPassword: r.passwordHash !== null,
                maxPlayers: r.maxPlayers,
                players: online ? r.players : 0,
                map: online ? r.map : null,
                online,
                persistent: r.persistent,
                region: region ?? null,
              };
            }),
        };
      },
    );

    app.post(
      '/rooms',
      {
        schema: {
          tags: ['salas'],
          summary: 'Cria uma sala privada Casual (só com conta); ela abre quando o primeiro jogador entra',
          body: Type.Object({
            name: RoomName,
            preset: Type.String({ maxLength: 40 }),
            /** Senha da sala (até 15 caracteres, como o original); sem ela, entra quem tiver o link. */
            password: Type.Optional(Type.String({ minLength: 1, maxLength: 15 })),
            maxPlayers: Type.Optional(Type.Integer({ minimum: 2, maximum: 32, multipleOf: 2 })),
            /** Rotação própria (nomes dos mapas); vazia = rotação oficial. */
            maps: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64, pattern: '^[^/\\\\]+$' }), { maxItems: 32 })),
            region: Type.Optional(Type.String({ pattern: '^[a-z0-9-]{1,32}$' })),
          }),
          response: {
            201: Type.Object({ room: RoomSummary, inviteUrl: Type.String() }),
            401: ErrorSchema,
            422: ErrorSchema,
            429: ErrorSchema,
            503: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await sessions.current(request);
        if (!user) return reply.code(401).send({ error: 'login_required', message: 'sign in to create a room' });
        const body = request.body;
        // Não existe sala privada Ranked (RN-MOD-04): só presets Casual.
        const preset = PRESETS.find((p) => p.id === body.preset);
        if (!preset || preset.mode !== 'casual') return reply.code(422).send({ error: 'invalid_preset', message: 'private rooms take a casual preset' });
        if (!(await rateLimit.allow(`create-room:${user.id}`, config.limits.roomsPerHourPerUser, HOUR))) {
          return reply.code(429).send({ error: 'rate_limited', message: 'too many rooms, try later' });
        }
        const servers = await onlineServers(db);
        const server = pickServer(servers, body.region);
        if (!server && !config.devRoomWsUrl) return reply.code(503).send({ error: 'no_server', message: 'no game server available' });

        const id = `p-${randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '0')}`;
        const maxPlayers = presetSettings(preset.id).server.maxPlayers ?? body.maxPlayers ?? 16;
        const [row] = await db
          .insert(rooms)
          .values({
            id,
            name: body.name,
            mode: 'casual',
            preset: preset.id,
            passwordHash: body.password ? await hashPassword(body.password) : null,
            ownerId: user.id,
            maxPlayers,
            persistent: false,
            maps: body.maps && body.maps.length > 0 ? body.maps : null,
            ...(server ? { serverId: server.id, wsUrl: `${server.wsBaseUrl.replace(/\/$/, '')}/rooms/${id}` } : {}),
          })
          .returning();
        const r = row!;
        return reply.code(201).send({
          room: {
            id: r.id,
            name: r.name,
            mode: r.mode,
            preset: r.preset,
            hasPassword: r.passwordHash !== null,
            maxPlayers: r.maxPlayers,
            players: 0,
            map: null,
            online: false,
            persistent: false,
            region: server?.region ?? null,
          },
          inviteUrl: `${config.webUrl}/play?room=${r.id}`,
        });
      },
    );
  };
}
