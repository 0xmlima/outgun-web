// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin (OG-087, RN-CHT-03/04, RN-PLT-05). Moderador: salas ao vivo (kick, ban de sala,
// mute), denúncias, bans de sala e auditoria. Admin: tudo isso, mais mensagem a todas as salas,
// bans de plataforma, presets Casual, rotações e papéis. Toda ação grava em admin_actions; os
// comandos para as salas vão aos game servers na resposta do heartbeat.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { casualPresetProblems, PRESETS } from '@outgun/settings';
import { and, desc, eq, gt, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import type { SessionUser } from '../auth/sessions.js';
import { usernameKey } from '../db/keys.js';
import { adminActions, adminCommands, bans, casualPresets, casualPresetVersions, mapRotations, playerReports, rooms, users } from '../db/schema.js';
import { ONLINE_MS } from '../registry.js';
import { ErrorSchema, GameModeSchema, RoomId } from './schemas.js';

export type Role = 'moderator' | 'admin';

/** Admin também é moderador. */
export function hasRole(user: Pick<SessionUser, 'isAdmin' | 'isModerator'>, role: Role): boolean {
  return user.isAdmin || (role === 'moderator' && user.isModerator);
}

const MAX_ROOM_BAN_MINUTES = 7 * 24 * 60;
const Reason = Type.String({ maxLength: 200 });
const PresetId = Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,31}$' });

