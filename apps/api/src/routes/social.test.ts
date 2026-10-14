// SPDX-License-Identifier: GPL-2.0-or-later
// API social (OG-211): companheiros, rivais, clã, evolução, busca e privacidade (D-39).
import { signInternalRequest } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { usernameKey } from '../db/keys.js';
import { migrateUp } from '../db/migrate.js';
import { playerProfiles, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';
import { likePrefix } from './social.js';

const SECRET = 'segredo-de-teste-0123456789';
const DAY = 86_400_000;

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
      .values({ username: 'Jogador3', usernameKey: usernameKey('Jogador3'), email: 'j3@outgun.local', emailKey: 'j3@outgun.local', passwordHash: 'x', clanTag: 'ABC' })
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
      slot, userId: opts.bot || opts.guest ? null : ids[name], name, team, isBot: opts.bot ?? false, frags: 3, kills: 3, deaths: 1, captures: 0, playSeconds: 300,
      scoreDelta: opts.scoreDelta ?? 0, negDelta: opts.scoreDelta ? 2 : 0, stats: {},
    });
    const at = (daysAgo: number) => ({ startedAt: new Date(Date.now() - daysAgo * DAY - 300_000).toISOString(), endedAt: new Date(Date.now() - daysAgo * DAY).toISOString() });
    const details = { reason: 'timeLimit', mapTime: 300, teams: [], captures: [], baseScore: [0, 0] };
    // 40 dias atrás: J1 e J3 (vermelho) vencem J2, um bot e um convidado
    expect((await send({ ...at(40), serverMatchId: 's1', roomId: 'main', map: 'outgun1', details, mode: 'casual', ranked: false, redScore: 1, blueScore: 0, players: [line(0, 'Jogador1', 0), line(1, 'Jogador3', 0), line(2, 'Convidado', 0, { guest: true }), line(8, 'Jogador2', 1), line(9, 'Bot', 1, { bot: true })] })).statusCode).toBe(201);
    // 10 dias atrás: empate ranqueado J1 × J2
    expect((await send({ ...at(10), serverMatchId: 's2', roomId: 'ranked', map: 'outgun1', details, mode: 'ranked', ranked: true, redScore: 0, blueScore: 0, players: [line(0, 'Jogador1', 0, { scoreDelta: 150 }), line(8, 'Jogador2', 1, { scoreDelta: 1 })] })).statusCode).toBe(201);
    // ontem: J1 e J3 (azul) vencem J2
    expect((await send({ ...at(1), serverMatchId: 's3', roomId: 'main', map: 'outgun1', details, mode: 'casual', ranked: false, redScore: 0, blueScore: 2, players: [line(0, 'Jogador2', 0), line(8, 'Jogador1', 1), line(9, 'Jogador3', 1)] })).statusCode).toBe(201);
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
    expect(s.companions).toEqual([{ username: 'Jogador3', clanTag: 'ABC', matches: 2, wins: 2, losses: 0 }]);
    expect(s.rivals).toEqual([{ username: 'Jogador2', clanTag: null, matches: 3, wins: 2, losses: 0, draws: 1, balance: 2 }]);
    expect(s.clan).toBeNull();
    expect((await app.inject('/players/Jogador3/social')).json().clan).toEqual({ tag: 'ABC', members: ['Jogador3'] });
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
    expect((await app.inject('/players?busca=abc')).json().players).toEqual([{ username: 'Jogador3', clanTag: 'ABC' }]);
    const page = (await app.inject('/players?busca=jog&limit=1&offset=1')).json();
    expect(page).toMatchObject({ total: 3, players: [{ username: 'Jogador2' }] });
    expect((await app.inject('/players?busca=%25')).json().total).toBe(0);
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
