// SPDX-License-Identifier: GPL-2.0-or-later
// Entrada numa sala (OG-083, PLAN 5.4): a API confere conta, nome, senha da sala, ban e lotação e
// devolve um ticket JWT de 60 s; o game server confere o ticket com as chaves públicas (JWKS).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { signTicket, toJwks } from '@outgun/tickets';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AppDeps, Services } from '../app.js';
import { checkGuestName } from '../auth/names.js';
import { verifyPassword } from '../auth/password.js';
import { bans, rooms } from '../db/schema.js';
import { ErrorSchema, ROOM_ONLINE_MS, RoomId } from './schemas.js';

const MINUTE = 60_000;

export function joinRoutes(deps: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  const { db } = deps.database;
  const { sessions, rateLimit, ticketKeys } = services;
  const jwks = toJwks(ticketKeys);

  return async (app) => {
    app.get(
      '/.well-known/jwks.json',
      {
        schema: {
          tags: ['salas'],
          summary: 'Chaves públicas (Ed25519) que conferem os tickets de entrada',
          response: { 200: Type.Unknown() },
        },
      },
      async (_request, reply) => reply.header('cache-control', 'public, max-age=60').send(jwks),
    );

    app.post(
      '/rooms/:id/join',
      {
        schema: {
          tags: ['salas'],
          summary: 'Ticket de entrada (60 s) para o game server da sala',
          params: Type.Object({ id: RoomId }),
          body: Type.Object({
            /** Nome do convidado (ignorado com sessão: o nome vem da conta). */
            name: Type.Optional(Type.String({ maxLength: 64 })),
            password: Type.Optional(Type.String({ maxLength: 64 })),
          }),
          response: {
            200: Type.Object({ ticket: Type.String(), wsUrl: Type.String(), name: Type.String(), guest: Type.Boolean() }),
            400: ErrorSchema,
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            409: ErrorSchema,
            429: ErrorSchema,
            503: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const fail = (code: 400 | 401 | 403 | 404 | 409 | 429 | 503, error: string, message: string) =>
          reply.code(code).send({ error, message });
        const [room] = await db.select().from(rooms).where(eq(rooms.id, request.params.id));
        if (!room) return fail(404, 'room_not_found', 'room not found');
        const online = room.lastHeartbeatAt !== null && Date.now() - room.lastHeartbeatAt.getTime() < ROOM_ONLINE_MS;
        const wsUrl = online && room.wsUrl ? room.wsUrl : deps.config.devRoomWsUrl?.replace('{id}', room.id);
        if (!wsUrl) return fail(503, 'room_offline', 'room is not running');

        const user = await sessions.current(request);
        // Convidado só no Casual (RN-PLT-02, RN-MOD-03).
        if (!user && room.mode === 'ranked') return fail(401, 'account_required', 'ranked rooms require an account');

        let name: string;
        if (user) name = user.username;
        else {
          const guest = await checkGuestName(db, request.body.name?.trim() ?? '');
          if (!guest.ok) {
            return guest.reason === 'invalid'
              ? fail(400, 'invalid_name', 'invalid name')
              : fail(409, 'name_registered', 'this name belongs to an account; sign in or choose another');
          }
          name = guest.name;
        }

        // Ban de plataforma (room_id nulo) ou desta sala, por conta ou por IP, ainda valendo.
        const now = new Date();
        const [ban] = await db
          .select({ id: bans.id })
          .from(bans)
          .where(
            and(
              isNull(bans.revokedAt),
              or(isNull(bans.expiresAt), gt(bans.expiresAt, now)),
              or(isNull(bans.roomId), eq(bans.roomId, room.id)),
              user ? or(eq(bans.userId, user.id), eq(bans.ip, request.ip)) : eq(bans.ip, request.ip),
            ),
          )
          .limit(1);
        if (ban) return fail(403, 'banned', 'you are banned from this room');

        if (room.passwordHash) {
          if (!(await rateLimit.allow(`join:${request.ip}:${room.id}`, deps.config.limits.joinPasswordPerMinute, MINUTE))) {
            return fail(429, 'rate_limited', 'too many attempts, try later');
          }
          if (!request.body.password) return fail(403, 'password_required', 'this room needs a password');
          if (!(await verifyPassword(room.passwordHash, request.body.password))) return fail(403, 'wrong_password', 'wrong room password');
        }
        if (online && room.players >= room.maxPlayers) return fail(409, 'room_full', 'room is full');

        const ticket = signTicket(
          {
            aud: room.id,
            sub: user ? user.id : `guest:${randomUUID()}`,
            name,
            clan: user?.clanTag ?? null,
            acct: user !== undefined,
            admin: user?.isAdmin ?? false,
            ranked: room.mode === 'ranked',
          },
          ticketKeys[0]!,
        );
        return { ticket, wsUrl, name, guest: !user };
      },
    );
  };
}
