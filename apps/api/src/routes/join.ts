// SPDX-License-Identifier: GPL-2.0-or-later
// Entrada numa sala (OG-083, PLAN 5.4): a API confere conta, nome, senha da sala, ban e lotação e
// devolve um ticket JWT de 60 s; o game server confere o ticket com as chaves públicas (JWKS).
// "Jogar agora" (OG-086) escolhe a sala pública do modo e entra do mesmo jeito.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { signTicket, toJwks } from '@outgun/tickets';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import type { AppDeps, Services } from '../app.js';
import { checkGuestName } from '../auth/names.js';
import { verifyPassword } from '../auth/password.js';
import { bans, clanMembers, clans, gameServers, rooms } from '../db/schema.js';
import { playerSkillRank } from '../skill.js';
import { botLevelFrom, recentRanked } from '../bot-level.js';
import { onlineServers, placeRoom, roomOnline, type RoomRow } from '../registry.js';
import { ErrorSchema, GameModeSchema, RoomId } from './schemas.js';
import { nameBlocked } from '../name-filter.js';
import { previousPodium } from '../ranking.js';

const MINUTE = 60_000;

const JoinBody = {
  /** Nome do convidado (ignorado com sessão: o nome vem da conta). */
  name: Type.Optional(Type.String({ maxLength: 64 })),
  /** Região preferida, quando a sala precisa ser aberta num servidor. */
  region: Type.Optional(Type.String({ pattern: '^[a-z0-9-]{1,32}$' })),
  /** Id aleatório do navegador (OG-104): só o hash é usado, no ban por dispositivo e no ticket. */
  device: Type.Optional(Type.String({ pattern: '^[A-Za-z0-9_-]{16,64}$' })),
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
  async function admit(request: FastifyRequest, room: RoomRow, body: { name?: string | undefined; region?: string | undefined; device?: string | undefined }, returning = false): Promise<Admission> {
    const user = await sessions.current(request);
    const device = body.device ? deviceHash(body.device) : null;
    // Convidado só no Casual (RN-PLT-02, RN-MOD-03).
    // beta fechado (OG-106): só quem tem conta (o cadastro exige convite)
    if (!user && deps.config.beta) return fail(401, 'beta_account_required', 'the closed beta needs an account');
    if (!user && room.mode === 'ranked') return fail(401, 'account_required', 'ranked rooms require an account');

    let name: string;
    if (user) name = user.username;
    else {
      if (nameBlocked(body.name ?? '', deps.config.nameFilter)) return fail(400, 'name_not_allowed', 'this name is not allowed');
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
          or(
            ...(user ? [eq(bans.userId, user.id)] : []),
            eq(bans.ip, request.ip),
            ...(device ? [eq(bans.deviceHash, device)] : []),
          ),
        ),
      )
      .limit(1);
    if (ban) return fail(403, 'banned', 'you are banned from this room');
    // quem volta à própria vaga não conta como mais um (a vaga está guardada ou com o bot substituto)
    if (!returning && roomOnline(room) && room.players >= room.maxPlayers) return fail(409, 'room_full', 'room is full');

    const place = await placeRoom(db, room, deps.config.devRoomWsUrl, body.region);
    if (!place.ok) return fail(503, 'room_offline', 'no game server available');

    // clã cadastrado: no lobby Ranked entra do mesmo lado (OG-253); com cores, o lado pode virar o clã (OG-408)
    const [member] = user
      ? await db
          .select({ clanId: clanMembers.clanId, tag: clans.tag, name: clans.name, primary: clans.primaryColor, secondary: clans.secondaryColor })
          .from(clanMembers)
          .innerJoin(clans, eq(clans.id, clanMembers.clanId))
          .where(eq(clanMembers.userId, user.id))
      : [];
    const clanId = member?.clanId;
    const clanTeam = member?.primary && member.secondary ? { tag: member.tag, name: member.name, primary: member.primary, secondary: member.secondary } : undefined;
    const skill = user ? await playerSkillRank(db, user.id) : null;
    const medal = user ? await previousPodium(db, user.id) : null;
    const jti = randomUUID();
    const ticket = signTicket(
      {
        aud: room.id,
        sub: user ? user.id : `guest:${randomUUID()}`,
        name,
        // a tag como o clã quer que apareça: "(Dk)", "Dk." (OG-338)
        clan: user?.clanLabel ?? null,
        ...(clanId ? { clanId } : {}),
        ...(clanTeam ? { clanTeam } : {}),
        acct: user !== undefined,
        admin: user?.isAdmin ?? false,
        ranked: room.mode === 'ranked',
        ...(user && room.ownerId === user.id ? { owner: true } : {}),
        // rating de habilidade (OG-350): força do time para quem entra e posição no `playerInfo`
        ...(skill ? { skill: { mu: skill.mu, value: skill.value, rank: skill.rank, of: skill.of } } : {}),
        // nível do bot substituto pelo histórico Ranked e a posição no OpenSkill (OG-266, OG-350)
        ...(user && room.mode === 'ranked' ? { botLevel: botLevelFrom({ ...(await recentRanked(db, user.id)), rank: skill?.rank ?? 0, of: skill?.of ?? 0 }) } : {}),
        // pódio do mês anterior (OG-411): a cor da medalha
        ...(medal ? { medal } : {}),
        ...(place.spawn ? { spawn: place.spawn } : {}),
        ...(device ? { dev: device } : {}),
      },
      ticketKeys[0]!,
      Date.now(),
      jti,
    );
    // o game server registra o mesmo jti quando o jogador entra (OG-102)
    request.log.info({ jti, room: room.id, account: user?.id ?? null, server: place.wsUrl }, 'ticket emitido');
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
        // lobby Ranked (OG-252): conta antes da senha; com o jogo em andamento ou a série no fim, ninguém entra (D-43),
        // exceto quem caiu no meio do jogo e ainda tem a vaga (guardada ou com o bot substituto, OG-332)
        const user = room.mode === 'ranked' ? await sessions.current(request) : undefined;
        if (room.mode === 'ranked' && !user) return reply.code(401).send({ error: 'account_required', message: 'ranked rooms require an account' });
        const returning = room.phase === 'game' && user !== undefined && room.roster.some((r) => r.accountId === user.id || r.replacedAccountId === user.id);
        if (room.format && roomOnline(room) && (room.phase === 'game' || room.phase === 'finished') && !returning) {
          return reply.code(409).send({ error: 'room_in_game', message: 'the match is in progress' });
        }
        if (room.passwordHash) {
          if (!(await rateLimit.allow(`join:${request.ip}:${room.id}`, deps.config.limits.joinPasswordPerMinute, MINUTE))) {
            return reply.code(429).send({ error: 'rate_limited', message: 'too many attempts, try later' });
          }
          if (!request.body.password) return reply.code(403).send({ error: 'password_required', message: 'this room needs a password' });
          if (!(await verifyPassword(room.passwordHash, request.body.password))) {
            return reply.code(403).send({ error: 'wrong_password', message: 'wrong room password' });
          }
        }
        const result = await admit(request, room, request.body, returning);
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
          .where(and(eq(rooms.mode, mode), isNull(rooms.passwordHash), isNull(rooms.format))) // salas de lobby Ranked: pela lista (RN-RKL-05)
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

/** SHA-256 do id do navegador, 32 hex: o id cru não é guardado nem vai no ticket. */
export function deviceHash(device: string): string {
  return createHash('sha256').update(`outgun-device:${device}`).digest('hex').slice(0, 32);
}
