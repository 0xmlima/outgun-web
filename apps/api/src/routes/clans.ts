// SPDX-License-Identifier: GPL-2.0-or-later
// Clãs (OG-270, RN-CLA-01..05, D-47): criar, editar, sair, expulsar, papéis, transferir a liderança,
// dissolver, página pública e busca. A tag de users.clan_tag (ticket, chat) vem dos gatilhos da
// migração 0016. Convites e pedidos de entrada ficam no OG-271.
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkClanName, checkClanTag, MAX_CLAN_NAME_LENGTH as MAX_CLAN_NAME } from '@outgun/protocol';
import type { AppDeps, Services } from '../app.js';
import type { SessionUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { clanKey, usernameKey } from '../db/keys.js';
import { clanMembers, clans, users, type ClanRole } from '../db/schema.js';
import { likePrefix } from './social.js';
import { ErrorSchema } from './schemas.js';

/** Limite de membros (D-47); vale para convites e pedidos (OG-271). */
export const MAX_CLAN_MEMBERS = 30;
export const MAX_CLAN_DESCRIPTION = 500;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const RoleSchema = Type.Union([Type.Literal('leader'), Type.Literal('admin'), Type.Literal('member')]);
const ClanSchema = Type.Object({
  name: Type.String(),
  tag: Type.String(),
  description: Type.String(),
  createdAt: Type.String(),
  members: Type.Array(Type.Object({ username: Type.String(), role: RoleSchema, joinedAt: Type.String() })),
});
const TagParams = Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }) });
const MemberParams = Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }), username: Type.String({ minLength: 1, maxLength: 32 }) });

class ClanError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

type PgError = { code?: string; constraint_name?: string };
function uniqueError(e: unknown): ClanError | undefined {
  const err = ((e as { cause?: PgError })?.cause ?? e) as PgError;
  if (err?.code !== '23505') return undefined;
  const name = err.constraint_name ?? '';
  return new ClanError(409, name.includes('tag') ? 'clan_tag_taken' : name.includes('name') ? 'clan_name_taken' : 'already_in_clan');
}

/** Membro do clã com a linha do clã travada (as mudanças de um clã ficam em série). */
async function lockClan(tx: Tx, tag: string) {
  const [clan] = await tx.select().from(clans).where(eq(clans.tagKey, clanKey(tag))).for('update');
  if (!clan) throw new ClanError(404, 'clan_not_found');
  return clan;
}

async function roleIn(tx: Tx, clanId: string, userId: string): Promise<ClanRole | undefined> {
  const [m] = await tx.select({ role: clanMembers.role }).from(clanMembers).where(and(eq(clanMembers.clanId, clanId), eq(clanMembers.userId, userId)));
  return m?.role;
}

async function memberByName(tx: Tx, clanId: string, username: string) {
  const [m] = await tx
    .select({ userId: clanMembers.userId, role: clanMembers.role })
    .from(clanMembers)
    .innerJoin(users, eq(users.id, clanMembers.userId))
    .where(and(eq(clanMembers.clanId, clanId), eq(users.usernameKey, usernameKey(username))));
  if (!m) throw new ClanError(404, 'member_not_found');
  return m;
}

/**
 * Tira o jogador do clã (D-47): o líder passa a liderança ao admin mais antigo, senão ao membro mais
 * antigo; o último que sai dissolve o clã. Também usado na exclusão da conta.
 */
export async function leaveClan(tx: Tx, userId: string): Promise<'left' | 'dissolved' | 'none'> {
  const [me] = await tx.select().from(clanMembers).where(eq(clanMembers.userId, userId));
  if (!me) return 'none';
  await tx.select({ id: clans.id }).from(clans).where(eq(clans.id, me.clanId)).for('update');
  await tx.delete(clanMembers).where(eq(clanMembers.userId, userId));
  const [heir] = await tx
    .select({ userId: clanMembers.userId, role: clanMembers.role })
    .from(clanMembers)
    .where(eq(clanMembers.clanId, me.clanId))
    .orderBy(sql`${clanMembers.role} = 'admin' DESC`, asc(clanMembers.joinedAt), asc(clanMembers.userId))
    .limit(1);
  if (!heir) {
    await tx.delete(clans).where(eq(clans.id, me.clanId));
    return 'dissolved';
  }
  if (me.role === 'leader') await tx.update(clanMembers).set({ role: 'leader' }).where(eq(clanMembers.userId, heir.userId));
  return 'left';
}