export function adminRoutes(deps: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  const { db } = deps.database;

  /** Sessão com o papel pedido; senão 401/403 (e a resposta já foi enviada). */
  async function guard(request: FastifyRequest, reply: FastifyReply, role: Role): Promise<SessionUser | undefined> {
    const user = await services.sessions.current(request);
    if (!user) {
      void reply.code(401).send({ error: 'unauthorized', message: 'sign in first' });
      return undefined;
    }
    if (!hasRole(user, role)) {
      void reply.code(403).send({ error: 'forbidden', message: `${role} only` });
      return undefined;
    }
    return user;
  }

  /** Registro de auditoria (RN-CHT-04): autor, alvo, sala, motivo e detalhes. */
  const audit = (
    actor: SessionUser,
    action: string,
    o: { targetUserId?: string | null; targetName?: string | null; roomId?: string | null; reason?: string; durationSeconds?: number | null; details?: Record<string, unknown> } = {},
  ) =>
    db.insert(adminActions).values({
      actorUserId: actor.id,
      actorName: actor.username,
      targetUserId: o.targetUserId ?? null,
      targetName: o.targetName ?? null,
      roomId: o.roomId ?? null,
      action,
      reason: o.reason ?? '',
      durationSeconds: o.durationSeconds ?? null,
      details: { via: 'painel', ...o.details },
    });

  return async (app) => {
    app.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    app.get('/me', { schema: { tags: ['admin'], summary: 'Papel de quem está no painel', response: { 200: Type.Object({ role: Type.Union([Type.Literal('moderator'), Type.Literal('admin')]) }), 401: ErrorSchema, 403: ErrorSchema } } }, async (request, reply) => {
      const user = await guard(request, reply, 'moderator');
      if (!user) return reply;
      return { role: user.isAdmin ? ('admin' as const) : ('moderator' as const) };
    });

    // --- salas ao vivo ---
    app.get('/rooms', { schema: { tags: ['admin'], summary: 'Salas no ar com os jogadores (do último heartbeat)' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const online = await db
        .select()
        .from(rooms)
        .where(gt(rooms.lastHeartbeatAt, new Date(Date.now() - ONLINE_MS)))
        .orderBy(desc(rooms.players), rooms.id);
      return {
        rooms: online.map((r) => ({ id: r.id, name: r.name, mode: r.mode, preset: r.preset, map: r.map, players: r.players, maxPlayers: r.maxPlayers, serverId: r.serverId, roster: r.roster })),
      };
    });

    app.post(
      '/rooms/:id/commands',
      {
        schema: {
          tags: ['admin'],
          summary: 'Kick, ban, mute ou mensagem numa sala (entregue ao game server em até ~3 s)',
          params: Type.Object({ id: RoomId }),
          body: Type.Object({
            kind: Type.Union(['kick', 'ban', 'mute', 'unmute', 'message'].map((k) => Type.Literal(k))),
            uid: Type.Optional(Type.Integer({ minimum: 0 })),
            /** Ban: minutos (sala: 1 a 7 dias; plataforma: 0 = sem prazo). */
            minutes: Type.Optional(Type.Integer({ minimum: 0, maximum: 525_600 })),
            /** Ban de plataforma além do da sala (só admin). */
            platform: Type.Optional(Type.Boolean()),
            reason: Type.Optional(Reason),
            text: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const b = request.body;
        const [room] = await db.select().from(rooms).where(eq(rooms.id, request.params.id));
        if (!room || !room.serverId || !room.lastHeartbeatAt || Date.now() - room.lastHeartbeatAt.getTime() > ONLINE_MS) {
          return reply.code(404).send({ error: 'room_offline', message: 'room is not online' });
        }
        if (b.platform && !user.isAdmin) return reply.code(403).send({ error: 'forbidden', message: 'platform bans are admin only' });
        if (b.kind === 'message' && !b.text) return reply.code(422).send({ error: 'invalid_command', message: 'message needs text' });
        const target = b.kind === 'message' ? undefined : room.roster.find((p) => p.uid === b.uid && !p.bot);
        if (b.kind !== 'message' && !target) return reply.code(422).send({ error: 'invalid_target', message: 'no such player in the room' });
        const minutes = b.kind === 'ban' ? (b.minutes ?? 60) : undefined;
        if (b.kind === 'ban' && !b.platform && (minutes! < 1 || minutes! > MAX_ROOM_BAN_MINUTES)) {
          return reply.code(422).send({ error: 'invalid_duration', message: 'room bans last 1 minute to 7 days' });
        }
        const args = {
          ...(target ? { uid: target.uid } : {}),
          ...(minutes !== undefined ? { minutes } : {}),
          ...(b.reason ? { reason: b.reason } : {}),
          ...(b.text ? { text: b.text } : {}),
        };
        const [cmd] = await db
          .insert(adminCommands)
          .values({ serverId: room.serverId, roomId: room.id, kind: b.kind, args, actorUserId: user.id, actorName: user.username, platform: b.platform ?? false })
          .returning({ id: adminCommands.id });
        await audit(user, b.platform ? 'platform-ban' : b.kind, {
          targetUserId: target?.accountId ?? null,
          targetName: target?.name ?? null,
          roomId: room.id,
          reason: b.reason ?? b.text ?? '',
          durationSeconds: minutes ? minutes * 60 : null,
          details: { command: cmd!.id },
        });
        return reply.code(202).send({ commandId: cmd!.id });
      },
    );

    app.get('/commands/:id', { schema: { tags: ['admin'], summary: 'Andamento de um comando do painel', params: Type.Object({ id: Type.Integer() }) } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const [cmd] = await db.select().from(adminCommands).where(eq(adminCommands.id, request.params.id));
      if (!cmd) return reply.code(404).send({ error: 'not_found', message: 'no such command' });
      const status = cmd.doneAt ? 'done' : cmd.deliveredAt ? 'delivered' : 'pending';
      return { id: cmd.id, kind: cmd.kind, roomId: cmd.roomId, status, result: cmd.result };
    });

    app.post(
      '/broadcast',
      { schema: { tags: ['admin'], summary: 'Mensagem do servidor em todas as salas no ar', body: Type.Object({ text: Type.String({ minLength: 1, maxLength: 200 }) }) } },
      async (request, reply) => {
        const user = await guard(request, reply, 'admin');
        if (!user) return reply;
        const online = await db.select().from(rooms).where(gt(rooms.lastHeartbeatAt, new Date(Date.now() - ONLINE_MS)));
        const targets = online.filter((r) => r.serverId);
        if (targets.length > 0) {
          await db.insert(adminCommands).values(targets.map((r) => ({ serverId: r.serverId!, roomId: r.id, kind: 'message' as const, args: { text: request.body.text }, actorUserId: user.id, actorName: user.username })));
        }
        await audit(user, 'broadcast', { reason: request.body.text, details: { rooms: targets.length } });
        return reply.code(202).send({ rooms: targets.length });
      },
    );

    // --- denúncias ---
    app.get('/reports', { schema: { tags: ['admin'], summary: 'Denúncias do /report', querystring: Type.Object({ status: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('dismissed'), Type.Literal('actioned')])) }) } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db
        .select()
        .from(playerReports)
        .where(eq(playerReports.status, request.query.status ?? 'open'))
        .orderBy(desc(playerReports.createdAt))
        .limit(200);
      return { reports: rows.map((r) => ({ id: r.id, roomId: r.roomId, map: r.map, reporter: r.reporterName, target: r.targetName, targetUserId: r.targetUserId, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString() })) };
    });

    app.post(
      '/reports/:id',
      { schema: { tags: ['admin'], summary: 'Fecha uma denúncia', params: Type.Object({ id: Type.Integer() }), body: Type.Object({ status: Type.Union([Type.Literal('dismissed'), Type.Literal('actioned')]), note: Type.Optional(Reason) }) } },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const [row] = await db
          .update(playerReports)
          .set({ status: request.body.status, handledBy: user.id, handledAt: new Date() })
          .where(eq(playerReports.id, request.params.id))
          .returning();
        if (!row) return reply.code(404).send({ error: 'not_found', message: 'no such report' });
        await audit(user, 'report', { targetUserId: row.targetUserId, targetName: row.targetName, roomId: row.roomId, reason: request.body.note ?? '', details: { report: row.id, status: request.body.status } });
        return { id: row.id, status: row.status };
      },
    );

    // --- bans ---
    app.get('/bans', { schema: { tags: ['admin'], summary: 'Bans em vigor (mais recentes primeiro)' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const now = new Date();
      const rows = await db
        .select({ ban: bans, username: users.username })
        .from(bans)
        .leftJoin(users, eq(users.id, bans.userId))
        .where(and(isNull(bans.revokedAt), or(isNull(bans.expiresAt), gt(bans.expiresAt, now))))
        .orderBy(desc(bans.createdAt))
        .limit(200);
      return {
        bans: rows.map(({ ban, username }) => ({
          id: ban.id,
          username,
          ip: ban.ip,
          device: ban.deviceHash ? `${ban.deviceHash.slice(0, 8)}…` : null,
          roomId: ban.roomId,
          reason: ban.reason,
          createdAt: ban.createdAt.toISOString(),
          expiresAt: ban.expiresAt?.toISOString() ?? null,
        })),
      };
    });

    app.post(
      '/bans',
      {
        schema: {
          tags: ['admin'],
          summary: 'Ban de plataforma por conta e/ou IP (só admin)',
          body: Type.Object({ username: Type.Optional(Type.String({ maxLength: 32 })), ip: Type.Optional(Type.String({ maxLength: 45 })), minutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 525_600 })), reason: Reason }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'admin');
        if (!user) return reply;
        const b = request.body;
        const [target] = b.username ? await db.select().from(users).where(eq(users.usernameKey, usernameKey(b.username))) : [];
        if (b.username && !target) return reply.code(404).send({ error: 'not_found', message: 'no such account' });
        const ip = b.ip && (/^(\d{1,3}\.){3}\d{1,3}$/.test(b.ip) || /^[0-9a-f:]+$/i.test(b.ip)) ? b.ip : null;
        if (b.ip && !ip) return reply.code(422).send({ error: 'invalid_ip', message: 'invalid IP address' });
        if (!target && !ip) return reply.code(422).send({ error: 'invalid_target', message: 'give an account or an IP' });
        if (target?.isAdmin) return reply.code(422).send({ error: 'invalid_target', message: 'admins cannot be banned' });
        const now = new Date();
        const [ban] = await db
          .insert(bans)
          .values({ userId: target?.id ?? null, ip, reason: b.reason, createdBy: user.id, createdAt: now, expiresAt: b.minutes ? new Date(now.getTime() + b.minutes * 60_000) : null })
          .returning({ id: bans.id });
        await audit(user, 'platform-ban', { targetUserId: target?.id ?? null, targetName: target?.username ?? b.ip ?? null, reason: b.reason, durationSeconds: b.minutes ? b.minutes * 60 : null, details: { ban: ban!.id, ...(ip ? { ip } : {}) } });
        return reply.code(201).send({ id: ban!.id });
      },
    );

    app.delete('/bans/:id', { schema: { tags: ['admin'], summary: 'Revoga um ban (de plataforma, só admin)', params: Type.Object({ id: Type.Integer() }) } }, async (request, reply) => {
      const user = await guard(request, reply, 'moderator');
      if (!user) return reply;
      const [ban] = await db.select().from(bans).where(eq(bans.id, request.params.id));
      if (!ban || ban.revokedAt) return reply.code(404).send({ error: 'not_found', message: 'no such ban' });
      if (ban.roomId === null && !user.isAdmin) return reply.code(403).send({ error: 'forbidden', message: 'platform bans are admin only' });
      await db.update(bans).set({ revokedAt: new Date() }).where(eq(bans.id, ban.id));
      await audit(user, 'unban', { targetUserId: ban.userId, roomId: ban.roomId, details: { ban: ban.id } });
      return reply.code(204).send(null);
    });

    // --- auditoria ---
    app.get(
      '/audit',
      { schema: { tags: ['admin'], summary: 'Log de auditoria (mais recentes primeiro)', querystring: Type.Object({ before: Type.Optional(Type.Integer()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) }) } },
      async (request, reply) => {
        if (!(await guard(request, reply, 'moderator'))) return reply;
        const where: SQL | undefined = request.query.before ? lt(adminActions.id, request.query.before) : undefined;
        const rows = await db.select().from(adminActions).where(where).orderBy(desc(adminActions.id)).limit(request.query.limit ?? 50);
        return {
          entries: rows.map((r) => ({ id: r.id, actor: r.actorName, action: r.action, target: r.targetName, roomId: r.roomId, reason: r.reason, durationSeconds: r.durationSeconds, details: r.details, createdAt: r.createdAt.toISOString() })),
        };
      },
    );

    // --- presets ---
    app.get('/presets', { schema: { tags: ['admin'], summary: 'Presets do jogo (só leitura) e Casual do painel' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const panel = await db.select().from(casualPresets).where(isNull(casualPresets.deletedAt)).orderBy(casualPresets.id);
      return {
        presets: [
          ...PRESETS.map((p) => ({ id: p.id, mode: p.mode, description: p.description, overrides: p.overrides, locked: p.locked, source: 'code' as const, version: null })),
          ...panel.map((p) => ({ id: p.id, mode: 'casual' as const, description: p.description, overrides: p.overrides, locked: false, source: 'panel' as const, version: p.version })),
        ],
      };
    });

    app.put(
      '/presets/:id',
      {
        schema: {
          tags: ['admin'],
          summary: 'Cria ou altera um preset Casual (versionado); presets do jogo não mudam aqui',
          params: Type.Object({ id: PresetId }),
          body: Type.Object({ description: Type.String({ minLength: 1, maxLength: 200 }), overrides: Type.String({ maxLength: 4000 }) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'admin');
        if (!user) return reply;
        const { id } = request.params;
        if (PRESETS.some((p) => p.id === id)) {
          return reply.code(409).send({ error: 'builtin_preset', message: 'built-in presets change only with a new release (Ranked: PO decision)' });
        }
        const problems = casualPresetProblems(request.body.overrides);
        if (problems.length > 0) return reply.code(422).send({ error: 'invalid_preset', message: problems.join('; '), problems });
        const saved = await db.transaction(async (tx) => {
          const [current] = await tx.select().from(casualPresets).where(eq(casualPresets.id, id));
          const version = current ? current.version + 1 : 1;
          const values = { description: request.body.description, overrides: request.body.overrides, version, updatedBy: user.id, updatedAt: new Date(), deletedAt: null };
          await tx.insert(casualPresets).values({ id, ...values }).onConflictDoUpdate({ target: casualPresets.id, set: values });
          await tx.insert(casualPresetVersions).values({ presetId: id, version, description: values.description, overrides: values.overrides, changedBy: user.id });
          return version;
        });
        await audit(user, 'preset', { reason: request.body.description, details: { preset: id, version: saved, overrides: request.body.overrides } });
        return { id, version: saved };
      },
    );

    app.delete('/presets/:id', { schema: { tags: ['admin'], summary: 'Desativa um preset Casual do painel', params: Type.Object({ id: PresetId }) } }, async (request, reply) => {
      const user = await guard(request, reply, 'admin');
      if (!user) return reply;
      const [current] = await db.select().from(casualPresets).where(and(eq(casualPresets.id, request.params.id), isNull(casualPresets.deletedAt)));
      if (!current) return reply.code(404).send({ error: 'not_found', message: 'no such panel preset' });
      const version = current.version + 1;
      await db.transaction(async (tx) => {
        await tx.update(casualPresets).set({ deletedAt: new Date(), version, updatedBy: user.id, updatedAt: new Date() }).where(eq(casualPresets.id, current.id));
        await tx.insert(casualPresetVersions).values({ presetId: current.id, version, description: current.description, overrides: current.overrides, deleted: true, changedBy: user.id });
      });
      await audit(user, 'preset-delete', { details: { preset: current.id, version } });
      return reply.code(204).send(null);
    });

    app.get('/presets/:id/versions', { schema: { tags: ['admin'], summary: 'Histórico de um preset Casual do painel', params: Type.Object({ id: PresetId }) } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db
        .select({ v: casualPresetVersions, by: users.username })
        .from(casualPresetVersions)
        .leftJoin(users, eq(users.id, casualPresetVersions.changedBy))
        .where(eq(casualPresetVersions.presetId, request.params.id))
        .orderBy(desc(casualPresetVersions.version));
      return { versions: rows.map(({ v, by }) => ({ version: v.version, description: v.description, overrides: v.overrides, deleted: v.deleted, changedBy: by, changedAt: v.changedAt.toISOString() })) };
    });

    // --- rotações ---
    app.get('/rotations', { schema: { tags: ['admin'], summary: 'Rotações de mapas do painel por modo (sem linha = a do servidor)' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db.select().from(mapRotations);
      return { rotations: rows.map((r) => ({ mode: r.mode, maps: r.maps, version: r.version, updatedAt: r.updatedAt.toISOString() })) };
    });

    app.put(
      '/rotations/:mode',
      {
        schema: {
          tags: ['admin'],
          summary: 'Troca a rotação oficial de um modo (vale nas salas da plataforma a partir da próxima troca de mapa)',
          params: Type.Object({ mode: GameModeSchema }),
          body: Type.Object({ maps: Type.Array(Type.String({ pattern: '^[^/\\\\]{1,64}$' }), { minItems: 1, maxItems: 64 }) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'admin');
        if (!user) return reply;
        const { mode } = request.params;
        const maps = request.body.maps.map((m) => m.trim()).filter(Boolean);
        const [row] = await db
          .insert(mapRotations)
          .values({ mode, maps, updatedBy: user.id })
          .onConflictDoUpdate({ target: mapRotations.mode, set: { maps, version: sql`${mapRotations.version} + 1`, updatedBy: user.id, updatedAt: new Date() } })
          .returning();
        await audit(user, 'rotation', { reason: mode, details: { mode, maps, version: row!.version } });
        return { mode, maps, version: row!.version };
      },
    );

    // --- papéis ---
    app.put(
      '/users/:username/role',
      {
        schema: {
          tags: ['admin'],
          summary: 'Muda o papel de uma conta (jogador, moderador, admin)',
          params: Type.Object({ username: Type.String({ maxLength: 32 }) }),
          body: Type.Object({ role: Type.Union([Type.Literal('player'), Type.Literal('moderator'), Type.Literal('admin')]) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'admin');
        if (!user) return reply;
        const [target] = await db.select().from(users).where(eq(users.usernameKey, usernameKey(request.params.username)));
        if (!target) return reply.code(404).send({ error: 'not_found', message: 'no such account' });
        if (target.id === user.id) return reply.code(422).send({ error: 'own_role', message: 'you cannot change your own role' });
        const role = request.body.role;
        await db.update(users).set({ isAdmin: role === 'admin', isModerator: role === 'moderator', updatedAt: new Date() }).where(eq(users.id, target.id));
        await audit(user, 'role', { targetUserId: target.id, targetName: target.username, reason: role, details: { from: target.isAdmin ? 'admin' : target.isModerator ? 'moderator' : 'player', to: role } });
        return { username: target.username, role };
      },
    );
  };
}
