// SPDX-License-Identifier: GPL-2.0-or-later
// Cadastro, login, logout e recuperação de senha (OG-081; RN-PLT-01, 03 e 06).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import { checkRegisteredName } from '@outgun/protocol';
import { isCommonPassword } from '../auth/common-passwords.js';
import { nameOwner } from '../auth/names.js';
import { hashPassword, MAX_PASSWORD, MIN_PASSWORD, validPassword, verifyPassword } from '../auth/password.js';
import type { SessionUser } from '../auth/sessions.js';
import { newToken, tokenHash } from '../auth/tokens.js';
import { emailKey, usernameKey } from '../db/keys.js';
import { betaInvites, betaInviteUses, passwordResets, playerProfiles, users } from '../db/schema.js';
import { mailLocale, passwordResetMail, welcomeMail } from '../mail/templates.js';
import { ErrorSchema } from './schemas.js';

export const RESET_TTL_MS = 30 * 60_000;
const HOUR = 60 * 60_000;

export const PublicUser = Type.Object({
  id: Type.String(),
  username: Type.String(),
  /** Só para o próprio dono da conta; nunca aparece para outros jogadores. */
  email: Type.String(),
  clanTag: Type.Union([Type.String(), Type.Null()]),
  isAdmin: Type.Boolean(),
  isModerator: Type.Boolean(),
});
const UserReply = Type.Object({ user: PublicUser });

export function toPublic(u: Omit<SessionUser, 'sessionId'>) {
  return { id: u.id, username: u.username, email: u.email, clanTag: u.clanTag, isAdmin: u.isAdmin, isModerator: u.isModerator };
}

const Password = Type.String({ minLength: MIN_PASSWORD, maxLength: MAX_PASSWORD });
const Language = Type.Optional(Type.String({ maxLength: 10 }));

const fail = (reply: FastifyReply, code: number, error: string, message: string) =>
  reply.code(code).send({ error, message });

/** Espera do login (RN-PLT-06): por nome de usuário e por IP. */
export function throttleKeys(deps: AppDeps, request: FastifyRequest, key: string) {
  return [
    { key: `user:${key}`, free: deps.config.limits.loginFailuresPerUser },
    { key: `ip:${request.ip}`, free: deps.config.limits.loginFailuresPerIp },
  ];
}

export function tooMany(reply: FastifyReply, waitMs: number) {
  return reply
    .code(429)
    .header('retry-after', String(Math.ceil(waitMs / 1000)))
    .send({ error: 'too_many_attempts', message: 'too many failed attempts, wait and try again' });
}