export function clanRoutes({ database }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;

  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
    const user = await sessions.current(request);
    if (!user) await reply.code(401).send({ error: 'unauthenticated', message: 'not signed in' });
    return user;
  }

  /**
   * Roda `fn` numa transação; ClanError e nome/tag repetidos (corrida entre dois pedidos) viram a
   * resposta de erro e o retorno é `undefined`.
   */
  async function run<T>(reply: FastifyReply, fn: (tx: Tx) => Promise<T>): Promise<{ value: T } | undefined> {
    try {
      return { value: await db.transaction(fn) };
    } catch (e) {
      const err = e instanceof ClanError ? e : uniqueError(e);
      if (!err) throw e;
      await reply.code(err.status).send({ error: err.code, message: err.code.replace(/_/g, ' ') });
      return undefined;
    }
  }

  async function page(tag: string) {
    const [clan] = await db.select().from(clans).where(eq(clans.tagKey, clanKey(tag)));
    if (!clan) return undefined;
    const members = await db
      .select({ username: users.username, role: clanMembers.role, joinedAt: clanMembers.joinedAt })
      .from(clanMembers)
      .innerJoin(users, eq(users.id, clanMembers.userId))
      .where(eq(clanMembers.clanId, clan.id))
      .orderBy(sql`CASE ${clanMembers.role} WHEN 'leader' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`, asc(clanMembers.joinedAt));
    return {
      name: clan.name,
      tag: clan.tag,
      description: clan.description,
      createdAt: clan.createdAt.toISOString(),
      members: members.map((m) => ({ username: m.username, role: m.role, joinedAt: m.joinedAt.toISOString() })),
    };
  }

  const validName = (name: string) => {
    if (!checkClanName(name)) throw new ClanError(400, 'invalid_clan_name');
  };
  const validTag = (tag: string) => {
    if (!checkClanTag(tag)) throw new ClanError(400, 'invalid_clan_tag');
  };
  const free = async (tx: Tx, name: string | undefined, tag: string | undefined, self?: string) => {
    if (name !== undefined) {
      const [row] = await tx.select({ id: clans.id }).from(clans).where(eq(clans.nameKey, clanKey(name)));
      if (row && row.id !== self) throw new ClanError(409, 'clan_name_taken');
    }
    if (tag !== undefined) {
      const [row] = await tx.select({ id: clans.id }).from(clans).where(eq(clans.tagKey, clanKey(tag)));
      if (row && row.id !== self) throw new ClanError(409, 'clan_tag_taken');
    }
  };

  return async (app) => {
    app.get(
      '/clans',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Busca de clãs pelo começo do nome ou pela tag (sem diferença de maiúsculas e acentos)',
          querystring: Type.Object({
            busca: Type.Optional(Type.String({ maxLength: 32 })),
            limit: Type.Integer({ minimum: 1, maximum: 50, default: 20 }),
            offset: Type.Integer({ minimum: 0, maximum: 10_000, default: 0 }),
          }),
          response: {
            200: Type.Object({
              total: Type.Integer(),
              clans: Type.Array(Type.Object({ name: Type.String(), tag: Type.String(), members: Type.Integer(), createdAt: Type.String() })),
            }),
          },
        },
      },
      async (request) => {
        const { limit, offset } = request.query;
        const key = clanKey(request.query.busca ?? '');
        const where = key ? sql`(c.name_key LIKE ${likePrefix(key)} OR c.tag_key = ${key})` : sql`true`;
        const [count] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM clans c WHERE ${where}`);
        const rows = await db.execute<{ name: string; tag: string; members: number; created_at: Date | string }>(sql`
          SELECT c.name, c.tag, c.created_at, (SELECT count(*)::int FROM clan_members m WHERE m.clan_id = c.id) AS members
          FROM clans c WHERE ${where}
          ORDER BY (c.tag_key = ${key}) DESC, members DESC, c.name_key
          LIMIT ${limit} OFFSET ${offset}`);
        return {
          total: count?.n ?? 0,
          clans: rows.map((r) => ({ name: r.name, tag: r.tag, members: r.members, createdAt: new Date(r.created_at).toISOString() })),
        };
      },
    );

    app.get(
      '/clans/:tag',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Página pública do clã: nome, tag, descrição, data de formação e membros com o papel',
          params: TagParams,
          response: { 200: Type.Object({ clan: ClanSchema }), 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const clan = await page(request.params.tag);
        if (!clan) return reply.code(404).send({ error: 'clan_not_found', message: 'clan not found' });
        return { clan };
      },
    );

    app.post(
      '/clans',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Cria um clã; quem cria vira o líder (só para quem não está em clã)',
          body: Type.Object({
            name: Type.String({ maxLength: MAX_CLAN_NAME }),
            tag: Type.String({ maxLength: 2 }),
            description: Type.Optional(Type.String({ maxLength: MAX_CLAN_DESCRIPTION })),
          }),
          response: { 201: Type.Object({ clan: ClanSchema }), 400: ErrorSchema, 401: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { name, tag, description = '' } = request.body;
        const done = await run(reply, async (tx) => {
          validName(name);
          validTag(tag);
          await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
          const [mine] = await tx.select({ clanId: clanMembers.clanId }).from(clanMembers).where(eq(clanMembers.userId, user.id));
          if (mine) throw new ClanError(409, 'already_in_clan');
          await free(tx, name, tag);
          const [clan] = await tx.insert(clans).values({ name, nameKey: clanKey(name), tag, tagKey: clanKey(tag), description }).returning();
          await tx.insert(clanMembers).values({ userId: user.id, clanId: clan!.id, role: 'leader' });
          return true;
        });
        if (!done) return reply;
        return reply.code(201).send({ clan: (await page(tag))! });
      },
    );

    app.patch(
      '/clans/:tag',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Edita o clã: nome e descrição (líder e admins), tag (só o líder)',
          params: TagParams,
          body: Type.Object({
            name: Type.Optional(Type.String({ maxLength: MAX_CLAN_NAME })),
            tag: Type.Optional(Type.String({ maxLength: 2 })),
            description: Type.Optional(Type.String({ maxLength: MAX_CLAN_DESCRIPTION })),
          }),
          response: { 200: Type.Object({ clan: ClanSchema }), 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { name, tag, description } = request.body;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          const role = await roleIn(tx, clan.id, user.id);
          if (role !== 'leader' && role !== 'admin') throw new ClanError(403, 'clan_forbidden');
          if (tag !== undefined && tag !== clan.tag && role !== 'leader') throw new ClanError(403, 'clan_forbidden');
          if (name !== undefined) validName(name);
          if (tag !== undefined) validTag(tag);
          await free(tx, name, tag, clan.id);
          await tx
            .update(clans)
            .set({
              ...(name !== undefined ? { name, nameKey: clanKey(name) } : {}),
              ...(tag !== undefined ? { tag, tagKey: clanKey(tag) } : {}),
              ...(description !== undefined ? { description } : {}),
              updatedAt: new Date(),
            })
            .where(eq(clans.id, clan.id));
          return tag ?? clan.tag;
        });
        if (!done) return reply;
        return { clan: (await page(done.value))! };
      },
    );

    app.delete(
      '/clans/:tag',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Dissolve o clã (só o líder); os membros ficam sem clã',
          params: TagParams,
          response: { 204: Type.Null(), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          if ((await roleIn(tx, clan.id, user.id)) !== 'leader') throw new ClanError(403, 'clan_forbidden');
          await tx.delete(clans).where(eq(clans.id, clan.id));
          return true;
        });
        if (!done) return reply;
        return reply.code(204).send(null);
      },
    );

    app.post(
      '/clans/:tag/leave',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Sai do clã; o líder passa a liderança ao admin mais antigo (senão ao membro mais antigo) e o último dissolve',
          params: TagParams,
          response: { 200: Type.Object({ result: Type.Union([Type.Literal('left'), Type.Literal('dissolved')]) }), 401: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          if (!(await roleIn(tx, clan.id, user.id))) throw new ClanError(404, 'member_not_found');
          return (await leaveClan(tx, user.id)) as 'left' | 'dissolved';
        });
        if (!done) return reply;
        return { result: done.value };
      },
    );

    app.delete(
      '/clans/:tag/members/:username',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Expulsa um membro: o líder expulsa qualquer um; admins só membros comuns',
          params: MemberParams,
          response: { 204: Type.Null(), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          const role = await roleIn(tx, clan.id, user.id);
          const target = await memberByName(tx, clan.id, request.params.username);
          const allowed = target.userId !== user.id && (role === 'leader' || (role === 'admin' && target.role === 'member'));
          if (!allowed) throw new ClanError(403, 'clan_forbidden');
          await tx.delete(clanMembers).where(eq(clanMembers.userId, target.userId));
          return true;
        });
        if (!done) return reply;
        return reply.code(204).send(null);
      },
    );

    app.put(
      '/clans/:tag/members/:username/role',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Promove a admin ou rebaixa a membro (só o líder)',
          params: MemberParams,
          body: Type.Object({ role: Type.Union([Type.Literal('admin'), Type.Literal('member')]) }),
          response: { 200: Type.Object({ clan: ClanSchema }), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          if ((await roleIn(tx, clan.id, user.id)) !== 'leader') throw new ClanError(403, 'clan_forbidden');
          const target = await memberByName(tx, clan.id, request.params.username);
          if (target.role === 'leader') throw new ClanError(403, 'clan_forbidden');
          await tx.update(clanMembers).set({ role: request.body.role }).where(eq(clanMembers.userId, target.userId));
          return clan.tag;
        });
        if (!done) return reply;
        return { clan: (await page(done.value))! };
      },
    );

    app.post(
      '/clans/:tag/transfer',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Transfere a liderança a outro membro (só o líder, que passa a admin)',
          params: TagParams,
          body: Type.Object({ username: Type.String({ minLength: 1, maxLength: 32 }) }),
          response: { 200: Type.Object({ clan: ClanSchema }), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          if ((await roleIn(tx, clan.id, user.id)) !== 'leader') throw new ClanError(403, 'clan_forbidden');
          const target = await memberByName(tx, clan.id, request.body.username);
          if (target.userId === user.id) throw new ClanError(403, 'clan_forbidden');
          await tx.update(clanMembers).set({ role: 'admin' }).where(eq(clanMembers.userId, user.id));
          await tx.update(clanMembers).set({ role: 'leader' }).where(eq(clanMembers.userId, target.userId));
          return clan.tag;
        });
        if (!done) return reply;
        return { clan: (await page(done.value))! };
      },
    );
  };
}
