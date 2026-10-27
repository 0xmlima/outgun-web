// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin (OG-087, RN-CHT-03/04, RN-PLT-05). Moderador: salas ao vivo (kick, ban de sala,
// mute), denúncias, bans de sala e auditoria. Admin: tudo isso, mais mensagem a todas as salas,
// bans de plataforma, presets Casual, rotações e papéis. Clãs (OG-275): moderador força troca de
// nome/tag/descrição ou dissolve. Toda ação grava em admin_actions; os
// comandos para as salas vão aos game servers na resposta do heartbeat.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { checkName } from '@outgun/protocol';
import { BOT_NAMES_MAX, BOT_PREFIX_MAX_LENGTH, BOT_PREFIXES_MAX, botChatConfig, casualPresetProblems, cleanBotPrefix, cleanBotText, PRESETS, ROTATION_KEYS, type BotNameEntry } from '@outgun/settings';
import { and, count, desc, eq, gt, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { createInvites } from '../beta.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import type { SessionUser } from '../auth/sessions.js';
import { clanKey, usernameKey } from '../db/keys.js';
import { adminActions, adminCommands, bans, betaInvites, botSettings, betaInviteUses, casualPresets, casualPresetVersions, clans, feedback, gameServers, mapRotations, panelMaps, panelMapVersions, playerReports, rooms, users } from '../db/schema.js';
import { nameBlocked } from '../name-filter.js';
import { checkMapText, mapNameProblem } from '../panel-maps.js';
import { botChat, botNamesConfig } from '../platform-config.js';
import { BotChatSchema } from './internal.js';
import { checkClanFields, ClanError, uniqueError, updateClan } from './clans.js';
import { likePrefix } from './social.js';
import { ONLINE_MS } from '../registry.js';
import { issueDraft } from '../github.js';
import { ErrorSchema, RoomId } from './schemas.js';
import { securityEvent } from '../security.js';

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
        // moderador também cria e altera presets (D-70)
        const user = await guard(request, reply, 'moderator');
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
      const user = await guard(request, reply, 'moderator');
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

    // --- mapas da moderação (OG-366, D-70): .txt do formato do original, publicados na hora ---
    /** Mapas da pasta dos game servers (os do jogo; vazio = nenhum servidor informou ainda). */
    const builtinMaps = async () => [...new Set((await db.select({ maps: gameServers.maps }).from(gameServers)).flatMap((s) => s.maps))];
    const activePanelMaps = async () => (await db.select({ name: panelMaps.name }).from(panelMaps).where(isNull(panelMaps.deletedAt))).map((m) => m.name);
    const MapName = Type.String({ minLength: 1, maxLength: 64 });
    const MapText = Type.String({ minLength: 1, maxLength: 64 * 1024 });

    app.get('/maps', { schema: { tags: ['admin'], summary: 'Mapas enviados pela moderação (OG-366)' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db
        .select({ m: panelMaps, by: users.username })
        .from(panelMaps)
        .leftJoin(users, eq(users.id, panelMaps.updatedBy))
        .orderBy(panelMaps.name);
      return {
        maps: rows.map(({ m, by }) => ({ name: m.name, title: m.title, author: m.author, width: m.width, height: m.height, crc: m.crc, version: m.version, active: m.deletedAt === null, updatedBy: by, updatedAt: m.updatedAt.toISOString() })),
      };
    });

    app.post(
      '/maps/check',
      {
        schema: {
          tags: ['admin'],
          summary: 'Confere um mapa .txt sem publicar: erros do parser ou a prévia (título, autor, tamanho)',
          body: Type.Object({ name: MapName, text: MapText }),
        },
      },
      async (request, reply) => {
        if (!(await guard(request, reply, 'moderator'))) return reply;
        const problem = mapNameProblem(request.body.name);
        const checked = checkMapText(request.body.text);
        const errors = [...(problem ? [problem] : []), ...(checked.ok ? [] : checked.errors)];
        if ((await builtinMaps()).includes(request.body.name)) errors.unshift('name: already a map of the game');
        return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [], preview: checked.ok ? checked.map : null };
      },
    );

    app.put(
      '/maps/:name',
      {
        schema: {
          tags: ['admin'],
          summary: 'Publica (ou atualiza, versionado) um mapa .txt da moderação; vale nas rotações e salas',
          params: Type.Object({ name: MapName }),
          body: Type.Object({ text: MapText }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const { name } = request.params;
        const problem = mapNameProblem(name);
        if (problem) return reply.code(422).send({ error: 'invalid_map', message: problem, problems: [problem] });
        if ((await builtinMaps()).includes(name)) return reply.code(409).send({ error: 'builtin_map', message: 'this name is already a map of the game' });
        const checked = checkMapText(request.body.text);
        if (!checked.ok) return reply.code(422).send({ error: 'invalid_map', message: checked.errors.join('; '), problems: checked.errors });
        const { map } = checked;
        const version = await db.transaction(async (tx) => {
          const [current] = await tx.select({ version: panelMaps.version }).from(panelMaps).where(eq(panelMaps.name, name));
          const v = current ? current.version + 1 : 1;
          const values = { text: request.body.text, ...map, version: v, updatedBy: user.id, updatedAt: new Date(), deletedAt: null };
          await tx.insert(panelMaps).values({ name, ...values }).onConflictDoUpdate({ target: panelMaps.name, set: values });
          await tx.insert(panelMapVersions).values({ name, version: v, text: request.body.text, crc: map.crc, changedBy: user.id });
          return v;
        });
        await audit(user, 'map', { reason: map.title, details: { map: name, version, crc: map.crc, author: map.author } });
        return { name, version, ...map };
      },
    );

    app.delete('/maps/:name', { schema: { tags: ['admin'], summary: 'Desativa um mapa da moderação (recusado enquanto estiver numa rotação)', params: Type.Object({ name: MapName }) } }, async (request, reply) => {
      const user = await guard(request, reply, 'moderator');
      if (!user) return reply;
      const [current] = await db.select().from(panelMaps).where(and(eq(panelMaps.name, request.params.name), isNull(panelMaps.deletedAt)));
      if (!current) return reply.code(404).send({ error: 'not_found', message: 'no such panel map' });
      const inUse = (await db.select({ key: mapRotations.key, maps: mapRotations.maps }).from(mapRotations)).filter((r) => r.maps.includes(current.name)).map((r) => r.key);
      if (inUse.length > 0) return reply.code(409).send({ error: 'map_in_rotation', message: `remove it from the rotations first: ${inUse.join(', ')}` });
      const version = current.version + 1;
      await db.transaction(async (tx) => {
        await tx.update(panelMaps).set({ deletedAt: new Date(), version, updatedBy: user.id, updatedAt: new Date() }).where(eq(panelMaps.name, current.name));
        await tx.insert(panelMapVersions).values({ name: current.name, version, text: current.text, crc: current.crc, deleted: true, changedBy: user.id });
      });
      await audit(user, 'map-delete', { details: { map: current.name, version } });
      return reply.code(204).send(null);
    });

    app.get('/maps/:name/versions', { schema: { tags: ['admin'], summary: 'Histórico de um mapa da moderação', params: Type.Object({ name: MapName }) } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db
        .select({ v: panelMapVersions, by: users.username })
        .from(panelMapVersions)
        .leftJoin(users, eq(users.id, panelMapVersions.changedBy))
        .where(eq(panelMapVersions.name, request.params.name))
        .orderBy(desc(panelMapVersions.version));
      return { versions: rows.map(({ v, by }) => ({ version: v.version, crc: v.crc, deleted: v.deleted, changedBy: by, changedAt: v.changedAt.toISOString() })) };
    });

    // --- rotações (uma do Casual e uma por formato do Ranked, OG-251) ---
    /** Mapas que as rotações aceitam: os dos game servers e os da moderação (vazio = nenhum servidor informou ainda). */
    const mapCatalog = async () => {
      const builtin = await builtinMaps();
      return builtin.length === 0 ? [] : [...new Set([...builtin, ...(await activePanelMaps())])].sort((a, b) => a.localeCompare(b));
    };

    app.get(
      '/rotations',
      { schema: { tags: ['admin'], summary: 'Rotações de mapas do painel (sem linha = a do servidor), as padrão do servidor (OG-378) e os mapas que os servidores têm' } },
      async (request, reply) => {
        if (!(await guard(request, reply, 'moderator'))) return reply;
        const rows = await db.select().from(mapRotations);
        // padrão do servidor: a do que deu sinal por último (todos sobem com o mesmo ROTATION)
        const [latest] = await db.select({ rotations: gameServers.rotations }).from(gameServers).orderBy(desc(gameServers.lastHeartbeatAt)).limit(1);
        return {
          rotations: rows.map((r) => ({ key: r.key, maps: r.maps, version: r.version, updatedAt: r.updatedAt.toISOString() })),
          server: latest?.rotations ?? {},
          catalog: await mapCatalog(),
        };
      },
    );

    app.put(
      '/rotations/:key',
      {
        schema: {
          tags: ['admin'],
          summary: 'Troca uma rotação oficial (casual, ranked ou ranked:NxN); vale nas salas a partir da próxima troca de mapa',
          params: Type.Object({ key: Type.Union(ROTATION_KEYS.map((k) => Type.Literal(k))) }),
          body: Type.Object({ maps: Type.Array(Type.String({ pattern: '^[^/\\\\]{1,64}$' }), { minItems: 1, maxItems: 64 }) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const { key } = request.params;
        const maps = [...new Set(request.body.maps.map((m) => m.trim()).filter(Boolean))];
        // nenhum formato fica sem mapas (RN-RKL-04); mapa que nenhum servidor tem é recusado
        if (maps.length === 0) return reply.code(422).send({ error: 'empty_rotation', message: 'a rotation needs at least one map' });
        const catalog = new Set(await mapCatalog());
        const unknown = catalog.size === 0 ? [] : maps.filter((m) => !catalog.has(m) && !m.startsWith('random_map '));
        if (unknown.length > 0) return reply.code(422).send({ error: 'unknown_map', message: `unknown maps: ${unknown.join(', ')}` });
        const [row] = await db
          .insert(mapRotations)
          .values({ key, maps, updatedBy: user.id })
          .onConflictDoUpdate({ target: mapRotations.key, set: { maps, version: sql`${mapRotations.version} + 1`, updatedBy: user.id, updatedAt: new Date() } })
          .returning();
        await audit(user, 'rotation', { reason: key, details: { key, maps, version: row!.version } });
        return { key, maps, version: row!.version };
      },
    );

    // --- aba Bots (OG-403): prefixos e nomes possíveis dos bots ---
    const BotEntry = Type.Object({ text: Type.String({ maxLength: 64 }), active: Type.Boolean() });
    app.get('/bots', { schema: { tags: ['admin'], summary: 'Prefixos e nomes possíveis dos bots (OG-403)' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const [row] = await db.select({ version: botSettings.version, updatedAt: botSettings.updatedAt }).from(botSettings).where(eq(botSettings.id, 1));
      return { ...(await botNamesConfig(db)), chat: await botChat(db), version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null };
    });
    app.put(
      '/bots',
      {
        schema: {
          tags: ['admin'],
          summary: 'Troca os prefixos e os nomes possíveis dos bots; vale nos bots que entrarem depois',
          body: Type.Object({ prefixes: Type.Array(BotEntry, { maxItems: BOT_PREFIXES_MAX }), names: Type.Array(BotEntry, { maxItems: BOT_NAMES_MAX }) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const dedupe = (list: BotNameEntry[]) => list.filter((e, i) => list.findIndex((x) => x.text.toLowerCase() === e.text.toLowerCase()) === i);
        const prefixes = dedupe(request.body.prefixes.map((e) => ({ text: cleanBotPrefix(e.text), active: e.active })));
        const names = dedupe(request.body.names.map((e) => ({ text: cleanBotText(e.text), active: e.active })).filter((e) => e.text !== ''));
        const badPrefix = prefixes.filter((e) => e.text.trim().length > BOT_PREFIX_MAX_LENGTH || (e.text !== '' && !checkName(e.text.trim())));
        const badName = names.filter((e) => !checkName(e.text));
        if (badPrefix.length + badName.length > 0) {
          return reply.code(422).send({ error: 'invalid_bot_name', message: `invalid: ${[...badPrefix, ...badName].map((e) => JSON.stringify(e.text)).join(', ')}` });
        }
        const blocked = [...prefixes, ...names].filter((e) => e.text.trim() !== '' && nameBlocked(e.text, deps.config.nameFilter));
        if (blocked.length > 0) return reply.code(422).send({ error: 'name_not_allowed', message: `not allowed: ${blocked.map((e) => JSON.stringify(e.text)).join(', ')}` });
        const [row] = await db
          .insert(botSettings)
          .values({ id: 1, prefixes, names, updatedBy: user.id })
          .onConflictDoUpdate({ target: botSettings.id, set: { prefixes, names, version: sql`${botSettings.version} + 1`, updatedBy: user.id, updatedAt: new Date() } })
          .returning();
        await audit(user, 'bot_names', { details: { prefixes: prefixes.length, names: names.length, version: row!.version } });
        return { prefixes, names, version: row!.version, updatedAt: row!.updatedAt.toISOString() };
      },
    );

    app.put(
      '/bots/chat',
      { schema: { tags: ['admin'], summary: 'Troca o chat dos bots (OG-404): ligado, teto por minuto e, por acontecimento, chance, quem fala e mensagens', body: BotChatSchema } },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const chat = botChatConfig(request.body);
        await db
          .insert(botSettings)
          .values({ id: 1, chat: chat as unknown as Record<string, unknown>, updatedBy: user.id })
          .onConflictDoUpdate({ target: botSettings.id, set: { chat: chat as unknown as Record<string, unknown>, version: sql`${botSettings.version} + 1`, updatedBy: user.id, updatedAt: new Date() } });
        await audit(user, 'bot_chat', { details: { enabled: chat.enabled, perMinute: chat.perMinute } });
        return chat;
      },
    );

    // --- beta fechado (OG-106): convites e feedback ---
    app.get('/invites', { schema: { tags: ['admin'], summary: 'Convites do beta' } }, async (request, reply) => {
      if (!(await guard(request, reply, 'admin'))) return reply;
      const rows = await db
        .select({ invite: betaInvites, by: users.username })
        .from(betaInvites)
        .leftJoin(users, eq(users.id, betaInvites.createdBy))
        .orderBy(desc(betaInvites.createdAt))
        .limit(500);
      const used = await db
        .select({ code: betaInviteUses.code, username: users.username })
        .from(betaInviteUses)
        .innerJoin(users, eq(users.id, betaInviteUses.userId));
      return {
        beta: deps.config.beta,
        invites: rows.map(({ invite: i, by }) => ({
          code: i.code,
          note: i.note,
          uses: i.uses,
          maxUses: i.maxUses,
          usedBy: used.filter((u) => u.code === i.code).map((u) => u.username),
          createdBy: by,
          createdAt: i.createdAt.toISOString(),
          expiresAt: i.expiresAt?.toISOString() ?? null,
          revoked: i.revokedAt !== null,
        })),
      };
    });

    app.post(
      '/invites',
      {
        schema: {
          tags: ['admin'],
          summary: 'Gera códigos de convite do beta',
          body: Type.Object({
            count: Type.Integer({ minimum: 1, maximum: 50 }),
            maxUses: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
            note: Type.Optional(Type.String({ maxLength: 200 })),
            expiresDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
          }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'admin');
        if (!user) return reply;
        const b = request.body;
        const codes = await createInvites(db, { ...b, createdBy: user.id });
        await audit(user, 'invite', { reason: b.note ?? '', details: { count: b.count, maxUses: b.maxUses ?? 1, ...(b.expiresDays ? { expiresDays: b.expiresDays } : {}) } });
        return reply.code(201).send({ codes });
      },
    );

    app.delete('/invites/:code', { schema: { tags: ['admin'], summary: 'Revoga um convite', params: Type.Object({ code: Type.String({ pattern: '^[A-Z0-9]{10}$' }) }) } }, async (request, reply) => {
      const user = await guard(request, reply, 'admin');
      if (!user) return reply;
      const [row] = await db.update(betaInvites).set({ revokedAt: new Date() }).where(and(eq(betaInvites.code, request.params.code), isNull(betaInvites.revokedAt))).returning();
      if (!row) return reply.code(404).send({ error: 'not_found', message: 'no such active invite' });
      await audit(user, 'invite-revoke', { details: { code: row.code } });
      return reply.code(204).send(null);
    });

    const feedbackFilter = (q: { status?: string | undefined; kind?: string | undefined }) =>
      and(q.status ? eq(feedback.status, q.status as 'new') : undefined, q.kind ? eq(feedback.kind, q.kind as 'bug') : undefined);
    const FeedbackQuery = Type.Object({
      status: Type.Optional(Type.Union(['new', 'confirmed', 'critical', 'resolved', 'dismissed'].map((x) => Type.Literal(x)))),
      kind: Type.Optional(Type.Union(['bug', 'suggestion', 'praise', 'other'].map((x) => Type.Literal(x)))),
    });

    app.get('/feedback', { schema: { tags: ['admin'], summary: 'Feedback do beta com o resumo das notas de fidelidade', querystring: FeedbackQuery } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db.select().from(feedback).where(feedbackFilter(request.query)).orderBy(desc(feedback.createdAt)).limit(500);
      // resumo: a última nota de cada pessoa (veteranos à parte, critério do OG-105: ≥ 20 com média ≥ 4)
      const rated = await db.execute<{ veteran: boolean; fidelity: number }>(sql`
        SELECT DISTINCT ON (user_id) veteran, fidelity FROM feedback
        WHERE fidelity IS NOT NULL AND user_id IS NOT NULL ORDER BY user_id, created_at DESC`);
      const summarize = (list: { fidelity: number }[]) => ({
        people: list.length,
        average: list.length ? Math.round((list.reduce((a, r) => a + r.fidelity, 0) / list.length) * 100) / 100 : null,
        distribution: [1, 2, 3, 4, 5].map((n) => list.filter((r) => r.fidelity === n).length),
      });
      const all = [...rated];
      const critical = await db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'critical'));
      return {
        summary: { all: summarize(all), veterans: summarize(all.filter((r) => r.veteran)), openCritical: critical[0]!.n },
        feedback: rows.map((f) => ({ id: f.id, username: f.username, kind: f.kind, fidelity: f.fidelity, overall: f.overall, veteran: f.veteran, text: f.text, context: f.context, bug: f.bug, githubIssue: f.githubIssue, githubUrl: f.githubUrl, status: f.status, note: f.note, createdAt: f.createdAt.toISOString() })),
        // o painel só mostra "Abrir issue" com o token configurado (OG-430)
        github: services.issues !== null,
      };
    });

    app.post(
      '/feedback/:id',
      {
        schema: {
          tags: ['admin'],
          summary: 'Triagem de um feedback',
          params: Type.Object({ id: Type.Integer() }),
          body: Type.Object({ status: Type.Union(['new', 'confirmed', 'critical', 'resolved', 'dismissed'].map((x) => Type.Literal(x))), note: Type.Optional(Reason) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const status = request.body.status as 'new';
        const [row] = await db
          .update(feedback)
          .set({ status, ...(request.body.note !== undefined ? { note: request.body.note } : {}), handledBy: user.id, handledAt: new Date() })
          .where(eq(feedback.id, request.params.id))
          .returning();
        if (!row) return reply.code(404).send({ error: 'not_found', message: 'no such feedback' });
        await audit(user, 'feedback', { targetUserId: row.userId, targetName: row.username, reason: request.body.note ?? '', details: { feedback: row.id, status } });
        return { id: row.id, status: row.status };
      },
    );

    // --- relato de bug vira issue do GitHub (OG-430) ---
    const bugFeedback = async (id: number) => {
      const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
      return row?.bug ? { ...row, bug: row.bug } : null;
    };
    const IssueParams = Type.Object({ id: Type.Integer() });

    app.get('/feedback/:id/issue', { schema: { tags: ['admin'], summary: 'Prévia da issue do GitHub de um relato de bug (ou a issue já aberta)', params: IssueParams } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const row = await bugFeedback(request.params.id);
      if (!row) return reply.code(404).send({ error: 'not_found', message: 'no such bug report' });
      if (row.githubIssue !== null) return { issue: { number: row.githubIssue, url: row.githubUrl } };
      return { draft: issueDraft(row, deps.config.webUrl) };
    });

    app.post(
      '/feedback/:id/issue',
      {
        schema: {
          tags: ['admin'],
          summary: 'Abre a issue do GitHub de um relato de bug (uma só por relato)',
          params: IssueParams,
          body: Type.Object({ title: Type.Optional(Type.String({ minLength: 1, maxLength: 250 })) }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        if (!services.issues) return reply.code(503).send({ error: 'github_disabled', message: 'GITHUB_ISSUES_TOKEN is not configured' });
        const row = await bugFeedback(request.params.id);
        if (!row) return reply.code(404).send({ error: 'not_found', message: 'no such bug report' });
        if (row.githubIssue !== null) return { number: row.githubIssue, url: row.githubUrl, created: false };
        const draft = issueDraft(row, deps.config.webUrl);
        let issue;
        try {
          issue = await services.issues.create({ ...draft, ...(request.body.title ? { title: request.body.title } : {}) });
        } catch (err) {
          request.log.error({ err }, 'falha ao abrir a issue no GitHub');
          return reply.code(502).send({ error: 'github_failed', message: 'GitHub refused the issue' });
        }
        await db
          .update(feedback)
          .set({ githubIssue: issue.number, githubUrl: issue.url, issueState: 'open', status: row.status === 'new' ? 'confirmed' : row.status, handledBy: user.id, handledAt: new Date() })
          .where(eq(feedback.id, row.id));
        await audit(user, 'feedback_issue', { targetUserId: row.userId, targetName: row.username, details: { feedback: row.id, issue: issue.number } });
        return { number: issue.number, url: issue.url, created: true };
      },
    );

    app.get('/feedback.csv', { schema: { tags: ['admin'], summary: 'Feedback do beta em CSV', querystring: FeedbackQuery } }, async (request, reply) => {
      if (!(await guard(request, reply, 'moderator'))) return reply;
      const rows = await db.select().from(feedback).where(feedbackFilter(request.query)).orderBy(desc(feedback.createdAt));
      const cell = (v: unknown) => {
        const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        // aspas dobradas; fórmulas de planilha neutralizadas (=, +, -, @)
        return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
      };
      const header = ['id', 'data', 'jogador', 'tipo', 'fidelidade', 'geral', 'veterano', 'texto', 'status', 'nota', 'contexto'];
      const lines = rows.map((f) => [f.id, f.createdAt.toISOString(), f.username, f.kind, f.fidelity, f.overall, f.veteran, f.text, f.status, f.note, f.context].map(cell).join(','));
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="feedback.csv"').send([header.join(','), ...lines].join('\r\n') + '\r\n');
    });

    // --- telemetria de rede (OG-108) ---
    app.get(
      '/network',
      { schema: { tags: ['admin'], summary: 'Rede dos jogadores por região (resumos anônimos dos últimos dias)', querystring: Type.Object({ days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90 })) }) } },
      async (request, reply) => {
        if (!(await guard(request, reply, 'moderator'))) return reply;
        const days = request.query.days ?? 7;
        const rows = await db.execute<Record<string, string | number | null>>(sql`
          SELECT coalesce(region, '?') AS region, count(*)::int AS reports, sum(duration_s)::int AS seconds,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ping_p50))::int AS ping_p50,
            round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ping_p95))::int AS ping_p95,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY lag_p50))::int AS lag_p50,
            round(avg(corrections_per_min)::numeric, 1)::float AS corrections_per_min,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY fps_p5))::int AS fps_p5,
            round((100.0 * sum(stall_seconds) / greatest(sum(duration_s), 1))::numeric, 1)::float AS stall_pct
          FROM net_reports WHERE created_at > now() - make_interval(days => ${days})
          GROUP BY 1 ORDER BY 2 DESC`);
        return { days, regions: [...rows] };
      },
    );

    // --- papéis ---
    app.get(
      '/users',
      {
        schema: {
          tags: ['admin'],
          summary: 'Contas por papel (admin, moderador, jogador) e nome, com clã, criação e último acesso; `busca` filtra pelo nome',
          querystring: Type.Object({ busca: Type.Optional(Type.String({ maxLength: 32 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })) }),
        },
      },
      async (request, reply) => {
        if (!(await guard(request, reply, 'admin'))) return reply;
        const { busca, limit = 200 } = request.query;
        const key = busca?.trim() ? usernameKey(busca.trim()) : '';
        const rows = await db.execute<{ username: string; role: string; clan_tag: string | null; created_at: Date; last_seen: Date | null }>(sql`
          SELECT u.username, CASE WHEN u.is_admin THEN 'admin' WHEN u.is_moderator THEN 'moderator' ELSE 'player' END AS role,
                 u.clan_tag, u.created_at, (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen
          FROM users u
          WHERE ${key} = '' OR u.username_key LIKE ${`%${key.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}
          ORDER BY (CASE WHEN u.is_admin THEN 0 WHEN u.is_moderator THEN 1 ELSE 2 END), u.username_key
          LIMIT ${limit}`);
        const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(users);
        return {
          total,
          users: [...rows].map((r) => ({
            username: r.username,
            role: r.role,
            clanTag: r.clan_tag,
            createdAt: new Date(r.created_at).toISOString(),
            lastSeenAt: r.last_seen ? new Date(r.last_seen).toISOString() : null,
          })),
        };
      },
    );
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
        const from = target.isAdmin ? 'admin' : target.isModerator ? 'moderator' : 'player';
        await audit(user, 'role', { targetUserId: target.id, targetName: target.username, reason: role, details: { from, to: role } });
        securityEvent(request.log, 'authz_change', { user: target.username, ip: request.ip, detail: `${from},${role},by ${user.username}` });
        return { username: target.username, role };
      },
    );
    // --- clãs (OG-275, RN-CLA-08) ---
    app.get(
      '/clans',
      {
        schema: {
          tags: ['admin'],
          summary: 'Clãs com líder, membros e denúncias abertas (os denunciados primeiro)',
          querystring: Type.Object({ busca: Type.Optional(Type.String({ maxLength: 32 })) }),
        },
      },
      async (request, reply) => {
        if (!(await guard(request, reply, 'moderator'))) return reply;
        const key = clanKey(request.query.busca ?? '');
        const rows = await db.execute<{ name: string; tag: string; description: string; created_at: Date | string; leader: string | null; members: number; reports: number }>(sql`
          SELECT c.name, c.tag, c.description, c.created_at,
            (SELECT u.username FROM clan_members m JOIN users u ON u.id = m.user_id WHERE m.clan_id = c.id AND m.role = 'leader') AS leader,
            (SELECT count(*)::int FROM clan_members m WHERE m.clan_id = c.id) AS members,
            (SELECT count(*)::int FROM player_reports r WHERE r.clan_id = c.id AND r.status = 'open') AS reports
          FROM clans c
          WHERE ${key ? sql`(c.name_key LIKE ${likePrefix(key)} OR c.tag_key = ${key})` : sql`true`}
          ORDER BY reports DESC, c.created_at DESC LIMIT 200`);
        return {
          clans: rows.map((r) => ({ name: r.name, tag: r.tag, description: r.description, createdAt: new Date(r.created_at).toISOString(), leader: r.leader, members: r.members, reports: r.reports })),
        };
      },
    );

    app.patch(
      '/clans/:tag',
      {
        schema: {
          tags: ['admin'],
          summary: 'Força a troca de nome, tag ou descrição de um clã (com motivo na auditoria)',
          params: Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }) }),
          body: Type.Object({
            name: Type.Optional(Type.String({ maxLength: 24 })),
            tag: Type.Optional(Type.String({ maxLength: 3 })),
            description: Type.Optional(Type.String({ maxLength: 500 })),
            reason: Reason,
          }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const { reason, ...changes } = request.body;
        try {
          const before = await db.transaction(async (tx) => {
            const [clan] = await tx.select().from(clans).where(eq(clans.tagKey, clanKey(request.params.tag))).for('update');
            if (!clan) throw new ClanError(404, 'clan_not_found');
            await checkClanFields(tx, changes, [], clan.id); // o filtro não trava a moderação
            await updateClan(tx, clan.id, changes);
            return clan;
          });
          const after = { name: changes.name ?? before.name, tag: changes.tag ?? before.tag };
          await audit(user, 'clan-edit', {
            targetName: `(${after.tag}) ${after.name}`,
            reason,
            details: { clan: before.id, from: { name: before.name, tag: before.tag, description: before.description }, to: changes },
          });
          return { name: after.name, tag: after.tag };
        } catch (e) {
          const err = e instanceof ClanError ? e : uniqueError(e);
          if (!err) throw e;
          return reply.code(err.status).send({ error: err.code, message: err.code.replace(/_/g, ' ') });
        }
      },
    );

    app.delete(
      '/clans/:tag',
      {
        schema: {
          tags: ['admin'],
          summary: 'Dissolve um clã (com motivo na auditoria); os membros ficam sem clã e sem carência',
          params: Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }) }),
          body: Type.Object({ reason: Reason }),
        },
      },
      async (request, reply) => {
        const user = await guard(request, reply, 'moderator');
        if (!user) return reply;
        const [clan] = await db.delete(clans).where(eq(clans.tagKey, clanKey(request.params.tag))).returning();
        if (!clan) return reply.code(404).send({ error: 'clan_not_found', message: 'clan not found' });
        await audit(user, 'clan-dissolve', { targetName: `(${clan.tag}) ${clan.name}`, reason: request.body.reason, details: { clan: clan.id, description: clan.description } });
        return reply.code(204).send(null);
      },
    );
  };
}
