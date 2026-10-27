// SPDX-License-Identifier: GPL-2.0-or-later
// Clãs (OG-270, RN-CLA-01..05, D-47): criar, editar, sair, expulsar, papéis, transferir a liderança,
// dissolver, página pública e busca. A tag de users.clan_tag (ticket, chat) vem dos gatilhos da
// migração 0016. Convites, pedidos e carência: OG-271. Estatísticas: OG-273 (src/clan-stats.ts).
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CLAN_TAG_STYLES, checkClanName, checkClanTag, clanLabel, MAX_CLAN_NAME_LENGTH as MAX_CLAN_NAME, MAX_CLAN_TAG_LENGTH, type ClanTagStyle, clanColoursProblem } from '@outgun/protocol';
import type { AppDeps, Services } from '../app.js';
import type { SessionUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { clanKey, usernameKey } from '../db/keys.js';
import { clanMembers, clanRequests, clans, playerReports, seasonChampions, seasons, users, type ClanRole } from '../db/schema.js';
import { Title, titlesWhere } from './players.js';
import { clanMembersStats, clanOpponents, clanWarTotals } from '../clan-stats.js';
import { nameBlocked } from '../name-filter.js';
import { likePrefix } from './social.js';
import { clanStaff, notify } from './notifications.js';
import { ErrorSchema } from './schemas.js';

/** Limite de membros (D-47); vale para convites e pedidos (OG-271). */
export const MAX_CLAN_MEMBERS = 30;
export const MAX_CLAN_DESCRIPTION = 500;
/** Convites e pedidos expiram em 7 dias (RN-CLA-04); carência de 7 dias depois de sair (D-47). */
export const CLAN_REQUEST_TTL_MS = 7 * 24 * 3600_000;
export const CLAN_COOLDOWN_MS = 7 * 24 * 3600_000;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const RoleSchema = Type.Union([Type.Literal('leader'), Type.Literal('admin'), Type.Literal('member')]);
/** Como a tag aparece junto do nome (OG-338). */
const TagStyleSchema = Type.Unsafe<ClanTagStyle>({ type: 'string', enum: [...CLAN_TAG_STYLES] });
const ClanSchema = Type.Object({
  name: Type.String(),
  tag: Type.String(),
  tagStyle: TagStyleSchema,
  /** A tag decorada pelo estilo, "(Dk)", "Dk." (OG-338). */
  tagLabel: Type.String(),
  description: Type.String(),
  /** Cores do clã na partida (OG-407); null = sem cores. */
  colors: Type.Union([Type.Object({ primary: Type.String(), secondary: Type.String() }), Type.Null()]),
  createdAt: Type.String(),
  members: Type.Array(Type.Object({ username: Type.String(), role: RoleSchema, joinedAt: Type.String() })),
  /** Pódios no hall da fama (OG-268). */
  titles: Type.Array(Title),
});
const WarSchema = Type.Object({
  matches: Type.Integer(),
  wins: Type.Integer(),
  losses: Type.Integer(),
  draws: Type.Integer(),
  capturesFor: Type.Integer(),
  capturesAgainst: Type.Integer(),
  series: Type.Integer(),
  seriesWon: Type.Integer(),
});
const OpponentSchema = Type.Object({ tag: Type.String(), name: Type.String(), matches: Type.Integer(), wins: Type.Integer(), losses: Type.Integer(), draws: Type.Integer() });
const MemberTotals = Type.Object({ matches: Type.Integer(), kills: Type.Integer(), captures: Type.Integer(), playSeconds: Type.Integer() });
const TagParams = Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }) });
const MemberParams = Type.Object({ tag: Type.String({ minLength: 1, maxLength: 8 }), username: Type.String({ minLength: 1, maxLength: 32 }) });

export class ClanError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

