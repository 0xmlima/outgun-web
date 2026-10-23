// SPDX-License-Identifier: GPL-2.0-or-later
// Conta do usuário logado: troca de senha, exportação e exclusão de dados (LGPD, RN-PLT-04).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import { ALL_COLORS, checkRegisteredName } from '@outgun/protocol';
import { isCommonPassword } from '../auth/common-passwords.js';
import { nameOwner, RESERVATION_MS, USERNAME_CHANGE_COOLDOWN_MS } from '../auth/names.js';
import { hashPassword, MAX_PASSWORD, MIN_PASSWORD, verifyPassword } from '../auth/password.js';
import type { SessionUser } from '../auth/sessions.js';
import { usernameKey } from '../db/keys.js';
import { feedback, matchEventPlayers, matchPlayers, matches, playerProfiles, playerReports, ratings, reservedNames, sessions as sessionsTable, users } from '../db/schema.js';
import { PublicUser, throttleKeys, toPublic, tooMany } from './auth.js';
import { leaveClan } from './clans.js';
import { ErrorSchema } from './schemas.js';
import { nameBlocked } from '../name-filter.js';
import { securityEvent } from '../security.js';
import { numberState, setNumber } from '../player-numbers.js';
import { previousPodium } from '../ranking.js';

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
          response: { 204: Type.Null(), 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user || !(await checkPassword(request, reply, user, request.body.currentPassword))) return reply;
        if (isCommonPassword(request.body.newPassword, user.username)) {
          return reply.code(400).send({ error: 'weak_password', message: 'this password is too common' });
        }
        const passwordHash = await hashPassword(request.body.newPassword);
        await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
        securityEvent(request.log, 'authn_password_change', { user: user.username, ip: request.ip });
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
        if (nameBlocked(username, deps.config.nameFilter)) return reply.code(400).send({ error: 'name_not_allowed', message: 'this name is not allowed' });
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
        securityEvent(request.log, 'user_updated', { user: result.username, ip: request.ip, detail: `username,${user.username}` });
        return { user: toPublic(result) };
      },
    );

    // número de jogador (OG-410, D-79): 2..99 único, troca a cada 30 dias; o 1 opcional do líder do mês
    const NumberState = Type.Object({
      number: Type.Union([Type.Integer(), Type.Null()]),
      canChangeAt: Type.Union([Type.String(), Type.Null()]),
      numberOneEligible: Type.Boolean(),
      usingNumberOne: Type.Boolean(),
      style: Type.Integer(),
      free: Type.Array(Type.Integer()),
    });
    app.get('/number', { schema: { tags: ['contas'], summary: 'Meu número de jogador, os livres e o 1 do líder do mês (OG-410)', response: { 200: NumberState, 401: ErrorSchema } } }, async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return reply;
      return numberState(db, user.id);
    });
    app.put(
      '/number',
      {
        schema: {
          tags: ['contas'],
          summary: 'Escolhe (ou tira, com null) o número de 2 a 99; troca a cada 30 dias',
          body: Type.Object({ number: Type.Union([Type.Integer({ minimum: 2, maximum: 99 }), Type.Null()]) }),
          response: { 200: NumberState, 400: ErrorSchema, 401: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const r = await setNumber(db, user.id, request.body.number);
        if (!r.ok) return reply.code(r.error === 'number_taken' ? 409 : r.error === 'number_cooldown' ? 429 : 400).send({ error: r.error, message: r.error.replace('_', ' ') });
        return numberState(db, user.id);
      },
    );
    app.put(
      '/number-style',
      { schema: { tags: ['contas'], summary: 'Estilo do número (OG-413): 0 Bloco, 1 Corrida, 2 Contorno, 3 Estêncil', body: Type.Object({ style: Type.Integer({ minimum: 0, maximum: 3 }) }), response: { 200: NumberState, 401: ErrorSchema } } },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        await db.update(users).set({ numberStyle: request.body.style }).where(eq(users.id, user.id));
        return numberState(db, user.id);
      },
    );
    app.put(
      '/number-one',
      { schema: { tags: ['contas'], summary: 'Líder do mês anterior: usar (ou não) o número 1', body: Type.Object({ use: Type.Boolean() }), response: { 200: NumberState, 401: ErrorSchema, 403: ErrorSchema } } },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        if (request.body.use && (await previousPodium(db, user.id)) !== 1) return reply.code(403).send({ error: 'not_number_one', message: 'only last month leader uses number 1' });
        await db.update(users).set({ useNumberOne: request.body.use }).where(eq(users.id, user.id));
        return numberState(db, user.id);
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
          ? settings.favoriteColors.filter((c): c is number => Number.isInteger(c) && (c as number) >= 0 && (c as number) < ALL_COLORS).slice(0, ALL_COLORS)
          : undefined;
        const set = { settings, ...(colors ? { favoriteColors: colors } : {}), updatedAt: new Date() };
        await db.insert(playerProfiles).values({ userId: user.id, ...set }).onConflictDoUpdate({ target: playerProfiles.userId, set });
        return { ok: true as const };
      },
    );

    const Privacy = Type.Object({ hideCompanions: Type.Boolean(), hideHistory: Type.Boolean() });

    app.get(
      '/privacy',
      {
        schema: {
          tags: ['contas'],
          summary: 'Privacidade do perfil social: esconder companheiros/rivais e o histórico de partidas',
          response: { 200: Privacy, 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const [row] = await db.select({ hideCompanions: playerProfiles.hideCompanions, hideHistory: playerProfiles.hideHistory }).from(playerProfiles).where(eq(playerProfiles.userId, user.id));
        return row ?? { hideCompanions: false, hideHistory: false };
      },
    );

    app.put(
      '/privacy',
      {
        schema: {
          tags: ['contas'],
          summary: 'Muda a privacidade do perfil social (vale na hora; o cache público expira em 30 s)',
          body: Privacy,
          response: { 200: Privacy, 401: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const set = { hideCompanions: request.body.hideCompanions, hideHistory: request.body.hideHistory };
        await db
          .insert(playerProfiles)
          .values({ userId: user.id, ...set })
          .onConflictDoUpdate({ target: playerProfiles.userId, set: { ...set, updatedAt: new Date() } });
        return set;
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
            termsVersion: users.termsVersion,
            termsAcceptedAt: users.termsAcceptedAt,
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
        const userFeedback = await db
          .select({ createdAt: feedback.createdAt, kind: feedback.kind, fidelity: feedback.fidelity, overall: feedback.overall, veteran: feedback.veteran, text: feedback.text, context: feedback.context, status: feedback.status })
          .from(feedback)
          .where(eq(feedback.userId, user.id));
        const reports = await db
          .select({ createdAt: playerReports.createdAt, roomId: playerReports.roomId, target: playerReports.targetName, reason: playerReports.reason })
          .from(playerReports)
          .where(eq(playerReports.reporterUserId, user.id));
        return reply
          .header('content-disposition', 'attachment; filename="outgun-account.json"')
          .send({ exportedAt: new Date().toISOString(), account, profile, sessions: userSessions, ratings: userRatings, matches: history, feedback: userFeedback, reportsMade: reports });
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
        // Partidas jogadas ficam, mas anônimas (RN-PLT-04): sem vínculo e sem o nome; o feedback do beta
        // também perde o nome (OG-107). Sessões, perfil, ranking e links de senha caem em cascata;
        // o clã segue a regra de saída do líder.
        await db.transaction(async (tx) => {
          await tx.update(matchPlayers).set({ name: ANONYMOUS_NAME }).where(eq(matchPlayers.userId, user.id));
          await tx.update(matchEventPlayers).set({ name: ANONYMOUS_NAME }).where(eq(matchEventPlayers.userId, user.id));
          await tx.update(feedback).set({ username: ANONYMOUS_NAME }).where(eq(feedback.userId, user.id));
          await leaveClan(tx, user.id); // passa a liderança antes de a conta sumir (D-47)
          await tx.delete(users).where(eq(users.id, user.id));
        });
        securityEvent(request.log, 'user_deleted', { user: user.username, ip: request.ip });
        sessions.clearCookie(reply);
        return reply.code(204).send(null);
      },
    );
  };
}
