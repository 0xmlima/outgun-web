// SPDX-License-Identifier: GPL-2.0-or-later
// Conta do usuário logado: troca de senha, exportação e exclusão de dados (LGPD, RN-PLT-04).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { desc, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import { hashPassword, MAX_PASSWORD, MIN_PASSWORD, verifyPassword } from '../auth/password.js';
import type { SessionUser } from '../auth/sessions.js';
import { matches, matchPlayers, playerProfiles, ratings, sessions as sessionsTable, users } from '../db/schema.js';
import { throttleKeys, tooMany } from './auth.js';
import { ErrorSchema } from './schemas.js';

/** Nome que substitui o do jogador nas partidas de uma conta excluída. */
export const ANONYMOUS_NAME = '(anon)';

export function accountRoutes(deps: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  const { db } = deps.database;
  const { sessions, throttle } = services;

  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
    const user = await sessions.current(request);
    if (!user) await reply.code(401).send({ error: 'unauthenticated', message: 'not signed in' });
    return user;
  }

  /** Confere a senha atual com a mesma espera do login (não vira atalho para força bruta). */
  async function checkPassword(request: FastifyRequest, reply: FastifyReply, user: SessionUser, password: string) {
    const [row] = await db.select({ hash: users.passwordHash, key: users.usernameKey }).from(users).where(eq(users.id, user.id));
    const keys = throttleKeys(deps, request, row?.key ?? '');
    const wait = await throttle.retryAfter(keys);
    if (wait > 0) {
      await tooMany(reply, wait);
      return false;
    }
    if (!(await verifyPassword(row?.hash, password))) {
      await throttle.fail(keys);
      await reply.code(403).send({ error: 'invalid_credentials', message: 'wrong password' });
      return false;
    }
    await throttle.succeed(`user:${row!.key}`);
    return true;
  }

  return async (app) => {
    app.post(
      '/password',
      {
        schema: {
          tags: ['contas'],
          summary: 'Troca a senha (pede a atual) e encerra as outras sessões',
          body: Type.Object({
            currentPassword: Type.String({ maxLength: MAX_PASSWORD }),
            newPassword: Type.String({ minLength: MIN_PASSWORD, maxLength: MAX_PASSWORD }),
          }),
          response: { 204: Type.Null(), 401: ErrorSchema, 403: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user || !(await checkPassword(request, reply, user, request.body.currentPassword))) return reply;
        const passwordHash = await hashPassword(request.body.newPassword);
        await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
        await sessions.destroyAllFor(user.id, user.sessionId);
        return reply.code(204).send(null);
      },
    );

    app.get(
      '/export',
      {
        schema: {
          tags: ['contas'],
          summary: 'Todos os dados pessoais da conta em JSON (LGPD)',
          response: { 200: Type.Unknown(), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const [account] = await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            clanTag: users.clanTag,
            isAdmin: users.isAdmin,
            usernameChangedAt: users.usernameChangedAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, user.id));
        const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, user.id));
        const userSessions = await db
          .select({ createdAt: sessionsTable.createdAt, lastSeenAt: sessionsTable.lastSeenAt, ip: sessionsTable.ip, userAgent: sessionsTable.userAgent })
          .from(sessionsTable)
          .where(eq(sessionsTable.userId, user.id));
        const userRatings = await db.select().from(ratings).where(eq(ratings.userId, user.id));
        const history = await db
          .select({ match: matches, player: matchPlayers })
          .from(matchPlayers)
          .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
          .where(eq(matchPlayers.userId, user.id))
          .orderBy(desc(matches.endedAt));
        return reply
          .header('content-disposition', 'attachment; filename="outgun-account.json"')
          .send({ exportedAt: new Date().toISOString(), account, profile, sessions: userSessions, ratings: userRatings, matches: history });
      },
    );

    app.delete(
      '/',
      {
        schema: {
          tags: ['contas'],
          summary: 'Exclui a conta; as partidas jogadas ficam anônimas',
          body: Type.Object({ password: Type.String({ maxLength: MAX_PASSWORD }) }),
          response: { 204: Type.Null(), 401: ErrorSchema, 403: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user || !(await checkPassword(request, reply, user, request.body.password))) return reply;
        // Partidas jogadas ficam, mas anônimas (RN-PLT-04): sem vínculo e sem o nome. Sessões, perfil,
        // ranking e links de senha caem em cascata.
        await db.transaction(async (tx) => {
          await tx.update(matchPlayers).set({ name: ANONYMOUS_NAME }).where(eq(matchPlayers.userId, user.id));
          await tx.delete(users).where(eq(users.id, user.id));
        });
        sessions.clearCookie(reply);
        return reply.code(204).send(null);
      },
    );
  };
}
