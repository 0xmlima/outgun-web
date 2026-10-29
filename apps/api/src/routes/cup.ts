// SPDX-License-Identifier: GPL-2.0-or-later
// OutCup (OG-520..528, D-88, RN-CUP): página da edição e arquivo, inscrição, horários disponíveis,
// proposta e aceite do horário do confronto, e as ferramentas do admin (abrir, cancelar, datas,
// remarcar, dar resultado, trocar jogador, desfazer W.O.), com auditoria.
import { Type, type FastifyPluginAsyncTypebox, type Static } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps, Services } from '../app.js';
import type { SessionUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { usernameKey } from '../db/keys.js';
import { adminActions, cupAvailability, cupDuos, cupEntries, cupMatches, cups, matches, rankedSeries, rooms, users } from '../db/schema.js';
import { createCup, CUP_PROPOSE_LEAD_MS, CupOutbox, deliver, duoName, platformBanned, resolveMatch } from '../cup.js';
import { liveBus } from '../live.js';
import { hasRole } from './admin.js';
import { ErrorSchema } from './schemas.js';

type CupRow = typeof cups.$inferSelect;
type MatchRow = typeof cupMatches.$inferSelect;
type DuoRow = typeof cupDuos.$inferSelect;

const Edition = Type.String({ pattern: '^\\d{4}-\\d{2}$' });
const Iso = Type.String({ format: 'date-time' });
const Nullable = <T extends Parameters<typeof Type.Union>[0][number]>(t: T) => Type.Union([t, Type.Null()]);

const Game = Type.Object({ id: Type.String(), gameNo: Nullable(Type.Integer()), redScore: Type.Integer(), blueScore: Type.Integer(), map: Type.String() });
const MatchView = Type.Object({
  id: Type.String(),
  round: Type.Integer(),
  slot: Type.Integer(),
  duoA: Nullable(Type.String()),
  duoB: Nullable(Type.String()),
  bestOf: Type.Integer(),
  windowStart: Iso,
  windowEnd: Iso,
  status: Type.String(),
  scheduledAt: Nullable(Iso),
  proposedAt: Nullable(Iso),
  proposedBy: Nullable(Type.String()),
  winner: Nullable(Type.String()),
  scoreA: Nullable(Type.Integer()),
  scoreB: Nullable(Type.Integer()),
  resolution: Nullable(Type.String()),
  roomId: Nullable(Type.String()),
  /** Jogos da série (relatório e replay de cada um). */
  games: Type.Array(Game),
});
const DuoView = Type.Object({ id: Type.String(), players: Type.Array(Type.String()), seed: Type.Integer(), rating: Type.Integer() });
const CupView = Type.Object({
  edition: Type.String(),
  status: Type.String(),
  registrationOpensAt: Iso,
  drawAt: Iso,
  startsAt: Iso,
  endsAt: Iso,
  rounds: Nullable(Type.Integer()),
  cancelReason: Nullable(Type.String()),
  entrants: Type.Array(Type.String()),
  leftOut: Nullable(Type.String()),
  duos: Type.Array(DuoView),
  matches: Type.Array(MatchView),
  champion: Nullable(Type.String()),
  runnerUp: Nullable(Type.String()),
  /** Situação de quem está vendo (null sem conta). */
  me: Nullable(Type.Object({ entered: Type.Boolean(), duoId: Nullable(Type.String()) })),
});
const CupSummary = Type.Object({ edition: Type.String(), status: Type.String(), duos: Type.Integer(), entrants: Type.Integer(), champion: Nullable(Type.Array(Type.String())), runnerUp: Nullable(Type.Array(Type.String())) });
const Availability = Type.Object({ name: Type.String(), duo: Type.Union([Type.Literal('a'), Type.Literal('b')]), me: Type.Boolean(), hours: Type.Array(Iso) });
const MatchDetail = Type.Object({
  match: MatchView,
  duoA: Nullable(DuoView),
  duoB: Nullable(DuoView),
  /** Horários de cada jogador: só os 4 do confronto (e o admin) veem. */
  availability: Nullable(Type.Array(Availability)),
  /** Horas em que os 4 podem (dá para propor). */
  common: Type.Array(Iso),
  myDuo: Nullable(Type.Union([Type.Literal('a'), Type.Literal('b')])),
});

const duoView = (d: DuoRow) => ({ id: d.id, players: [d.player1Name, d.player2Name], seed: d.seed, rating: d.rating });
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const HOUR = 3600_000;
/** Até quantas horas um jogador marca num confronto (a janela mais longa tem 31 dias). */
const MAX_HOURS = 31 * 24;

export function cupRoutes({ database, config }: AppDeps, { sessions, mailer }: Services): FastifyPluginAsyncTypebox {
  const { db } = database;

  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
    const user = await sessions.current(request);
    if (!user) await reply.code(401).send({ error: 'unauthenticated', message: 'not signed in' });
    return user;
  }
  async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
    const user = await requireUser(request, reply);
    if (user && !hasRole(user, 'admin')) {
      await reply.code(403).send({ error: 'forbidden', message: 'admin only' });
      return undefined;
    }
    return user;
  }
  const audit = (actor: SessionUser, action: string, reason: string, details: Record<string, unknown>) =>
    db.insert(adminActions).values({ actorUserId: actor.id, actorName: actor.username, action, reason, details: { via: 'painel', ...details } });
  /** Roda uma operação com avisos: e-mails depois do commit e a página da copa relida ao vivo. */
  async function withOutbox<T>(run: (outbox: CupOutbox) => Promise<T>): Promise<T> {
    const outbox = new CupOutbox();
    const result = await run(outbox);
    liveBus.publish('cup');
    void deliver(db, mailer, config.webUrl, outbox);
    return result;
  }

  async function view(cup: CupRow, user: SessionUser | undefined): Promise<Static<typeof CupView>> {
    const entries = await db
      .select({ userId: cupEntries.userId, name: users.username, leftOut: cupEntries.leftOut })
      .from(cupEntries)
      .innerJoin(users, eq(users.id, cupEntries.userId))
      .where(eq(cupEntries.cupId, cup.id))
      .orderBy(asc(cupEntries.createdAt));
    const duos = await db.select().from(cupDuos).where(eq(cupDuos.cupId, cup.id)).orderBy(asc(cupDuos.seed));
    const list = await db.select().from(cupMatches).where(eq(cupMatches.cupId, cup.id)).orderBy(asc(cupMatches.round), asc(cupMatches.slot));
    const games = await gamesOf(list);
    const mine = user ? duos.find((d) => d.player1Id === user.id || d.player2Id === user.id) : undefined;
    return {
      edition: cup.edition,
      status: cup.status,
      registrationOpensAt: cup.registrationOpensAt.toISOString(),
      drawAt: cup.drawAt.toISOString(),
      startsAt: cup.startsAt.toISOString(),
      endsAt: cup.endsAt.toISOString(),
      rounds: cup.rounds,
      cancelReason: cup.cancelReason,
      entrants: entries.map((e) => e.name),
      leftOut: entries.find((e) => e.leftOut)?.name ?? null,
      duos: duos.map(duoView),
      matches: list.map((m) => matchView(m, games.get(m.id) ?? [])),
      champion: cup.championDuoId,
      runnerUp: cup.runnerUpDuoId,
      me: user ? { entered: entries.some((e) => e.userId === user.id), duoId: mine?.id ?? null } : null,
    };
  }

  async function gamesOf(list: readonly MatchRow[]): Promise<Map<string, (Static<typeof Game>)[]>> {
    const bySeries = new Map(list.flatMap((m) => (m.seriesId ? [[m.seriesId, m.id] as const] : [])));
    const byRoom = new Map(list.flatMap((m) => (m.roomId && !m.seriesId ? [[m.roomId, m.id] as const] : [])));
    // série ainda em andamento: os jogos já gravados vêm pela sala do confronto
    const live = byRoom.size > 0 ? await db.select({ id: rankedSeries.id, roomId: rankedSeries.roomId }).from(rankedSeries).where(inArray(rankedSeries.roomId, [...byRoom.keys()])) : [];
    for (const s of live) if (s.roomId) bySeries.set(s.id, byRoom.get(s.roomId)!);
    const out = new Map<string, (Static<typeof Game>)[]>();
    if (bySeries.size === 0) return out;
    const rows = await db
      .select({ id: matches.id, seriesId: matches.seriesId, gameNo: matches.gameNo, redScore: matches.redScore, blueScore: matches.blueScore, map: matches.map })
      .from(matches)
      .where(inArray(matches.seriesId, [...bySeries.keys()]))
      .orderBy(asc(matches.gameNo));
    for (const r of rows) {
      const id = bySeries.get(r.seriesId!)!;
      out.set(id, [...(out.get(id) ?? []), { id: r.id, gameNo: r.gameNo, redScore: r.redScore, blueScore: r.blueScore, map: r.map }]);
    }
    return out;
  }

  const matchView = (m: MatchRow, games: (Static<typeof Game>)[]): Static<typeof MatchView> => ({
    id: m.id,
    round: m.round,
    slot: m.slot,
    duoA: m.duoA,
    duoB: m.duoB,
    bestOf: m.bestOf,
    windowStart: m.windowStart.toISOString(),
    windowEnd: m.windowEnd.toISOString(),
    status: m.status,
    scheduledAt: iso(m.scheduledAt),
    proposedAt: iso(m.proposedAt),
    proposedBy: m.proposedBy,
    winner: m.winnerDuo,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    resolution: m.resolution,
    roomId: m.roomId,
    games,
  });

  /** Edição em foco: a que está sendo disputada, senão a das inscrições, senão a mais recente. */
  async function currentCup(): Promise<CupRow | undefined> {
    const rows = await db.select().from(cups).orderBy(desc(cups.edition)).limit(6);
    return rows.find((c) => c.status === 'running') ?? rows.find((c) => c.status === 'registration') ?? rows[0];
  }

  /** Confronto, as duas duplas e de que lado a conta está. */
  async function loadMatch(id: string, user?: SessionUser) {
    const [m] = await db.select().from(cupMatches).where(eq(cupMatches.id, id));
    if (!m) return undefined;
    const [cup] = await db.select().from(cups).where(eq(cups.id, m.cupId));
    const duos = await db.select().from(cupDuos).where(inArray(cupDuos.id, [m.duoA, m.duoB].filter((x): x is string => !!x)));
    const a = duos.find((d) => d.id === m.duoA);
    const b = duos.find((d) => d.id === m.duoB);
    const inDuo = (d: DuoRow | undefined) => !!user && !!d && (d.player1Id === user.id || d.player2Id === user.id);
    const side: 'a' | 'b' | null = inDuo(a) ? 'a' : inDuo(b) ? 'b' : null;
    return { m, cup: cup!, a, b, side };
  }

  return async (app) => {
    app.get(
      '/cups',
      { schema: { tags: ['outcup'], summary: 'Edições da OutCup (arquivo), da mais recente para a mais antiga', response: { 200: Type.Object({ cups: Type.Array(CupSummary) }) } } },
      async () => {
        const rows = await db.select().from(cups).orderBy(desc(cups.edition)).limit(60);
        const duos = rows.length ? await db.select().from(cupDuos).where(inArray(cupDuos.cupId, rows.map((c) => c.id))) : [];
        const entries = rows.length ? await db.select({ cupId: cupEntries.cupId }).from(cupEntries).where(inArray(cupEntries.cupId, rows.map((c) => c.id))) : [];
        const names = (id: string | null) => {
          const d = id ? duos.find((x) => x.id === id) : undefined;
          return d ? [d.player1Name, d.player2Name] : null;
        };
        return {
          cups: rows.map((c) => ({
            edition: c.edition,
            status: c.status,
            duos: duos.filter((d) => d.cupId === c.id).length,
            entrants: entries.filter((e) => e.cupId === c.id).length,
            champion: names(c.championDuoId),
            runnerUp: names(c.runnerUpDuoId),
          })),
        };
      },
    );

    app.get(
      '/cups/current',
      { schema: { tags: ['outcup'], summary: 'Edição em foco: a em disputa, senão a das inscrições, senão a última', response: { 200: Nullable(CupView) } } },
      async (request) => {
        const cup = await currentCup();
        return cup ? view(cup, await sessions.current(request)) : null;
      },
    );

    app.get(
      '/cups/:edition',
      { schema: { tags: ['outcup'], summary: 'Uma edição da OutCup: inscritos, duplas, chave e jogos', params: Type.Object({ edition: Edition }), response: { 200: CupView, 404: ErrorSchema } } },
      async (request, reply) => {
        const [cup] = await db.select().from(cups).where(eq(cups.edition, request.params.edition));
        if (!cup) return reply.code(404).send({ error: 'cup_not_found', message: 'no such edition' });
        return view(cup, await sessions.current(request));
      },
    );

    // inscrição individual (RN-CUP-04)
    const entryWindow = (cup: CupRow, now = new Date()) => cup.status === 'registration' && now >= cup.registrationOpensAt && now < cup.drawAt;
    app.post(
      '/cups/:edition/entry',
      { schema: { tags: ['outcup'], summary: 'Inscrever-me na edição (até o sorteio)', params: Type.Object({ edition: Edition }), response: { 200: CupView, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema } } },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const [cup] = await db.select().from(cups).where(eq(cups.edition, request.params.edition));
        if (!cup) return reply.code(404).send({ error: 'cup_not_found', message: 'no such edition' });
        if (!entryWindow(cup)) return reply.code(409).send({ error: 'registration_closed', message: 'sign-ups are closed' });
        if (await platformBanned(db, user.id)) return reply.code(403).send({ error: 'banned', message: 'banned accounts cannot sign up' });
        await db.insert(cupEntries).values({ cupId: cup.id, userId: user.id }).onConflictDoNothing();
        liveBus.publish('cup');
        return view(cup, user);
      },
    );
    app.delete(
      '/cups/:edition/entry',
      { schema: { tags: ['outcup'], summary: 'Sair da edição (até o sorteio)', params: Type.Object({ edition: Edition }), response: { 200: CupView, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema } } },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const [cup] = await db.select().from(cups).where(eq(cups.edition, request.params.edition));
        if (!cup) return reply.code(404).send({ error: 'cup_not_found', message: 'no such edition' });
        if (!entryWindow(cup)) return reply.code(409).send({ error: 'registration_closed', message: 'sign-ups are closed' });
        await db.delete(cupEntries).where(and(eq(cupEntries.cupId, cup.id), eq(cupEntries.userId, user.id)));
        liveBus.publish('cup');
        return view(cup, user);
      },
    );

    app.get(
      '/cups/matches/:id',
      { schema: { tags: ['outcup'], summary: 'Um confronto: duplas, jogos e (para os 4 jogadores) os horários marcados', params: Type.Object({ id: Type.String({ format: 'uuid' }) }), response: { 200: MatchDetail, 404: ErrorSchema } } },
      async (request, reply) => {
        const user = await sessions.current(request);
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        return detail(found, user);
      },
    );

    async function detail(found: NonNullable<Awaited<ReturnType<typeof loadMatch>>>, user: SessionUser | undefined): Promise<Static<typeof MatchDetail>> {
      const { m, a, b, side } = found;
      const games = (await gamesOf([m])).get(m.id) ?? [];
      const marks = await db.select().from(cupAvailability).where(eq(cupAvailability.matchId, m.id));
      const people = [
        ...(a ? [[a.player1Id, a.player1Name, 'a'] as const, [a.player2Id, a.player2Name, 'a'] as const] : []),
        ...(b ? [[b.player1Id, b.player1Name, 'b'] as const, [b.player2Id, b.player2Name, 'b'] as const] : []),
      ];
      const hoursOf = (id: string | null) => (id ? (marks.find((x) => x.userId === id)?.hours ?? []) : []);
      const sets = people.map(([id]) => new Set(hoursOf(id).map((h) => h.getTime())));
      const common = people.length === 4 ? [...sets[0]!].filter((t) => sets.every((s) => s.has(t)) && t >= Date.now()).sort((x, y) => x - y) : [];
      const canSee = side !== null || (!!user && hasRole(user, 'admin'));
      return {
        match: matchView(m, games),
        duoA: a ? duoView(a) : null,
        duoB: b ? duoView(b) : null,
        availability: canSee ? people.map(([id, name, duo]) => ({ name, duo, me: !!user && id === user.id, hours: hoursOf(id).map((h) => h.toISOString()) })) : null,
        common: common.map((t) => new Date(t).toISOString()),
        myDuo: side,
      };
    }

    // horários disponíveis (RN-CUP-08)
    app.put(
      '/cups/matches/:id/availability',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Horas em que eu posso jogar este confronto (começo de cada hora, dentro da janela da fase)',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          body: Type.Object({ hours: Type.Array(Iso, { maxItems: MAX_HOURS }) }),
          response: { 200: MatchDetail, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        if (!found.side) return reply.code(403).send({ error: 'not_in_match', message: 'only the players of this match' });
        if (!['open', 'scheduled', 'pending'].includes(found.m.status)) return reply.code(409).send({ error: 'match_closed', message: 'this match is not open for scheduling' });
        const now = Date.now();
        const hours = [...new Set(request.body.hours.map((h) => new Date(h).getTime()))].sort((x, y) => x - y);
        const bad = hours.find((t) => t % HOUR !== 0 || t < found.m.windowStart.getTime() || t >= found.m.windowEnd.getTime());
        if (bad !== undefined) return reply.code(422).send({ error: 'invalid_hour', message: 'hours must start on the hour and fall inside the round window' });
        // horas que já passaram ficam como estavam (não somem do histórico do W.O.)
        const [prev] = await db.select().from(cupAvailability).where(and(eq(cupAvailability.matchId, found.m.id), eq(cupAvailability.userId, user.id)));
        const past = (prev?.hours ?? []).map((h) => h.getTime()).filter((t) => t < now);
        const all = [...new Set([...past, ...hours.filter((t) => t >= now)])].sort((x, y) => x - y).map((t) => new Date(t));
        await db
          .insert(cupAvailability)
          .values({ matchId: found.m.id, userId: user.id, hours: all })
          .onConflictDoUpdate({ target: [cupAvailability.matchId, cupAvailability.userId], set: { hours: all, updatedAt: new Date() } });
        liveBus.publish('cup');
        return detail((await loadMatch(found.m.id, user))!, user);
      },
    );

    app.post(
      '/cups/matches/:id/propose',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Propor o horário do confronto: uma hora em que os 4 marcaram que podem; a outra dupla aceita',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          body: Type.Object({ at: Iso }),
          response: { 200: MatchDetail, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        const { m, cup, a, b, side } = found;
        if (!side || !a || !b) return reply.code(403).send({ error: 'not_in_match', message: 'only the players of this match' });
        if (m.status !== 'open' && m.status !== 'scheduled') return reply.code(409).send({ error: 'match_closed', message: 'this match cannot be scheduled now' });
        const at = new Date(request.body.at);
        if (at.getTime() % HOUR !== 0 || at < m.windowStart || at >= m.windowEnd || at.getTime() < Date.now() + CUP_PROPOSE_LEAD_MS) {
          return reply.code(422).send({ error: 'invalid_time', message: 'pick a whole hour inside the round window, at least 30 minutes ahead' });
        }
        const marks = await db.select().from(cupAvailability).where(eq(cupAvailability.matchId, m.id));
        const everyone = [a.player1Id, a.player2Id, b.player1Id, b.player2Id];
        const free = everyone.every((id) => id && marks.some((x) => x.userId === id && x.hours.some((h) => h.getTime() === at.getTime())));
        if (!free) return reply.code(422).send({ error: 'not_available', message: 'all four players must have marked this hour' });
        const mine = side === 'a' ? a : b;
        const other = side === 'a' ? b : a;
        await withOutbox(async (outbox) => {
          await db.transaction(async (tx) => {
            await tx.update(cupMatches).set({ proposedAt: at, proposedBy: mine.id, updatedAt: new Date() }).where(eq(cupMatches.id, m.id));
            await outbox.add(tx, [other.player1Id, other.player2Id], { cup: cup.edition, cupEvent: 'proposed', opponent: duoName(mine), matchId: m.id, at: at.toISOString() });
          });
        });
        return detail((await loadMatch(m.id, user))!, user);
      },
    );

    app.post(
      '/cups/matches/:id/answer',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Aceitar ou recusar o horário proposto pela outra dupla',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          body: Type.Object({ accept: Type.Boolean() }),
          response: { 200: MatchDetail, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        const { m, cup, a, b, side } = found;
        if (!side || !a || !b) return reply.code(403).send({ error: 'not_in_match', message: 'only the players of this match' });
        const mine = side === 'a' ? a : b;
        const other = side === 'a' ? b : a;
        if (!m.proposedAt || m.proposedBy !== other.id || m.proposedAt.getTime() <= Date.now()) return reply.code(409).send({ error: 'no_proposal', message: 'there is no proposal from the other pair' });
        if (m.status !== 'open' && m.status !== 'scheduled') return reply.code(409).send({ error: 'match_closed', message: 'this match cannot be scheduled now' });
        const at = m.proposedAt;
        await withOutbox(async (outbox) => {
          await db.transaction(async (tx) => {
            if (request.body.accept) {
              await tx.update(cupMatches).set({ status: 'scheduled', scheduledAt: at, proposedAt: null, proposedBy: null, updatedAt: new Date() }).where(eq(cupMatches.id, m.id));
              await outbox.add(tx, [mine.player1Id, mine.player2Id], { cup: cup.edition, cupEvent: 'scheduled', opponent: duoName(other), matchId: m.id, at: at.toISOString() });
              await outbox.add(tx, [other.player1Id, other.player2Id], { cup: cup.edition, cupEvent: 'scheduled', opponent: duoName(mine), matchId: m.id, at: at.toISOString() });
            } else {
              await tx.update(cupMatches).set({ proposedAt: null, proposedBy: null, updatedAt: new Date() }).where(eq(cupMatches.id, m.id));
              await outbox.add(tx, [other.player1Id, other.player2Id], { cup: cup.edition, cupEvent: 'declined', opponent: duoName(mine), matchId: m.id });
            }
          });
        });
        return detail((await loadMatch(m.id, user))!, user);
      },
    );

    app.get(
      '/players/:name/cup-titles',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Títulos da OutCup de um jogador (campeão e vice), do mais recente para o mais antigo',
          params: Type.Object({ name: Type.String({ minLength: 1, maxLength: 40 }) }),
          response: { 200: Type.Object({ titles: Type.Array(Type.Object({ edition: Type.String(), position: Type.Integer() })) }), 404: ErrorSchema },
        },
      },
      async (request, reply) => {
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.usernameKey, usernameKey(request.params.name)));
        if (!user) return reply.code(404).send({ error: 'player_not_found', message: 'no such player' });
        return { titles: await cupTitles(db, user.id) };
      },
    );

    // ---------------------------------------------------------------- admin (RN-CUP-11)
    const Reason = Type.String({ minLength: 1, maxLength: 500 });

    app.post(
      '/admin/cups',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Abrir uma edição fora de época (inscrições já abertas)',
          body: Type.Object({ edition: Edition, reason: Reason }),
          response: { 201: CupView, 401: ErrorSchema, 403: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const row = await createCup(db, request.body.edition, new Date());
        if (!row) return reply.code(409).send({ error: 'cup_exists', message: 'this edition already exists' });
        await audit(user, 'cup_open', request.body.reason, { edition: row.edition });
        liveBus.publish('cup');
        return reply.code(201).send(await view(row, user));
      },
    );

    app.put(
      '/admin/cups/:edition',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Editar as datas de uma edição ainda nas inscrições',
          params: Type.Object({ edition: Edition }),
          body: Type.Object({ registrationOpensAt: Type.Optional(Iso), drawAt: Type.Optional(Iso), startsAt: Type.Optional(Iso), endsAt: Type.Optional(Iso), reason: Reason }),
          response: { 200: CupView, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const [cup] = await db.select().from(cups).where(eq(cups.edition, request.params.edition));
        if (!cup) return reply.code(404).send({ error: 'cup_not_found', message: 'no such edition' });
        if (cup.status !== 'registration') return reply.code(409).send({ error: 'cup_started', message: 'dates change only before the draw' });
        const b = request.body;
        const next = {
          registrationOpensAt: b.registrationOpensAt ? new Date(b.registrationOpensAt) : cup.registrationOpensAt,
          drawAt: b.drawAt ? new Date(b.drawAt) : cup.drawAt,
          startsAt: b.startsAt ? new Date(b.startsAt) : cup.startsAt,
          endsAt: b.endsAt ? new Date(b.endsAt) : cup.endsAt,
        };
        if (!(next.registrationOpensAt < next.drawAt && next.drawAt <= next.startsAt && next.startsAt < next.endsAt)) {
          return reply.code(422).send({ error: 'invalid_dates', message: 'sign-ups open < draw <= start < end' });
        }
        const [row] = await db.update(cups).set(next).where(eq(cups.id, cup.id)).returning();
        await audit(user, 'cup_dates', b.reason, { edition: cup.edition, before: { drawAt: cup.drawAt, startsAt: cup.startsAt, endsAt: cup.endsAt }, after: next });
        liveBus.publish('cup');
        return view(row!, user);
      },
    );

    app.post(
      '/admin/cups/:edition/cancel',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Cancelar uma edição (inscrições ou em disputa); os inscritos são avisados',
          params: Type.Object({ edition: Edition }),
          body: Type.Object({ reason: Reason }),
          response: { 200: CupView, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const [cup] = await db.select().from(cups).where(eq(cups.edition, request.params.edition));
        if (!cup) return reply.code(404).send({ error: 'cup_not_found', message: 'no such edition' });
        if (cup.status === 'finished' || cup.status === 'cancelled') return reply.code(409).send({ error: 'cup_closed', message: 'this edition is already over' });
        await withOutbox((outbox) =>
          db.transaction(async (tx) => {
            await tx.update(cups).set({ status: 'cancelled', cancelReason: request.body.reason }).where(eq(cups.id, cup.id));
            const ids = (await tx.select({ id: cupEntries.userId }).from(cupEntries).where(eq(cupEntries.cupId, cup.id))).map((r) => r.id);
            await outbox.add(tx, ids, { cup: cup.edition, cupEvent: 'cancelled' });
          }),
        );
        await audit(user, 'cup_cancel', request.body.reason, { edition: cup.edition });
        const [row] = await db.select().from(cups).where(eq(cups.id, cup.id));
        return view(row!, user);
      },
    );

    const MatchParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
    const adminMatchErrors = { 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema };

    app.post(
      '/admin/cups/matches/:id/result',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Dar o resultado de um confronto (vencedor a ou b; nenhum = as duas fora)',
          params: MatchParams,
          body: Type.Object({ winner: Type.Union([Type.Literal('a'), Type.Literal('b'), Type.Null()]), reason: Reason }),
          response: { 200: MatchDetail, ...adminMatchErrors },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        const { m, cup } = found;
        if (!m.duoA || !m.duoB || ['done', 'walkover', 'double_walkover', 'bye', 'pending'].includes(m.status)) return reply.code(409).send({ error: 'match_closed', message: 'this match has no result to give' });
        const w = request.body.winner;
        await withOutbox((outbox) =>
          db.transaction((tx) => resolveMatch(tx, cup, m, w === null ? { winner: null, resolution: 'double_walkover' } : { winner: w === 'a' ? m.duoA : m.duoB, resolution: 'admin' }, outbox)),
        );
        await audit(user, 'cup_result', request.body.reason, { edition: cup.edition, match: m.id, winner: w });
        return detail((await loadMatch(m.id, user))!, user);
      },
    );

    app.post(
      '/admin/cups/matches/:id/reschedule',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Remarcar um confronto (horário novo) ou reabrir para as duplas marcarem (at nulo)',
          params: MatchParams,
          body: Type.Object({ at: Nullable(Iso), windowEnd: Type.Optional(Iso), reason: Reason }),
          response: { 200: MatchDetail, ...adminMatchErrors },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        const { m, cup } = found;
        if (!m.duoA || !m.duoB || !['open', 'scheduled', 'live', 'dispute'].includes(m.status)) return reply.code(409).send({ error: 'match_closed', message: 'this match cannot be rescheduled' });
        const started = m.roomId ? await db.select({ id: rankedSeries.id }).from(rankedSeries).where(eq(rankedSeries.roomId, m.roomId)).limit(1) : [];
        if (started.length > 0) return reply.code(409).send({ error: 'series_started', message: 'the series already started' });
        const at = request.body.at ? new Date(request.body.at) : null;
        const windowEnd = request.body.windowEnd ? new Date(request.body.windowEnd) : m.windowEnd;
        if (at && (at <= new Date() || at >= windowEnd)) return reply.code(422).send({ error: 'invalid_time', message: 'the new time must be in the future and inside the window' });
        await withOutbox((outbox) =>
          db.transaction(async (tx) => {
            await tx
              .update(cupMatches)
              .set({ status: at ? 'scheduled' : 'open', scheduledAt: at, roomId: null, proposedAt: null, proposedBy: null, windowEnd, remindedAt: null, updatedAt: new Date() })
              .where(eq(cupMatches.id, m.id));
            if (at) {
              const duos = await tx.select().from(cupDuos).where(inArray(cupDuos.id, [m.duoA!, m.duoB!]));
              for (const d of duos) {
                const opp = duos.find((x) => x.id !== d.id)!;
                await outbox.add(tx, [d.player1Id, d.player2Id], { cup: cup.edition, cupEvent: 'scheduled', opponent: duoName(opp), matchId: m.id, at: at.toISOString() });
              }
            }
          }),
        );
        await audit(user, 'cup_reschedule', request.body.reason, { edition: cup.edition, match: m.id, at: request.body.at, windowEnd });
        return detail((await loadMatch(m.id, user))!, user);
      },
    );

    app.post(
      '/admin/cups/matches/:id/replace',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Trocar um jogador de uma dupla do confronto por outra conta que não está em dupla nesta edição',
          params: MatchParams,
          body: Type.Object({ out: Type.String({ minLength: 1, maxLength: 40 }), in: Type.String({ minLength: 1, maxLength: 40 }), reason: Reason }),
          response: { 200: MatchDetail, ...adminMatchErrors },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        const { m, cup, a, b } = found;
        const [incoming] = await db.select({ id: users.id, name: users.username }).from(users).where(eq(users.usernameKey, usernameKey(request.body.in)));
        if (!incoming) return reply.code(422).send({ error: 'player_not_found', message: 'no account with this name' });
        const taken = await db
          .select({ id: cupDuos.id })
          .from(cupDuos)
          .where(and(eq(cupDuos.cupId, cup.id), or(eq(cupDuos.player1Id, incoming.id), eq(cupDuos.player2Id, incoming.id))));
        if (taken.length > 0) return reply.code(409).send({ error: 'already_in_pair', message: 'this account is already in a pair' });
        const outKey = usernameKey(request.body.out);
        const target = [a, b].find((d) => d && (usernameKey(d.player1Name) === outKey || usernameKey(d.player2Name) === outKey));
        if (!target) return reply.code(422).send({ error: 'player_not_in_match', message: 'this player is not in the match' });
        const first = usernameKey(target.player1Name) === outKey;
        await db.update(cupDuos).set(first ? { player1Id: incoming.id, player1Name: incoming.name } : { player2Id: incoming.id, player2Name: incoming.name }).where(eq(cupDuos.id, target.id));
        // a sala já aberta passa a aceitar a conta nova no lugar
        if (m.roomId) {
          const [room] = await db.select({ cup: rooms.cup }).from(rooms).where(eq(rooms.id, m.roomId));
          const outId = first ? target.player1Id : target.player2Id;
          if (room?.cup) {
            const sides = { ...room.cup.sides };
            const side = outId ? sides[outId] : undefined;
            if (outId) delete sides[outId];
            if (side !== undefined) sides[incoming.id] = side;
            await db.update(rooms).set({ cup: { ...room.cup, sides } }).where(eq(rooms.id, m.roomId));
          }
        }
        await db.insert(cupEntries).values({ cupId: cup.id, userId: incoming.id }).onConflictDoNothing();
        await audit(user, 'cup_replace', request.body.reason, { edition: cup.edition, match: m.id, out: request.body.out, in: incoming.name });
        liveBus.publish('cup');
        return detail((await loadMatch(m.id, user))!, user);
      },
    );

    app.post(
      '/admin/cups/matches/:id/reopen',
      {
        schema: {
          tags: ['outcup'],
          summary: 'Desfazer um resultado (W.O. ou do admin) enquanto o confronto seguinte não foi marcado',
          params: MatchParams,
          body: Type.Object({ reason: Reason }),
          response: { 200: MatchDetail, ...adminMatchErrors },
        },
      },
      async (request, reply) => {
        const user = await requireAdmin(request, reply);
        if (!user) return reply;
        const found = await loadMatch(request.params.id, user);
        if (!found) return reply.code(404).send({ error: 'match_not_found', message: 'no such match' });
        const { m, cup } = found;
        if (!m.duoA || !m.duoB || !['walkover', 'double_walkover', 'done'].includes(m.status) || m.resolution === 'series' || m.resolution === 'tiebreak') {
          return reply.code(409).send({ error: 'not_reopenable', message: 'only walkovers and admin results can be undone' });
        }
        const last = m.round >= (cup.rounds ?? 0) - 1;
        const [next] = last
          ? []
          : await db.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, m.round + 1), eq(cupMatches.slot, Math.floor(m.slot / 2))));
        if (next && (!['pending', 'open'].includes(next.status) || next.scheduledAt || next.proposedAt)) return reply.code(409).send({ error: 'next_started', message: 'the next match already moved on' });
        await db.transaction(async (tx) => {
          await tx.update(cupMatches).set({ status: 'open', winnerDuo: null, resolution: null, scoreA: null, scoreB: null, remindedAt: null, updatedAt: new Date() }).where(eq(cupMatches.id, m.id));
          if (next) await tx.update(cupMatches).set(m.slot % 2 === 0 ? { duoA: null, status: 'pending' } : { duoB: null, status: 'pending' }).where(eq(cupMatches.id, next.id));
          if (last) await tx.update(cups).set({ status: 'running', championDuoId: null, runnerUpDuoId: null }).where(eq(cups.id, cup.id));
        });
        await audit(user, 'cup_reopen', request.body.reason, { edition: cup.edition, match: m.id });
        liveBus.publish('cup');
        return detail((await loadMatch(m.id, user))!, user);
      },
    );
  };
}

/** Títulos da OutCup de uma conta: 1 = campeão, 2 = vice (perfil e hall da fama, RN-CUP-13). */
export async function cupTitles(db: Db, userId: string): Promise<{ edition: string; position: number }[]> {
  const rows = await db
    .select({ edition: cups.edition, champion: cups.championDuoId, runnerUp: cups.runnerUpDuoId, duo: cupDuos.id })
    .from(cupDuos)
    .innerJoin(cups, eq(cups.id, cupDuos.cupId))
    .where(and(eq(cups.status, 'finished'), or(eq(cupDuos.player1Id, userId), eq(cupDuos.player2Id, userId))))
    .orderBy(desc(cups.edition));
  return rows.flatMap((r) => (r.duo === r.champion ? [{ edition: r.edition, position: 1 }] : r.duo === r.runnerUp ? [{ edition: r.edition, position: 2 }] : []));
}

