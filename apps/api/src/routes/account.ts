// SPDX-License-Identifier: GPL-2.0-or-later
// Conta do usuário logado: troca de senha, exportação e exclusão de dados (LGPD, RN-PLT-04).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import { checkClanTag, checkRegisteredName } from '@outgun/protocol';
import { nameOwner, RESERVATION_MS, USERNAME_CHANGE_COOLDOWN_MS } from '../auth/names.js';
import { hashPassword, MAX_PASSWORD, MIN_PASSWORD, verifyPassword } from '../auth/password.js';
import type { SessionUser } from '../auth/sessions.js';
import { usernameKey } from '../db/keys.js';
import { matches, matchPlayers, playerProfiles, ratings, reservedNames, sessions as sessionsTable, users } from '../db/schema.js';
import { PublicUser, throttleKeys, toPublic, tooMany } from './auth.js';
import { playerRating } from '../ranking.js';
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

    app.post(
      '/username',
      {
        schema: {
          tags: ['contas'],
          summary: 'Troca o nome de usuário (uma vez a cada 30 dias; o antigo fica reservado por 90)',
          body: Type.Object({ username: Type.String({ minLength: 1, maxLength: 15 }), password: Type.String({ maxLength: MAX_PASSWORD }) }),
          response: { 200: Type.Object({ user: PublicUser }), 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { username } = request.body;
        if (!checkRegisteredName(username)) return reply.code(400).send({ error: 'invalid_username', message: 'invalid username' });
        if (!(await checkPassword(request, reply, user, request.body.password))) return reply;
        const [row] = await db.select().from(users).where(eq(users.id, user.id));
        const newKey = usernameKey(username);
        // Mesmo nome comparável (maiúsculas, acentos): só a grafia muda, sem carência nem reserva.
        const cosmetic = newKey === row!.usernameKey;
        if (!cosmetic && row!.usernameChangedAt && Date.now() - row!.usernameChangedAt.getTime() < USERNAME_CHANGE_COOLDOWN_MS) {
          const next = new Date(row!.usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS).toISOString();
          return reply.code(429).send({ error: 'username_cooldown', message: next });
        }
        const result = await db.transaction(async (tx) => {
          if (!cosmetic) {
            const owner = await nameOwner(tx, username);
            if (owner && owner !== user.id) return undefined;
            await tx.delete(reservedNames).where(and(eq(reservedNames.nameKey, newKey), eq(reservedNames.userId, user.id)));
            await tx
              .insert(reservedNames)
              .values({ nameKey: row!.usernameKey, userId: user.id, reservedUntil: new Date(Date.now() + RESERVATION_MS) })
              .onConflictDoUpdate({ target: reservedNames.nameKey, set: { userId: user.id, reservedUntil: new Date(Date.now() + RESERVATION_MS) } });
          }
          const [updated] = await tx
            .update(users)
            .set({ username, usernameKey: newKey, updatedAt: new Date(), ...(cosmetic ? {} : { usernameChangedAt: new Date() }) })
            .where(eq(users.id, user.id))
            .returning();
          return updated;
        });
        if (!result) return reply.code(409).send({ error: 'username_taken', message: 'username already in use' });
        return { user: toPublic(result) };
      },
    );

    app.put(
      '/clan-tag',
      {
        schema: {
          tags: ['contas'],
          summary: 'Define ou remove a clan tag, exibida como "(TAG) nome" no chat',
          body: Type.Object({ clanTag: Type.Union([Type.String({ maxLength: 6 }), Type.Null()]) }),
          response: { 200: Type.Object({ user: PublicUser }), 400: ErrorSchema, 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const tag = request.body.clanTag === '' ? null : request.body.clanTag;
        if (tag !== null && !checkClanTag(tag)) return reply.code(400).send({ error: 'invalid_clan_tag', message: 'invalid clan tag' });
        const [updated] = await db.update(users).set({ clanTag: tag, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
        return { user: toPublic(updated!) };
      },
    );

    app.get(
      '/settings',
      {
        schema: {
          tags: ['contas'],
          summary: 'Opções do jogador guardadas na conta (OG-068); vazio se nunca gravou',
          response: { 200: Type.Object({ settings: Type.Record(Type.String(), Type.Unknown()), updatedAt: Type.Union([Type.String(), Type.Null()]) }), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const [profile] = await db.select({ settings: playerProfiles.settings, updatedAt: playerProfiles.updatedAt }).from(playerProfiles).where(eq(playerProfiles.userId, user.id));
        const settings = profile?.settings ?? {};
        return { settings, updatedAt: Object.keys(settings).length ? (profile?.updatedAt.toISOString() ?? null) : null };
      },
    );

    app.put(
      '/settings',
      {
        schema: {
          tags: ['contas'],
          summary: 'Grava as opções do jogador (substitui as anteriores; até 16 KiB)',
          body: Type.Object({ settings: Type.Record(Type.String({ maxLength: 40 }), Type.Unknown(), { maxProperties: 64 }) }),
          response: { 200: Type.Object({ ok: Type.Literal(true) }), 401: ErrorSchema, 413: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { settings } = request.body;
        if (JSON.stringify(settings).length > 16 * 1024) return reply.code(413).send({ error: 'too_large', message: 'settings too large' });
        // as favoritas também ficam na coluna própria (lista de 0..15)
        const colors = Array.isArray(settings.favoriteColors)
          ? settings.favoriteColors.filter((c): c is number => Number.isInteger(c) && (c as number) >= 0 && (c as number) < 16).slice(0, 16)
          : undefined;
        const set = { settings, ...(colors ? { favoriteColors: colors } : {}), updatedAt: new Date() };
        await db.insert(playerProfiles).values({ userId: user.id, ...set }).onConflictDoUpdate({ target: playerProfiles.userId, set });
        return { ok: true as const };
      },
    );

    app.get(
      '/ranking',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Meu ranking na temporada ativa e se participo dele',
          response: { 200: Type.Object({ score: Type.Number(), neg: Type.Integer(), participate: Type.Boolean(), rank: Type.Integer(), of: Type.Integer() }), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        return playerRating(db, user.id);
      },
    );

    app.put(
      '/ranking',
      {
        schema: {
          tags: ['ranking'],
          summary: 'Liga ou desliga a participação no ranking (vale na próxima entrada numa sala)',
          body: Type.Object({ participate: Type.Boolean() }),
          response: { 200: Type.Object({ participate: Type.Boolean() }), 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const participate = request.body.participate;
        await db
          .insert(playerProfiles)
          .values({ userId: user.id, rankingParticipation: participate })
          .onConflictDoUpdate({ target: playerProfiles.userId, set: { rankingParticipation: participate, updatedAt: new Date() } });
        return { participate };
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