export function authRoutes(deps: AppDeps, services: Services): FastifyPluginAsyncTypebox {
  const { db } = deps.database;
  const { sessions, throttle, rateLimit, mailer } = services;

  return async (app) => {
    app.post(
      '/register',
      {
        schema: {
          tags: ['contas'],
          summary: 'Cria a conta e já entra (sem confirmação de e-mail)',
          body: Type.Object({
            username: Type.String({ minLength: 1, maxLength: 15 }),
            email: Type.String({ minLength: 3, maxLength: 254 }),
            password: Password,
            language: Language,
            /** Versão dos termos de uso e da política de privacidade aceita na tela (OG-107). */
            termsVersion: Type.Optional(Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' })),
            /** Código de convite, obrigatório no beta fechado (OG-106). */
            invite: Type.Optional(Type.String({ maxLength: 32 })),
          }),
          response: { 201: UserReply, 400: ErrorSchema, 403: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const { username, email, password, language } = request.body;
        const invite = request.body.invite?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (deps.config.beta && !invite) return fail(reply, 403, 'invite_required', 'the closed beta needs an invite code');
        if (!(await rateLimit.allow(`register:${request.ip}`, deps.config.limits.registerPerHourPerIp, HOUR))) {
          return fail(reply, 429, 'rate_limited', 'too many accounts created from this address, try later');
        }
        if (!checkRegisteredName(username)) return fail(reply, 400, 'invalid_username', 'invalid username');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail(reply, 400, 'invalid_email', 'invalid e-mail');
        if (!validPassword(password)) return fail(reply, 400, 'invalid_password', 'invalid password');
        if (isCommonPassword(password, username, email)) return fail(reply, 400, 'weak_password', 'this password is too common');

        const passwordHash = await hashPassword(password);
        const created = await db.transaction(async (tx) => {
          if (await nameOwner(tx, username)) return 'username_taken' as const;
          const [mailTaken] = await tx.select({ id: users.id }).from(users).where(eq(users.emailKey, emailKey(email)));
          if (mailTaken) return 'email_taken' as const;
          // beta: o convite vale se não foi revogado, não venceu e ainda tem usos (trava a linha)
          const [code] =
            deps.config.beta && invite
              ? await tx
                  .update(betaInvites)
                  .set({ uses: sql`${betaInvites.uses} + 1` })
                  .where(and(eq(betaInvites.code, invite), isNull(betaInvites.revokedAt), sql`${betaInvites.uses} < ${betaInvites.maxUses}`, or(isNull(betaInvites.expiresAt), gt(betaInvites.expiresAt, new Date()))))
                  .returning({ code: betaInvites.code })
              : [];
          if (deps.config.beta && !code) return 'invalid_invite' as const;
          const [user] = await tx
            .insert(users)
            .values({
              username,
              usernameKey: usernameKey(username),
              email: email.trim(),
              emailKey: emailKey(email),
              passwordHash,
              ...(request.body.termsVersion ? { termsVersion: request.body.termsVersion, termsAcceptedAt: new Date() } : {}),
            })
            .onConflictDoNothing()
            .returning();
          if (!user) return 'username_taken' as const; // corrida entre dois cadastros
          await tx.insert(playerProfiles).values({ userId: user.id, language: mailLocale(language) });
          if (code) await tx.insert(betaInviteUses).values({ code: code.code, userId: user.id });
          return user;
        });
        if (created === 'username_taken') return fail(reply, 409, 'username_taken', 'username already in use');
        if (created === 'email_taken') return fail(reply, 409, 'email_taken', 'e-mail already in use');
        if (created === 'invalid_invite') return fail(reply, 403, 'invalid_invite', 'invite code is invalid, used up or expired');
        await sessions.create(created.id, request, reply);
        // boas-vindas: sem esperar o envio (falha do e-mail não impede o cadastro)
        mailer.send(welcomeMail(created.email, created.username, deps.config.webUrl, mailLocale(language))).catch((error: unknown) => {
          request.log.error({ err: error }, 'e-mail de boas-vindas não enviado');
        });
        return reply.code(201).send({ user: toPublic(created) });
      },
    );

    app.post(
      '/login',
      {
        schema: {
          tags: ['contas'],
          summary: 'Entra com nome de usuário (sem diferenciar maiúsculas) e senha',
          body: Type.Object({ username: Type.String({ minLength: 1, maxLength: 64 }), password: Type.String({ maxLength: MAX_PASSWORD }) }),
          response: { 200: UserReply, 401: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        const key = usernameKey(request.body.username.trim());
        const keys = throttleKeys(deps, request, key);
        const wait = await throttle.retryAfter(keys);
        if (wait > 0) return tooMany(reply, wait);

        const [user] = await db.select().from(users).where(eq(users.usernameKey, key));
        const ok = await verifyPassword(user?.passwordHash, request.body.password);
        if (!ok || !user) {
          await throttle.fail(keys);
          return fail(reply, 401, 'invalid_credentials', 'invalid username or password');
        }
        await throttle.succeed(`user:${key}`);
        await sessions.create(user.id, request, reply);
        return { user: toPublic(user) };
      },
    );

    app.post(
      '/logout',
      { schema: { tags: ['contas'], summary: 'Encerra a sessão atual', response: { 204: Type.Null() } } },
      async (request, reply) => {
        const user = await sessions.current(request);
        if (user) await sessions.destroy(user.sessionId, reply);
        else sessions.clearCookie(reply);
        return reply.code(204).send(null);
      },
    );

    app.get(
      '/me',
      { schema: { tags: ['contas'], summary: 'Usuário da sessão', response: { 200: UserReply, 401: ErrorSchema } } },
      async (request, reply) => {
        const user = await sessions.current(request);
        if (!user) return fail(reply, 401, 'unauthenticated', 'not signed in');
        return { user: toPublic(user) };
      },
    );

    app.post(
      '/password/forgot',
      {
        schema: {
          tags: ['contas'],
          summary: 'Envia o link de redefinição; a resposta é a mesma exista ou não a conta',
          body: Type.Object({ login: Type.String({ minLength: 1, maxLength: 254 }), language: Language }),
          response: { 202: Type.Object({ ok: Type.Literal(true) }), 429: ErrorSchema },
        },
      },
      async (request, reply) => {
        if (!(await rateLimit.allow(`forgot:${request.ip}`, deps.config.limits.forgotPerHourPerIp, HOUR))) {
          return fail(reply, 429, 'rate_limited', 'too many requests, try later');
        }
        const login = request.body.login.trim();
        const where = login.includes('@') ? eq(users.emailKey, emailKey(login)) : eq(users.usernameKey, usernameKey(login));
        const [user] = await db
          .select({ id: users.id, username: users.username, email: users.email, language: playerProfiles.language })
          .from(users)
          .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
          .where(where);
        // No máximo 3 links por conta por hora (evita usar o formulário para lotar a caixa de alguém).
        if (user && (await rateLimit.allow(`forgot-user:${user.id}`, 3, HOUR))) {
          const token = newToken();
          await db.delete(passwordResets).where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
          await db.insert(passwordResets).values({ tokenHash: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
          const link = `${deps.config.webUrl}/reset-password#token=${token}`;
          const locale = mailLocale(request.body.language ?? user.language ?? undefined);
          // Sem await: o tempo de resposta não pode denunciar que a conta existe.
          mailer.send(passwordResetMail(user.email, user.username, link, locale)).catch((error: unknown) => {
            request.log.error({ err: error }, 'falha ao enviar e-mail de redefinição');
          });
        }
        return reply.code(202).send({ ok: true as const });
      },
    );

    app.post(
      '/password/reset',
      {
        schema: {
          tags: ['contas'],
          summary: 'Troca a senha com o link do e-mail; encerra as outras sessões e entra',
          body: Type.Object({ token: Type.String({ minLength: 10, maxLength: 100 }), password: Password }),
          response: { 200: UserReply, 400: ErrorSchema },
        },
      },
      async (request, reply) => {
        const { token, password } = request.body;
        if (!validPassword(password)) return fail(reply, 400, 'invalid_password', 'invalid password');
        if (isCommonPassword(password)) return fail(reply, 400, 'weak_password', 'this password is too common');
        const passwordHash = await hashPassword(password);
        const user = await db.transaction(async (tx) => {
          const [reset] = await tx
            .update(passwordResets)
            .set({ usedAt: new Date() })
            .where(and(eq(passwordResets.tokenHash, tokenHash(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
            .returning({ userId: passwordResets.userId });
          if (!reset) return undefined;
          const [updated] = await tx
            .update(users)
            .set({ passwordHash, updatedAt: new Date() })
            .where(eq(users.id, reset.userId))
            .returning();
          return updated;
        });
        if (!user) return fail(reply, 400, 'invalid_token', 'invalid or expired link');
        await sessions.destroyAllFor(user.id);
        await throttle.succeed(`user:${user.usernameKey}`);
        await sessions.create(user.id, request, reply);
        return { user: toPublic(user) };
      },
    );
  };
}
