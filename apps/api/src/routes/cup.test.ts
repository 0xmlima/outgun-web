// SPDX-License-Identifier: GPL-2.0-or-later
// OutCup (OG-520..528, D-88, RN-CUP): calendário e sorteio (funções puras) e o fluxo pela API com o
// banco: inscrição, sorteio no relógio, cancelamento abaixo de 4 duplas, horários, proposta e aceite,
// sala travada para as 4 contas, fim da série, W.O. (janela e atraso), resultado do admin, título e marcos.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { createCup, cupDates, cupSeriesFinished, CupOutbox, drawDuos, roundWindows, seedOrder } from '../cup.js';
import { emailKey, usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { cupDuos, cupMatches, cups, playerMilestones, playerProfiles, rankedSeries, rooms, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { roomSpawn } from '../registry.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const HOUR = 3600_000;

describe('calendário e sorteio da OutCup (RN-CUP-02/03/05/06)', () => {
  it('datas da edição em Brasília (UTC-3)', () => {
    const d = cupDates('2026-12');
    expect(d.registrationOpensAt.toISOString()).toBe('2026-11-20T03:00:00.000Z');
    expect(d.drawAt.toISOString()).toBe('2026-11-30T23:00:00.000Z'); // último dia, 20h
    expect(d.startsAt.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(d.endsAt.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('até 4 fases, uma por semana e a última até o fim do mês; 5 fases dividem o mês', () => {
    const { startsAt, endsAt } = cupDates('2026-12');
    for (const rounds of [2, 3, 4]) {
      const w = roundWindows(rounds, startsAt, endsAt);
      expect(w).toHaveLength(rounds);
      expect(w[0]!.start).toEqual(startsAt);
      expect(w[1]!.start.getTime() - startsAt.getTime()).toBe(7 * 24 * HOUR);
      expect(w[rounds - 1]!.end).toEqual(endsAt);
    }
    const five = roundWindows(5, startsAt, endsAt);
    expect(five[4]!.end).toEqual(endsAt);
    for (let i = 1; i < 5; i++) expect(five[i]!.start).toEqual(five[i - 1]!.end);
    expect(five.every((x) => x.end > x.start)).toBe(true);
  });

  it('cabeças de chave em lados opostos', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('número ímpar deixa de fora o último inscrito; duplas ordenadas pelo rating somado; sorteio reproduzível', () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({ userId: `u${i}`, name: `P${i}`, rating: i * 100 }));
    const a = drawDuos(entries, 'semente');
    const b = drawDuos(entries, 'semente');
    expect(a).toEqual(b);
    expect(a.leftOut?.userId).toBe('u8');
    expect(a.duos).toHaveLength(4);
    expect(a.duos.map((d) => d.seed)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < 4; i++) expect(a.duos[i - 1]!.rating).toBeGreaterThanOrEqual(a.duos[i]!.rating);
    expect(new Set(a.duos.flatMap((d) => d.players.map((p) => p.userId))).size).toBe(8);
  });
});

describe.skipIf(!pgAdminUrl)('OutCup pela API (OG-520..528)', () => {
  let t: TestDatabase;
  let app: App;
  let adminCookie: string;
  const cookies = new Map<string, string>();
  const ids: string[] = [];

  const login = async (username: string) => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'outgun-dev' }, headers: { origin: ORIGIN } });
    return `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;
  };
  const as = (userId: string) => ({ origin: ORIGIN, cookie: cookies.get(userId)! });

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    app = await buildApp({ config: { ...loadConfig({}), databaseUrl: t.url, devRoomWsUrl: 'ws://localhost:7801/rooms/{id}' }, database: t, mailer: new MemoryMailer(), logger: false });
    const [base] = await t.db.select({ hash: users.passwordHash }).from(users).where(eq(users.usernameKey, usernameKey('Jogador1')));
    for (let i = 1; i <= 9; i++) {
      const username = `Copa${i}`;
      const [row] = await t.db
        .insert(users)
        .values({ username, usernameKey: usernameKey(username), email: `copa${i}@outgun.local`, emailKey: emailKey(`copa${i}@outgun.local`), passwordHash: base!.hash })
        .returning({ id: users.id });
      await t.db.insert(playerProfiles).values({ userId: row!.id });
      ids.push(row!.id);
      cookies.set(row!.id, await login(username));
    }
    adminCookie = await login('Admin');
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  /** Edição com inscrições abertas agora e sorteio daqui a uma hora. */
  const openCup = async (edition: string) => {
    await createCup(t.db, edition);
    await t.db.update(cups).set({ registrationOpensAt: new Date(Date.now() - HOUR), drawAt: new Date(Date.now() + HOUR) }).where(eq(cups.edition, edition));
  };
  const signUp = async (edition: string, who: readonly string[]) => {
    for (const id of who) expect((await app.inject({ method: 'POST', url: `/cups/${edition}/entry`, headers: as(id) })).statusCode).toBe(200);
  };
  const draw = async (edition: string) => {
    await t.db.update(cups).set({ drawAt: new Date(Date.now() - 1000) }).where(eq(cups.edition, edition));
    await app.cupTick(new Date());
    const [cup] = await t.db.select().from(cups).where(eq(cups.edition, edition));
    return cup!;
  };
  const players = async (duoId: string) => {
    const [d] = await t.db.select().from(cupDuos).where(eq(cupDuos.id, duoId));
    return [d!.player1Id!, d!.player2Id!];
  };

  it('abaixo de 4 duplas (8 inscritos) a edição é cancelada no sorteio', async () => {
    await openCup('2027-01');
    await signUp('2027-01', ids.slice(0, 7));
    const cup = await draw('2027-01');
    expect(cup.status).toBe('cancelled');
    expect(cup.cancelReason).toBe('min_duos');
  });

  it('fluxo completo: sorteio, horário, sala, série, W.O. e resultado do admin até o título', async () => {
    await openCup('2026-12');
    await signUp('2026-12', ids);
    // sair e voltar antes do sorteio
    expect((await app.inject({ method: 'DELETE', url: '/cups/2026-12/entry', headers: as(ids[0]!) })).statusCode).toBe(200);
    await signUp('2026-12', [ids[0]!]);
    const cup = await draw('2026-12');
    expect(cup.status).toBe('running');
    expect(cup.rounds).toBe(2);
    const view = (await app.inject({ method: 'GET', url: '/cups/2026-12', headers: as(ids[1]!) })).json();
    expect(view.duos).toHaveLength(4);
    expect(view.leftOut).toBe('Copa1'); // o último a se inscrever (voltou depois de sair)
    expect((await app.inject({ method: 'POST', url: '/cups/2026-12/entry', headers: as(ids[2]!) })).json().error).toBe('registration_closed');

    const first = await t.db.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, 0)));
    expect(first.every((m) => m.status === 'open' && m.bestOf === 3)).toBe(true);
    const [m0, m1] = first.sort((a, b) => a.slot - b.slot) as [typeof first[0], typeof first[0]];
    const a0 = await players(m0.duoA!);
    const b0 = await players(m0.duoB!);

    // horários: só os 4 do confronto; a hora proposta precisa servir para os 4
    const hour = new Date(m0.windowStart.getTime() + 20 * HOUR).toISOString();
    const outsider = ids.find((id) => ![...a0, ...b0].includes(id) && cookies.has(id))!;
    expect((await app.inject({ method: 'PUT', url: `/cups/matches/${m0.id}/availability`, payload: { hours: [hour] }, headers: as(outsider) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: `/cups/matches/${m0.id}/availability`, payload: { hours: ['2026-12-01T03:30:00.000Z'] }, headers: as(a0[0]!) })).json().error).toBe('invalid_hour');
    for (const id of [...a0, ...b0.slice(0, 1)]) expect((await app.inject({ method: 'PUT', url: `/cups/matches/${m0.id}/availability`, payload: { hours: [hour] }, headers: as(id) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/cups/matches/${m0.id}/propose`, payload: { at: hour }, headers: as(a0[0]!) })).json().error).toBe('not_available');
    await app.inject({ method: 'PUT', url: `/cups/matches/${m0.id}/availability`, payload: { hours: [hour] }, headers: as(b0[1]!) });
    const detail = (await app.inject({ method: 'GET', url: `/cups/matches/${m0.id}`, headers: as(a0[0]!) })).json();
    expect(detail.common).toEqual([hour]);
    expect((await app.inject({ method: 'GET', url: `/cups/matches/${m0.id}`, headers: as(outsider) })).json().availability).toBeNull();
    expect((await app.inject({ method: 'POST', url: `/cups/matches/${m0.id}/propose`, payload: { at: hour }, headers: as(a0[0]!) })).statusCode).toBe(200);
    // a própria dupla não aceita a proposta dela
    expect((await app.inject({ method: 'POST', url: `/cups/matches/${m0.id}/answer`, payload: { accept: true }, headers: as(a0[1]!) })).json().error).toBe('no_proposal');
    expect((await app.inject({ method: 'POST', url: `/cups/matches/${m0.id}/answer`, payload: { accept: true }, headers: as(b0[0]!) })).json().match).toMatchObject({ status: 'scheduled', scheduledAt: hour });

    // 15 min antes a sala abre, travada para as 4 contas
    await app.cupTick(new Date(Date.parse(hour) - 10 * 60_000));
    const [live] = await t.db.select().from(cupMatches).where(eq(cupMatches.id, m0.id));
    expect(live!.status).toBe('live');
    const [room] = await t.db.select().from(rooms).where(eq(rooms.id, live!.roomId!));
    expect(room).toMatchObject({ mode: 'ranked', format: '2x2', bestOf: 3, maxPlayers: 4 });
    const spawn = roomSpawn(room!);
    expect(spawn.cup?.sides).toEqual({ [a0[0]!]: 0, [a0[1]!]: 0, [b0[0]!]: 1, [b0[1]!]: 1 });
    expect((await app.inject({ method: 'POST', url: `/rooms/${room!.id}/join`, payload: {}, headers: as(outsider) })).json().error).toBe('cup_room');
    expect((await app.inject({ method: 'POST', url: `/rooms/${room!.id}/join`, payload: {}, headers: as(a0[0]!) })).statusCode).toBe(200);

    // fim da série: a dupla A (vermelho) vence 2 × 1 e vai à final
    const [series] = await t.db.insert(rankedSeries).values({ serverId: 'teste', serverSeriesId: 's1', roomId: room!.id, format: '2x2', bestOf: 3, games: 3, redWins: 2, blueWins: 1, winner: 0 }).returning();
    await t.db.transaction((tx) => cupSeriesFinished(tx, room!.id, series!.id, { winner: 0, redWins: 2, blueWins: 1 }, new CupOutbox()));
    const [done] = await t.db.select().from(cupMatches).where(eq(cupMatches.id, m0.id));
    expect(done).toMatchObject({ status: 'done', winnerDuo: m0.duoA, resolution: 'series', scoreA: 2, scoreB: 1 });
    const [finalPending] = await t.db.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, 1)));
    expect(finalPending).toMatchObject({ status: 'pending', duoA: m0.duoA, bestOf: 5 });

    // fim da janela: só a dupla A do outro confronto marcou horário → W.O. para ela
    const a1 = await players(m1.duoA!);
    for (const id of a1) await app.inject({ method: 'PUT', url: `/cups/matches/${m1.id}/availability`, payload: { hours: [hour] }, headers: as(id) });
    await app.cupTick(new Date(m1.windowEnd.getTime() + 60_000));
    const [wo] = await t.db.select().from(cupMatches).where(eq(cupMatches.id, m1.id));
    expect(wo).toMatchObject({ status: 'walkover', winnerDuo: m1.duoA, resolution: 'walkover' });
    const [final] = await t.db.select().from(cupMatches).where(eq(cupMatches.id, finalPending!.id));
    expect(final).toMatchObject({ status: 'open', duoA: m0.duoA, duoB: m1.duoA });

    // resultado do admin na final: a edição acaba com campeã e vice, selos e marcos
    expect((await app.inject({ method: 'POST', url: `/admin/cups/matches/${final!.id}/result`, payload: { winner: 'a', reason: 'teste' }, headers: { origin: ORIGIN, cookie: cookies.get(a0[0]!)! } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/admin/cups/matches/${final!.id}/result`, payload: { winner: 'a', reason: 'teste' }, headers: { origin: ORIGIN, cookie: adminCookie } })).statusCode).toBe(200);
    const [over] = await t.db.select().from(cups).where(eq(cups.id, cup.id));
    expect(over).toMatchObject({ status: 'finished', championDuoId: m0.duoA, runnerUpDuoId: m1.duoA });
    const titles = (await app.inject({ method: 'GET', url: '/players/Copa1/cup-titles' })).json().titles;
    expect(titles).toEqual([]); // ficou de fora
    const champ = await t.db.select().from(users).where(eq(users.id, a0[0]!));
    expect((await app.inject({ method: 'GET', url: `/players/${champ[0]!.username}/cup-titles` })).json().titles).toEqual([{ edition: '2026-12', position: 1 }]);
    const got = (await t.db.select({ m: playerMilestones.milestone }).from(playerMilestones).where(eq(playerMilestones.userId, a0[0]!))).map((r) => r.m);
    expect(got).toEqual(expect.arrayContaining(['cup_first', 'cup_win_match', 'cup_final', 'cup_champion']));
    expect(got).not.toContain('cup_unbeaten'); // perdeu um jogo na série
    const list = (await app.inject({ method: 'GET', url: '/cups' })).json().cups;
    expect(list.find((c: { edition: string }) => c.edition === '2026-12')).toMatchObject({ status: 'finished', duos: 4 });
  });

  it('atraso: 15 min depois do horário, a dupla incompleta na sala perde por W.O.', async () => {
    await openCup('2027-02');
    await signUp('2027-02', ids.slice(0, 8));
    const cup = await draw('2027-02');
    const [m] = (await t.db.select().from(cupMatches).where(and(eq(cupMatches.cupId, cup.id), eq(cupMatches.round, 0)))).sort((x, y) => x.slot - y.slot);
    const at = new Date(m!.windowStart.getTime() + 30 * HOUR);
    await t.db.update(cupMatches).set({ status: 'scheduled', scheduledAt: at }).where(eq(cupMatches.id, m!.id));
    await app.cupTick(new Date(at.getTime() - 5 * 60_000));
    const [live] = await t.db.select().from(cupMatches).where(eq(cupMatches.id, m!.id));
    const b = await players(m!.duoB!);
    // só a dupla B completa na sala
    await t.db
      .update(rooms)
      .set({ roster: b.map((accountId, i) => ({ uid: i, name: `B${i}`, team: 1, accountId, bot: false, muted: 0 })), phase: 'lobby' })
      .where(eq(rooms.id, live!.roomId!));
    await app.cupTick(new Date(at.getTime() + 10 * 60_000));
    expect((await t.db.select().from(cupMatches).where(eq(cupMatches.id, m!.id)))[0]!.status).toBe('live'); // ainda na tolerância
    await app.cupTick(new Date(at.getTime() + 16 * 60_000));
    expect((await t.db.select().from(cupMatches).where(eq(cupMatches.id, m!.id)))[0]).toMatchObject({ status: 'walkover', winnerDuo: m!.duoB });
  });
});
