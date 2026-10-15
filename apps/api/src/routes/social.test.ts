// SPDX-License-Identifier: GPL-2.0-or-later
// API social (OG-211): companheiros, rivais, clã, evolução, busca e privacidade (D-39).
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { playerMilestones, playerProfiles, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { backfillMilestones } from '../milestones.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { fold, likePrefix } from './social.js';

const SECRET = 'segredo-de-teste-0123456789';
const DAY = 86_400_000;

it('fold tira acentos e maiúsculas (busca por clã)', () => {
  expect(fold('ÁÇãoÑ')).toBe('acaon');
});

it('likePrefix escapa os curingas do LIKE', () => {
  expect(likePrefix('a%b_c\\')).toBe('a\\%b\\_c\\\\%');
});

describe.skipIf(!pgAdminUrl)('API social (OG-211)', () => {
  let t: TestDatabase;
  let app: App;
  let ids: Record<string, string>;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    const [j3] = await t.db
      .insert(users)
      .values({ username: 'Jogador3', usernameKey: usernameKey('Jogador3'), email: 'j3@outgun.local', emailKey: 'j3@outgun.local', passwordHash: 'x', clanTag: 'AB' })
      .returning({ id: users.id });
    await t.db.insert(playerProfiles).values({ userId: j3!.id });
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    ids = Object.fromEntries((await t.db.select({ id: users.id, name: users.username }).from(users)).map((u) => [u.name, u.id]));

    const send = (payload: unknown) => {
      const body = JSON.stringify(payload);
      const url = '/internal/matches';
      return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
    };
    const line = (slot: number, name: string, team: 0 | 1, opts: { bot?: boolean; guest?: boolean; scoreDelta?: number } = {}) => ({
      slot, ...(opts.bot || opts.guest ? {} : { userId: ids[name] }), name, team, isBot: opts.bot ?? false, frags: 3, kills: 3, deaths: 1, captures: 0, playSeconds: 300,
      scoreDelta: opts.scoreDelta ?? 0, negDelta: opts.scoreDelta ? 2 : 0, stats: {},
    });
    const ok = async (res: Promise<{ statusCode: number; body: string }>) => {
      const r = await res;
      expect(r.statusCode, r.body).toBe(201);
    };
    const at = (daysAgo: number) => ({ startedAt: new Date(Date.now() - daysAgo * DAY - 300_000).toISOString(), endedAt: new Date(Date.now() - daysAgo * DAY).toISOString() });
    const details = {
      reason: 'timeLimit', mapTime: 300, mapTitle: 'The Blunt',
      rules: { captureLimit: 1, winScoreDifference: 1, timeLimit: 0, extraTime: 0, extraTimePeriods: 1, suddenDeath: false },
      teams: [{ score: 0, kills: 3, shots: 30 }, { score: 0, kills: 3, shots: 30 }],
      captures: [], baseScore: [0, 0],
    };
    // 40 dias atrás: J1 e J3 (vermelho) vencem J2, um bot e um convidado
    await ok(send({ ...at(40), serverMatchId: 's1', roomId: 'main', map: 'outgun1', details, mode: 'casual', ranked: false, redScore: 1, blueScore: 0, players: [line(0, 'Jogador1', 0), line(1, 'Jogador3', 0), line(2, 'Convidado', 0, { guest: true }), line(8, 'Jogador2', 1), line(9, 'Bot', 1, { bot: true })] }));
    // 10 dias atrás: empate ranqueado J1 × J2
    await ok(send({ ...at(10), serverMatchId: 's2', roomId: 'ranked', map: 'outgun1', details, mode: 'ranked', ranked: true, redScore: 0, blueScore: 0, players: [line(0, 'Jogador1', 0, { scoreDelta: 150 }), line(8, 'Jogador2', 1, { scoreDelta: 1 })] }));
    // ontem: J1 e J3 (azul) vencem J2
    await ok(send({ ...at(1), serverMatchId: 's3', roomId: 'main', map: 'outgun1', details, mode: 'casual', ranked: false, redScore: 0, blueScore: 2, players: [line(0, 'Jogador2', 0), line(8, 'Jogador1', 1), line(9, 'Jogador3', 1)] }));
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('companheiros e rivais: contas apenas (sem bots e convidados), com vitórias e saldo; clã', async () => {
    const res = await app.inject('/players/jogador1/social');
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.hidden).toBe(false);
    expect(s.companions).toEqual([{ username: 'Jogador3', clanTag: 'AB', matches: 2, wins: 2, losses: 0 }]);
    expect(s.rivals).toEqual([{ username: 'Jogador2', clanTag: null, matches: 3, wins: 2, losses: 0, draws: 1, balance: 2 }]);
    expect(s.clan).toBeNull();
    expect((await app.inject('/players/Jogador3/social')).json().clan).toEqual({ tag: 'AB', members: ['Jogador3'] });
    expect((await app.inject('/players/ninguem/social')).statusCode).toBe(404);
  });

  it('evolução: rating por temporada, série acumulada e totais por período', async () => {
    const p = (await app.inject('/players/Jogador1/progress')).json();
    expect(p.hidden).toBe(false);
    expect(p.seasons).toEqual([expect.objectContaining({ name: 'Temporada 1', active: true, score: 150, neg: 2, matches: 1 })]);
    expect(p.series).toHaveLength(1);
    expect(p.series[0]).toMatchObject({ score: 150, neg: 2 });
    expect(p.series[0].rating).toBeCloseTo(151 / 3);
    expect(p.periods.days7).toMatchObject({ matches: 1, wins: 1, kills: 3 });
    expect(p.periods.days30).toMatchObject({ matches: 2, wins: 1 });
    expect(p.periods.all).toMatchObject({ matches: 3, wins: 2, deaths: 3, playSeconds: 900 });
  });

  it('busca pelo começo do nome (comparação do login) ou pelo clã, paginada; curingas não valem', async () => {
    const all = (await app.inject('/players?busca=JOGADOR')).json();
    expect(all.total).toBe(3);
    expect(all.players.map((u: { username: string }) => u.username)).toEqual(['Jogador1', 'Jogador2', 'Jogador3']);
    expect((await app.inject('/players?busca=jogador2')).json().players[0].username).toBe('Jogador2');
    expect((await app.inject('/players?busca=ab')).json().players).toEqual([{ username: 'Jogador3', clanTag: 'AB' }]);
    expect((await app.inject('/players?busca=%C3%A1bc')).json().total).toBe(1);
    expect((await app.inject('/players?busca=J%C3%93GADOR')).json().total).toBe(3);
    const page = (await app.inject('/players?busca=jog&limit=1&offset=1')).json();
    expect(page).toMatchObject({ total: 3, players: [{ username: 'Jogador2' }] });
    expect((await app.inject('/players?busca=%25')).json().total).toBe(0);
  });

  it('marcos (OG-213): concedidos ao gravar a partida, no perfil e na partida; retroativo idempotente', async () => {
    const j1 = (await app.inject('/players/Jogador1')).json();
    const first = (await app.inject('/players/Jogador1/matches?limit=100')).json().matches.at(-1).id;
    expect(j1.milestones).toEqual([{ id: 'first_match', achievedAt: expect.any(String), matchId: first }]);
    expect(j1.lastMatchAt).toEqual(expect.any(String));
    const m = (await app.inject(`/matches/${first}`)).json();
    expect(m.milestones).toEqual([
      { username: 'Jogador1', milestone: 'first_match' },
      { username: 'Jogador2', milestone: 'first_match' },
      { username: 'Jogador3', milestone: 'first_match' },
    ]);
    await t.db.delete(playerMilestones);
    expect(await backfillMilestones(t.db, { beta: true })).toEqual({ users: 3, added: 6 });
    expect(await backfillMilestones(t.db, { beta: true })).toEqual({ users: 3, added: 0 });
    expect((await app.inject('/players/Jogador3')).json().milestones.map((x: { id: string }) => x.id).sort()).toEqual(['beta', 'first_match']);
  });

  it('diretório: mais ativos em 7 dias e clãs', async () => {
    const d = (await app.inject('/directory')).json();
    expect(d.active.map((a: { username: string }) => a.username).sort()).toEqual(['Jogador1', 'Jogador2', 'Jogador3']);
    expect(d.active.find((a: { username: string }) => a.username === 'Jogador3')).toMatchObject({ matches: 1, wins: 1, playSeconds: 300 });
    expect(d.clans).toEqual([{ tag: 'AB', members: 1, activeMembers: 1, matches: 1 }]);
  });

  it('privacidade: escondido não devolve os dados nem aparece como companheiro/rival de outros', async () => {
    await t.db.update(playerProfiles).set({ hideCompanions: true }).where(eq(playerProfiles.userId, ids.Jogador3!));
    await t.db.update(playerProfiles).set({ hideHistory: true }).where(eq(playerProfiles.userId, ids.Jogador2!));
    // Jogador2 ainda não foi consultado (sem cache): Jogador3 some dos rivais dele
    const j2 = (await app.inject('/players/Jogador2/social')).json();
    expect(j2.rivals.map((r: { username: string }) => r.username)).toEqual(['Jogador1']);
    expect((await app.inject('/players/Jogador2/matches')).json()).toEqual({ total: 0, hidden: true, matches: [] });
    const progress = (await app.inject('/players/Jogador2/progress')).json();
    expect(progress).toMatchObject({ hidden: true, series: [], periods: null });
    expect(progress.seasons).toHaveLength(1);
    expect((await app.inject({ method: 'PUT', url: '/account/privacy', payload: { hideCompanions: true, hideHistory: false } })).statusCode).toBe(401);
  });
});