type PgError = { code?: string; constraint_name?: string };
export function uniqueError(e: unknown): ClanError | undefined {
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

export interface ClanFields {
  readonly name?: string | undefined;
  readonly tag?: string | undefined;
  readonly tagStyle?: ClanTagStyle | undefined;
  readonly description?: string | undefined;
  /** Par de cores (OG-407); null tira as cores. */
  readonly colors?: { primary: string; secondary: string } | null | undefined;
}

/**
 * Valida e grava nome, tag e descrição (criação passa `clanId` undefined): regras de nome e tag,
 * filtro de nomes proibidos (RN-CLA-08) e unicidade sem maiúsculas e acentos (D-47). Também usado
 * pela moderação (OG-275).
 */
export async function checkClanFields(tx: Tx, f: ClanFields, filter: readonly string[], clanId?: string) {
  if (f.name !== undefined && !checkClanName(f.name)) throw new ClanError(400, 'invalid_clan_name');
  if (f.tag !== undefined && !checkClanTag(f.tag)) throw new ClanError(400, 'invalid_clan_tag');
  // cores do clã (OG-407): da paleta e bem diferentes entre si, para a secundária servir de reserva
  if (f.colors) {
    const problem = clanColoursProblem(f.colors.primary, f.colors.secondary);
    if (problem) throw new ClanError(400, problem === 'too_similar' ? 'clan_colors_too_similar' : 'invalid_clan_color');
  }
  for (const text of [f.name, f.tag, f.description]) if (text !== undefined && nameBlocked(text, filter)) throw new ClanError(400, 'name_not_allowed');
  if (f.name !== undefined) {
    const [row] = await tx.select({ id: clans.id }).from(clans).where(eq(clans.nameKey, clanKey(f.name)));
    if (row && row.id !== clanId) throw new ClanError(409, 'clan_name_taken');
  }
  if (f.tag !== undefined) {
    const [row] = await tx.select({ id: clans.id }).from(clans).where(eq(clans.tagKey, clanKey(f.tag)));
    if (row && row.id !== clanId) throw new ClanError(409, 'clan_tag_taken');
  }
}

export async function updateClan(tx: Tx, clanId: string, f: ClanFields) {
  await tx
    .update(clans)
    .set({
      ...(f.name !== undefined ? { name: f.name, nameKey: clanKey(f.name) } : {}),
      ...(f.tag !== undefined ? { tag: f.tag, tagKey: clanKey(f.tag) } : {}),
      ...(f.tagStyle !== undefined ? { tagStyle: f.tagStyle } : {}),
      ...(f.description !== undefined ? { description: f.description } : {}),
      ...(f.colors !== undefined ? { primaryColor: f.colors?.primary ?? null, secondaryColor: f.colors?.secondary ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(clans.id, clanId));
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
  await startCooldown(tx, userId);
  return 'left';
}

/** Saída ou expulsão abre a carência para entrar em outro clã; dissolução não (D-47). */
async function startCooldown(tx: Tx, userId: string) {
  await tx.update(users).set({ clanCooldownUntil: new Date(Date.now() + CLAN_COOLDOWN_MS) }).where(eq(users.id, userId));
}

/**
 * Entrada no clã por convite aceito ou pedido aprovado (RN-CLA-04): o jogador não pode estar em
 * clã nem na carência, e o clã não pode estar cheio. Os outros convites e pedidos dele caem.
 */
async function admit(tx: Tx, clanId: string, userId: string, kind: 'invite' | 'request') {
  const [entry] = await tx
    .select({ expiresAt: clanRequests.expiresAt })
    .from(clanRequests)
    .where(and(eq(clanRequests.clanId, clanId), eq(clanRequests.userId, userId), eq(clanRequests.kind, kind), gt(clanRequests.expiresAt, new Date())));
  if (!entry) throw new ClanError(404, kind === 'invite' ? 'invite_not_found' : 'request_not_found');
  const [player] = await tx.select({ cooldown: users.clanCooldownUntil }).from(users).where(eq(users.id, userId)).for('update');
  if (await tx.select({ id: clanMembers.userId }).from(clanMembers).where(eq(clanMembers.userId, userId)).then((r) => r.length > 0)) {
    throw new ClanError(409, 'already_in_clan');
  }
  if (player?.cooldown && player.cooldown > new Date()) throw new ClanError(409, 'clan_cooldown');
  await checkRoom(tx, clanId);
  await tx.insert(clanMembers).values({ userId, clanId, role: 'member' });
  await tx.delete(clanRequests).where(eq(clanRequests.userId, userId));
}

async function checkRoom(tx: Tx, clanId: string) {
  const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(clanMembers).where(eq(clanMembers.clanId, clanId));
  if ((count?.n ?? 0) >= MAX_CLAN_MEMBERS) throw new ClanError(409, 'clan_full');
}

/** Apaga convites e pedidos vencidos de um jogador (antes de abrir um novo). */
async function dropExpired(tx: Tx, userId: string) {
  await tx.delete(clanRequests).where(and(eq(clanRequests.userId, userId), lte(clanRequests.expiresAt, new Date())));
}

export function clanRoutes({ database, config }: AppDeps, { sessions }: Services): FastifyPluginAsyncTypebox {
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
      tagStyle: clan.tagStyle,
      tagLabel: clanLabel(clan.tag, clan.tagStyle),
      description: clan.description,
      colors: clan.primaryColor && clan.secondaryColor ? { primary: clan.primaryColor, secondary: clan.secondaryColor } : null,
      createdAt: clan.createdAt.toISOString(),
      members: members.map((m) => ({ username: m.username, role: m.role, joinedAt: m.joinedAt.toISOString() })),
      titles: await titlesWhere(db, eq(seasonChampions.clanId, clan.id)),
    };
  }

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

    app.get(
      '/clans/:tag/stats',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Estatísticas do clã (OG-273): partidas e séries clã x clã, adversários e números dos membros pelo clã; na temporada `season` ou no geral',
          params: TagParams,
          querystring: Type.Object({ season: Type.Optional(Type.Integer({ minimum: 1 })) }),
          response: {
            200: Type.Object({
              season: Type.Union([Type.Null(), Type.Object({ id: Type.Integer(), name: Type.String() })]),
              war: WarSchema,
              opponents: Type.Array(OpponentSchema),
              totals: MemberTotals,
              members: Type.Array(Type.Intersect([Type.Object({ username: Type.String() }), MemberTotals])),
            }),
            404: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const [clan] = await db.select({ id: clans.id }).from(clans).where(eq(clans.tagKey, clanKey(request.params.tag)));
        if (!clan) return reply.code(404).send({ error: 'clan_not_found', message: 'clan not found' });
        const id = request.query.season;
        const [season] = id ? await db.select().from(seasons).where(eq(seasons.id, id)) : [];
        if (id && !season) return reply.code(404).send({ error: 'season_not_found', message: 'season not found' });
        const period = season ? { from: season.startsAt, to: season.endsAt } : {};
        const [war, opponents, members] = await Promise.all([clanWarTotals(db, clan.id, period), clanOpponents(db, clan.id, period), clanMembersStats(db, clan.id, period)]);
        return { season: season ? { id: season.id, name: season.name } : null, war, opponents, ...members };
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
            tag: Type.String({ maxLength: MAX_CLAN_TAG_LENGTH }),
            tagStyle: Type.Optional(TagStyleSchema),
            description: Type.Optional(Type.String({ maxLength: MAX_CLAN_DESCRIPTION })),
          }),
          response: { 201: Type.Object({ clan: ClanSchema }), 400: ErrorSchema, 401: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { name, tag, tagStyle = 'paren', description = '' } = request.body;
        const done = await run(reply, async (tx) => {
          await checkClanFields(tx, { name, tag, description }, config.nameFilter);
          await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
          const [mine] = await tx.select({ clanId: clanMembers.clanId }).from(clanMembers).where(eq(clanMembers.userId, user.id));
          if (mine) throw new ClanError(409, 'already_in_clan');
          const [clan] = await tx.insert(clans).values({ name, nameKey: clanKey(name), tag, tagKey: clanKey(tag), tagStyle, description }).returning();
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
          summary: 'Edita o clã: nome, descrição e cores (líder e admins), tag e estilo da tag (só o líder)',
          params: TagParams,
          body: Type.Object({
            name: Type.Optional(Type.String({ maxLength: MAX_CLAN_NAME })),
            tag: Type.Optional(Type.String({ maxLength: MAX_CLAN_TAG_LENGTH })),
            tagStyle: Type.Optional(TagStyleSchema),
            description: Type.Optional(Type.String({ maxLength: MAX_CLAN_DESCRIPTION })),
            /** Cores do clã na partida (OG-407); null tira. */
            colors: Type.Optional(Type.Union([Type.Object({ primary: Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' }), secondary: Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' }) }), Type.Null()])),
          }),
          response: { 200: Type.Object({ clan: ClanSchema }), 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const { name, tag, tagStyle, description } = request.body;
        const colors = request.body.colors && { primary: request.body.colors.primary.toUpperCase(), secondary: request.body.colors.secondary.toUpperCase() };
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          const role = await roleIn(tx, clan.id, user.id);
          if (role !== 'leader' && role !== 'admin') throw new ClanError(403, 'clan_forbidden');
          if (tag !== undefined && tag !== clan.tag && role !== 'leader') throw new ClanError(403, 'clan_forbidden');
          if (tagStyle !== undefined && tagStyle !== clan.tagStyle && role !== 'leader') throw new ClanError(403, 'clan_forbidden');
          await checkClanFields(tx, { name, tag, description, colors }, config.nameFilter, clan.id);
          await updateClan(tx, clan.id, { name, tag, tagStyle, description, colors });
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
          await startCooldown(tx, target.userId);
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
    const Pending = Type.Object({ username: Type.String(), createdAt: Type.String(), expiresAt: Type.String() });
    const ClanRef = Type.Object({ name: Type.String(), tag: Type.String(), expiresAt: Type.String() });

    /** Líder ou admin do clã travado; senão 403. */
    const requireStaff = async (tx: Tx, tag: string, userId: string) => {
      const clan = await lockClan(tx, tag);
      const role = await roleIn(tx, clan.id, userId);
      if (role !== 'leader' && role !== 'admin') throw new ClanError(403, 'clan_forbidden');
      return clan;
    };

    app.get(
      '/clans/inbox',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Convites recebidos, o pedido aberto do jogador e, para líder/admin, os pedidos ao clã (contador do menu)',
          response: {
            200: Type.Object({ invites: Type.Array(ClanRef), request: Type.Union([ClanRef, Type.Null()]), clanRequests: Type.Integer(), cooldownUntil: Type.Union([Type.String(), Type.Null()]) }),
            401: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const now = new Date();
        const rows = await db
          .select({ name: clans.name, tag: clans.tag, kind: clanRequests.kind, expiresAt: clanRequests.expiresAt })
          .from(clanRequests)
          .innerJoin(clans, eq(clans.id, clanRequests.clanId))
          .where(and(eq(clanRequests.userId, user.id), gt(clanRequests.expiresAt, now)))
          .orderBy(asc(clanRequests.createdAt));
        const ref = (r: (typeof rows)[number]) => ({ name: r.name, tag: r.tag, expiresAt: r.expiresAt.toISOString() });
        const [staff] = await db.execute<{ n: number }>(sql`
          SELECT count(*)::int AS n FROM clan_requests r JOIN clan_members m ON m.clan_id = r.clan_id
          WHERE m.user_id = ${user.id} AND m.role IN ('leader', 'admin') AND r.kind = 'request' AND r.expires_at > now()`);
        const [me] = await db.select({ cooldown: users.clanCooldownUntil }).from(users).where(eq(users.id, user.id));
        const request_ = rows.find((r) => r.kind === 'request');
        return {
          invites: rows.filter((r) => r.kind === 'invite').map(ref),
          request: request_ ? ref(request_) : null,
          clanRequests: staff?.n ?? 0,
          cooldownUntil: me?.cooldown && me.cooldown > now ? me.cooldown.toISOString() : null,
        };
      },
    );

    app.get(
      '/clans/:tag/pending',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Convites enviados e pedidos recebidos ainda válidos (líder e admins)',
          params: TagParams,
          response: { 200: Type.Object({ invites: Type.Array(Pending), requests: Type.Array(Pending) }), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await requireStaff(tx, request.params.tag, user.id);
          return tx
            .select({ username: users.username, kind: clanRequests.kind, createdAt: clanRequests.createdAt, expiresAt: clanRequests.expiresAt })
            .from(clanRequests)
            .innerJoin(users, eq(users.id, clanRequests.userId))
            .where(and(eq(clanRequests.clanId, clan.id), gt(clanRequests.expiresAt, new Date())))
            .orderBy(asc(clanRequests.createdAt));
        });
        if (!done) return reply;
        const out = (kind: 'invite' | 'request') =>
          done.value.filter((r) => r.kind === kind).map((r) => ({ username: r.username, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() }));
        return { invites: out('invite'), requests: out('request') };
      },
    );

    app.post(
      '/clans/:tag/invites',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Convida uma conta (líder e admins); vale 7 dias',
          params: TagParams,
          body: Type.Object({ username: Type.String({ minLength: 1, maxLength: 32 }) }),
          response: { 204: Type.Null(), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await requireStaff(tx, request.params.tag, user.id);
          const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.usernameKey, usernameKey(request.body.username)));
          if (!target) throw new ClanError(404, 'player_not_found');
          if (await roleIn(tx, clan.id, target.id)) throw new ClanError(409, 'already_member');
          await checkRoom(tx, clan.id);
          await dropExpired(tx, target.id);
          const [open] = await tx.select({ kind: clanRequests.kind }).from(clanRequests).where(and(eq(clanRequests.clanId, clan.id), eq(clanRequests.userId, target.id)));
          if (open?.kind === 'request') throw new ClanError(409, 'request_pending'); // basta aprovar o pedido
          const expiresAt = new Date(Date.now() + CLAN_REQUEST_TTL_MS);
          await tx
            .insert(clanRequests)
            .values({ clanId: clan.id, userId: target.id, kind: 'invite', invitedBy: user.id, expiresAt })
            .onConflictDoUpdate({ target: [clanRequests.clanId, clanRequests.userId], set: { invitedBy: user.id, createdAt: new Date(), expiresAt } });
          // aviso no topo do site para o convidado (OG-361)
          await notify(tx, [target.id], 'clan_invite', { clanTag: clan.tag, clanName: clan.name, from: user.username });
          return true;
        });
        if (!done) return reply;
        return reply.code(204).send(null);
      },
    );

    for (const answer of ['accept', 'decline'] as const) {
      app.post(
        `/clans/:tag/invites/${answer}`,
        {
          schema: {
            tags: ['clãs'],
            summary: answer === 'accept' ? 'Aceita o convite (sem clã e fora da carência; o clã não pode estar cheio)' : 'Recusa o convite',
            params: TagParams,
            response: { 204: Type.Null(), 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
          },
        },
        async (request, reply) => {
          const user = await requireUser(request, reply);
          if (!user) return reply;
          const done = await run(reply, async (tx) => {
            const clan = await lockClan(tx, request.params.tag);
            if (answer === 'accept') return admit(tx, clan.id, user.id, 'invite');
            const gone = await tx
              .delete(clanRequests)
              .where(and(eq(clanRequests.clanId, clan.id), eq(clanRequests.userId, user.id), eq(clanRequests.kind, 'invite')))
              .returning();
            if (gone.length === 0) throw new ClanError(404, 'invite_not_found');
          });
          if (!done) return reply;
          return reply.code(204).send(null);
        },
      );
    }

    app.post(
      '/clans/:tag/requests',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Pede para entrar no clã (um pedido aberto por vez; vale 7 dias)',
          params: TagParams,
          response: { 204: Type.Null(), 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          const [me] = await tx.select({ cooldown: users.clanCooldownUntil }).from(users).where(eq(users.id, user.id)).for('update');
          if ((await tx.select().from(clanMembers).where(eq(clanMembers.userId, user.id))).length > 0) throw new ClanError(409, 'already_in_clan');
          if (me?.cooldown && me.cooldown > new Date()) throw new ClanError(409, 'clan_cooldown');
          await dropExpired(tx, user.id);
          const mine = await tx.select({ clanId: clanRequests.clanId, kind: clanRequests.kind }).from(clanRequests).where(eq(clanRequests.userId, user.id));
          if (mine.some((r) => r.kind === 'request')) throw new ClanError(409, 'request_open');
          if (mine.some((r) => r.clanId === clan.id)) throw new ClanError(409, 'invite_pending'); // basta aceitar o convite
          await tx.insert(clanRequests).values({ clanId: clan.id, userId: user.id, kind: 'request', expiresAt: new Date(Date.now() + CLAN_REQUEST_TTL_MS) });
          // aviso para quem responde aos pedidos: líder e admins (OG-361)
          await notify(tx, await clanStaff(tx, clan.id), 'clan_request', { clanTag: clan.tag, clanName: clan.name, from: user.username });
          return true;
        });
        if (!done) return reply;
        return reply.code(204).send(null);
      },
    );

    app.delete(
      '/clans/:tag/requests',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Retira o próprio pedido de entrada',
          params: TagParams,
          response: { 204: Type.Null(), 401: ErrorSchema, 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          const gone = await tx
            .delete(clanRequests)
            .where(and(eq(clanRequests.clanId, clan.id), eq(clanRequests.userId, user.id), eq(clanRequests.kind, 'request')))
            .returning();
          if (gone.length === 0) throw new ClanError(404, 'request_not_found');
        });
        if (!done) return reply;
        return reply.code(204).send(null);
      },
    );

    for (const answer of ['approve', 'decline'] as const) {
      app.post(
        `/clans/:tag/requests/:username/${answer}`,
        {
          schema: {
            tags: ['clãs'],
            summary: answer === 'approve' ? 'Aprova o pedido (líder e admins; o clã não pode estar cheio)' : 'Recusa o pedido (líder e admins)',
            params: MemberParams,
            response: { 204: Type.Null(), 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
          },
        },
        async (request, reply) => {
          const user = await requireUser(request, reply);
          if (!user) return reply;
          const done = await run(reply, async (tx) => {
            const clan = await requireStaff(tx, request.params.tag, user.id);
            const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.usernameKey, usernameKey(request.params.username)));
            if (!target) throw new ClanError(404, 'request_not_found');
            if (answer === 'approve') return admit(tx, clan.id, target.id, 'request');
            const gone = await tx
              .delete(clanRequests)
              .where(and(eq(clanRequests.clanId, clan.id), eq(clanRequests.userId, target.id), eq(clanRequests.kind, 'request')))
              .returning();
            if (gone.length === 0) throw new ClanError(404, 'request_not_found');
          });
          if (!done) return reply;
          return reply.code(204).send(null);
        },
      );
    }
    app.post(
      '/clans/:tag/report',
      {
        schema: {
          tags: ['clãs'],
          summary: 'Denuncia o clã (nome, tag ou descrição); vai para as denúncias do painel (OG-275)',
          params: TagParams,
          body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 200 }) }),
          response: { 204: Type.Null(), 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const done = await run(reply, async (tx) => {
          const clan = await lockClan(tx, request.params.tag);
          const open = await tx
            .select({ id: playerReports.id })
            .from(playerReports)
            .where(and(eq(playerReports.clanId, clan.id), eq(playerReports.reporterUserId, user.id), eq(playerReports.status, 'open')));
          if (open.length > 0) throw new ClanError(409, 'already_reported');
          await tx.insert(playerReports).values({
            serverId: 'web',
            reporterUserId: user.id,
            reporterName: user.username,
            targetName: `(${clan.tag}) ${clan.name}`,
            clanId: clan.id,
            reason: request.body.reason.trim(),
          });
          return true;
        });
        if (!done) return reply;
        return reply.code(204).send(null);
      },
    );
  };
}
