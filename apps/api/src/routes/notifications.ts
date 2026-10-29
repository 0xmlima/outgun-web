// SPDX-License-Identifier: GPL-2.0-or-later
// Notificações da conta (OG-361): convite de clã (para o convidado) e pedido de entrada (para o líder
// e os admins do clã). O ícone no topo do site lista as últimas; as não lidas viram aviso (toast), e
// fechar o aviso marca como lida.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import type { SessionUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { clanMembers, notifications, type NotificationData, type NotificationKind } from '../db/schema.js';
import { liveBus } from '../live.js';
import { ErrorSchema } from './schemas.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Quantas notificações a lista devolve (as mais recentes). */
export const NOTIFICATIONS_LIMIT = 30;

/** Cria uma notificação para cada conta. */
export async function notify(tx: Db | Tx, userIds: readonly string[], kind: NotificationKind, data: NotificationData): Promise<void> {
  if (userIds.length === 0) return;
  await tx.insert(notifications).values(userIds.map((userId) => ({ userId, kind, data })));
  liveBus.publish('notifications', userIds); // portal ao vivo (OG-284)
}

/** Líder e admins do clã: quem responde aos pedidos de entrada. */
export async function clanStaff(tx: Db | Tx, clanId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: clanMembers.userId })
    .from(clanMembers)
    .where(and(eq(clanMembers.clanId, clanId), inArray(clanMembers.role, ['leader', 'admin'])));
  return rows.map((r) => r.userId);
}

const Notification = Type.Object({
  id: Type.String(),
  kind: Type.Union([Type.Literal('clan_invite'), Type.Literal('clan_request'), Type.Literal('milestone'), Type.Literal('number_expiring'), Type.Literal('number_released'), Type.Literal('cup')]),
  data: Type.Object({
    clanTag: Type.Optional(Type.String()),
    clanName: Type.Optional(Type.String()),
    from: Type.Optional(Type.String()),
    /** Marcos novos da partida (OG-394) e o texto dos secretos entre eles. */
    milestones: Type.Optional(Type.Array(Type.String())),
    secretNames: Type.Optional(Type.Record(Type.String(), Type.Object({ 'pt-BR': Type.String(), en: Type.String() }))),
    /** Número a expirar ou liberado (OG-410). */
    number: Type.Optional(Type.Integer()),
    /** OutCup (OG-527): edição, evento e detalhes. */
    cup: Type.Optional(Type.String()),
    cupEvent: Type.Optional(Type.String()),
    partner: Type.Optional(Type.String()),
    opponent: Type.Optional(Type.String()),
    matchId: Type.Optional(Type.String()),
    roomId: Type.Optional(Type.String()),
    round: Type.Optional(Type.Integer()),
    at: Type.Optional(Type.String()),
    won: Type.Optional(Type.Boolean()),
    bye: Type.Optional(Type.Boolean()),
    resolution: Type.Optional(Type.String()),
  }),
  createdAt: Type.String(),
  read: Type.Boolean(),
});

export function notificationRoutes({ database }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;
  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
    const user = await sessions.current(request);
    if (!user) await reply.code(401).send({ error: 'unauthenticated', message: 'not signed in' });
    return user;
  }
  return async (app) => {
    app.get(
      '/notifications',
      {
        schema: {
          tags: ['conta'],
          summary: `Minhas notificações (as ${NOTIFICATIONS_LIMIT} mais recentes) e quantas não lidas`,
          response: { 200: Type.Object({ unread: Type.Integer(), items: Type.Array(Notification) }), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(NOTIFICATIONS_LIMIT);
        const [count] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
        return {
          unread: count?.n ?? 0,
          items: rows.map((r) => ({ id: r.id, kind: r.kind, data: r.data, createdAt: r.createdAt.toISOString(), read: r.readAt !== null })),
        };
      },
    );

    app.post(
      '/notifications/:id/read',
      {
        schema: {
          tags: ['conta'],
          summary: 'Marca uma notificação como lida',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          response: { 204: Type.Null(), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(and(eq(notifications.id, request.params.id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
        return reply.code(204).send(null);
      },
    );

    app.post(
      '/notifications/read-all',
      {
        schema: { tags: ['conta'], summary: 'Marca todas as notificações como lidas', response: { 204: Type.Null(), 401: ErrorSchema } },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
        return reply.code(204).send(null);
      },
    );
  };
}
