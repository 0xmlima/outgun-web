// SPDX-License-Identifier: GPL-2.0-or-later
// Entrada numa sala (OG-083, PLAN 5.4): a API confere conta, nome, senha da sala, ban e lotação e
// devolve um ticket JWT de 60 s; o game server confere o ticket com as chaves públicas (JWKS).
// "Jogar agora" (OG-086) escolhe a sala pública do modo e entra do mesmo jeito.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { signTicket, toJwks } from '@outgun/tickets';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppDeps, Services } from '../app.js';
import { checkGuestName } from '../auth/names.js';
import { verifyPassword } from '../auth/password.js';
import { bans, gameServers, rooms } from '../db/schema.js';
import { onlineServers, placeRoom, roomOnline, type RoomRow } from '../registry.js';
import { ErrorSchema, GameModeSchema, RoomId } from './schemas.js';

const MINUTE = 60_000;

const JoinBody = {
  /** Nome do convidado (ignorado com sessão: o nome vem da conta). */
  name: Type.Optional(Type.String({ maxLength: 64 })),
  /** Região preferida, quando a sala precisa ser aberta num servidor. */
  region: Type.Optional(Type.String({ pattern: '^[a-z0-9-]{1,32}$' })),
};
const JoinOk = Type.Object({ ticket: Type.String(), wsUrl: Type.String(), name: Type.String(), guest: Type.Boolean(), roomId: RoomId });
const joinErrors = { 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema, 503: ErrorSchema };

type Failure = { code: 400 | 401 | 403 | 404 | 409 | 429 | 503; error: string; message: string };
type Admission = { ok: true; ticket: string; wsUrl: string; name: string; guest: boolean; roomId: string } | ({ ok: false } & Failure);

export function joinRoutes(deps: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  const { db } = deps.database;
  const { sessions, rateLimit, ticketKeys } = services;
  const jwks = toJwks(ticketKeys);
  const fail = (code: Failure['code'], error: string, message: string): Admission => ({ ok: false, code, error, message });

  /** Confere tudo e emite o ticket (a senha já foi conferida por quem chama, se a sala tiver). */
  async function admit(request: FastifyRequest, room: RoomRow, body: { name?: string | undefined; region?: string | undefined }): Promise<Admission> {
    const user = await sessions.current(request);
    // Convidado só no Casual (RN-PLT-02, RN-MOD-03).
    if (!user && room.mode === 'ranked') return fail(401, 'account_required', 'ranked rooms require an account');

    let name: string;
    if (user) name = user.username;
    else {
      const guest = await checkGuestName(db, body.name?.trim() ?? '');
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
    if (roomOnline(room) && room.players >= room.maxPlayers) return fail(409, 'room_full', 'room is full');

    const place = await placeRoom(db, room, deps.config.devRoomWsUrl, body.region);
    if (!place.ok) return fail(503, 'room_offline', 'no game server available');

    const ticket = signTicket(
      {
        aud: room.id,
        sub: user ? user.id : `guest:${randomUUID()}`,
        name,
        clan: user?.clanTag ?? null,
        acct: user !== undefined,
        admin: user?.isAdmin ?? false,
        ranked: room.mode === 'ranked',
        ...(user && room.ownerId === user.id ? { owner: true } : {}),
        ...(place.spawn ? { spawn: place.spawn } : {}),
      },
      ticketKeys[0]!,
    );
    return { ok: true, ticket, wsUrl: place.wsUrl, name, guest: !user, roomId: room.id };
  }

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
          body: Type.Object({ ...JoinBody, password: Type.Optional(Type.String({ maxLength: 64 })) }),
          response: { 200: JoinOk, ...joinErrors },
        },
      },
      async (request, reply) => {
        const [room] = await db.select().from(rooms).where(eq(rooms.id, request.params.id));
        if (!room) return reply.code(404).send({ error: 'room_not_found', message: 'room not found' });
        if (room.passwordHash) {
          if (!(await rateLimit.allow(`join:${request.ip}:${room.id}`, deps.config.limits.joinPasswordPerMinute, MINUTE))) {
            return reply.code(429).send({ error: 'rate_limited', message: 'too many attempts, try later' });
          }
          if (!request.body.password) return reply.code(403).send({ error: 'password_required', message: 'this room needs a password' });
          if (!(await verifyPassword(room.passwordHash, request.body.password))) {
            return reply.code(403).send({ error: 'wrong_password', message: 'wrong room password' });
          }
        }
        const result = await admit(request, room, request.body);
        if (!result.ok) return reply.code(result.code).send({ error: result.error, message: result.message });
        const { ok: _, ...body } = result;
        return body;
      },
    );

    app.post(
      '/rooms/quick-join',
      {
        schema: {
          tags: ['salas'],
          summary: '"Jogar agora": ticket para a melhor sala pública do modo',
          body: Type.Object({ ...JoinBody, mode: GameModeSchema }),
          response: { 200: JoinOk, ...joinErrors },
        },
      },
      async (request, reply) => {
        const { mode, region } = request.body;
        const list = await db
          .select({ room: rooms, region: gameServers.region })
          .from(rooms)
          .leftJoin(gameServers, eq(gameServers.id, rooms.serverId))
          .where(and(eq(rooms.mode, mode), isNull(rooms.passwordHash)))
          .orderBy(desc(rooms.players), rooms.id);
        const now = Date.now();
        const canSpawn = deps.config.devRoomWsUrl !== undefined || (await onlineServers(db, now)).length > 0;
        // Sala no ar com vaga, na região pedida e com mais gente primeiro (quem chega completa
        // partidas em vez de abrir salas vazias); senão uma sala da plataforma que possa abrir.
        const open = list.filter((r) => roomOnline(r.room, now) && r.room.players < r.room.maxPlayers);
        const choice =
          open.find((r) => !region || r.region === region)?.room ??
          open[0]?.room ??
          (canSpawn ? list.find((r) => r.room.persistent && !roomOnline(r.room, now))?.room : undefined);
        if (!choice) return reply.code(503).send({ error: 'no_room', message: `no ${mode} room available` });
        const result = await admit(request, choice, request.body);
        if (!result.ok) return reply.code(result.code).send({ error: result.error, message: result.message });
        const { ok: _, ...body } = result;
        return body;
      },
    );
  };
}
