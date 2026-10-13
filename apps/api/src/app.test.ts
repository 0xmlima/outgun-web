// SPDX-License-Identifier: GPL-2.0-or-later
// Testes de integração da API com PostgreSQL de verdade (container do global-setup).
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { loadConfig } from './config.js';
import { migrateUp } from './db/migrate.js';
import { matches, matchPlayers, rooms, seasons, users } from './db/schema.js';
import { SEED_USERS, seed } from './db/seed.js';
import { signInternalRequest } from './plugins/internal-auth.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from './test/db.js';

const SECRET = 'segredo-de-teste-0123456789';

describe.skipIf(!pgAdminUrl)('API (integração)', () => {
  let t: TestDatabase;
  let app: App;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, logger: false });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const internal = (url: string, payload: unknown, secret = SECRET) => {
    const body = JSON.stringify(payload);
    return app.inject({
      method: 'POST',
      url,
      payload: body,
      headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', secret, 'POST', url, body) },
    });
  };

  const heartbeatRoom = {
    id: 'main',
    name: 'Principal',
    mode: 'casual',
    preset: 'classic',
    maxPlayers: 16,
    persistent: true,
    players: 3,
    map: 'outgun1',
    wsUrl: 'ws://localhost:7700/rooms/main',
  };

  const match = (over: Record<string, unknown> = {}) => ({
    serverMatchId: 'm-1',
    roomId: 'main',
    mode: 'casual',
    ranked: false,
    map: 'outgun1',
    redScore: 3,
    blueScore: 1,
    startedAt: '2026-10-13T12:00:00.000Z',
    endedAt: '2026-10-13T12:20:00.000Z',
    players: [
      { slot: 0, name: 'Jogador1', team: 0, isBot: false, frags: 12, kills: 10, deaths: 4, captures: 2, playSeconds: 1200, scoreDelta: 0, negDelta: 0, stats: { shots: 300, hits: 120 } },
      { slot: 1, name: 'Robô', team: 1, isBot: true, frags: 3, kills: 3, deaths: 9, captures: 0, playSeconds: 1200, scoreDelta: 0, negDelta: 0, stats: {} },
    ],
    ...over,
  });

  it('GET /health responde com o banco no ar', async () => {
    const res = await app.inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: true, redis: 'disabled' });
  });

  it('publica a OpenAPI com as rotas públicas e internas', async () => {
    const res = await app.inject('/openapi.json');
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/health', '/rooms', '/internal/rooms/heartbeat', '/internal/matches']));
    expect(spec.paths['/internal/matches'].post.security).toEqual([{ gameServerHmac: [] }]);
    expect((await app.inject('/docs')).statusCode).toBeLessThan(400);
  });

  it('seed é idempotente', async () => {
    await seed(t.db);
    const [count] = await t.db.select({ n: sql<number>`count(*)::int` }).from(users);
    expect(count?.n).toBe(SEED_USERS.length);
    expect(await t.db.select().from(seasons).where(eq(seasons.active, true))).toHaveLength(1);
  });

  it('rotas internas exigem assinatura válida', async () => {
    const unsigned = await app.inject({ method: 'POST', url: '/internal/rooms/heartbeat', payload: { rooms: [] } });
    expect(unsigned.statusCode).toBe(401);
    const wrong = await internal('/internal/rooms/heartbeat', { rooms: [] }, 'segredo-errado-0123456789');
    expect(wrong.statusCode).toBe(401);
  });

  it('heartbeat põe a sala no ar e GET /rooms mostra os jogadores', async () => {
    const before = (await app.inject('/rooms')).json().rooms.find((r: { id: string }) => r.id === 'main');
    expect(before).toMatchObject({ online: false, players: 0 });
    const res = await internal('/internal/rooms/heartbeat', { rooms: [heartbeatRoom] });
    expect(res.statusCode).toBe(200);
    const list = (await app.inject('/rooms')).json().rooms;
    expect(list.find((r: { id: string }) => r.id === 'main')).toEqual({
      id: 'main',
      name: 'Principal',
      mode: 'casual',
      preset: 'classic',
      hasPassword: false,
      maxPlayers: 16,
      players: 3,
      map: 'outgun1',
      online: true,
    });
    const [row] = await t.db.select().from(rooms).where(eq(rooms.id, 'main'));
    expect(row?.serverId).toBe('gs-1');
  });

  it('heartbeat recusa preset de outro modo', async () => {
    const res = await internal('/internal/rooms/heartbeat', { rooms: [{ ...heartbeatRoom, id: 'x', mode: 'ranked' }] });
    expect(res.statusCode).toBe(422);
  });

  it('grava a partida uma vez só (reenvio é idempotente)', async () => {
    const [player] = await t.db.select({ id: users.id }).from(users).where(eq(users.username, 'Jogador1'));
    const body = match({ players: [{ ...match().players[0], userId: player!.id }, match().players[1]] });
    const first = await internal('/internal/matches', body);
    expect(first.statusCode).toBe(201);
    const again = await internal('/internal/matches', body);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ id: first.json().id, duplicate: true });
    const stored = await t.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, first.json().id));
    expect(stored).toHaveLength(2);
    expect(stored.find((p) => p.slot === 0)).toMatchObject({ userId: player!.id, frags: 12, stats: { shots: 300, hits: 120 } });
  });

  it('recusa partida Ranked com bots (D-11) e entradas inconsistentes', async () => {
    expect((await internal('/internal/matches', match({ serverMatchId: 'r', mode: 'ranked', ranked: true }))).statusCode).toBe(422);
    expect((await internal('/internal/matches', match({ serverMatchId: 'c', ranked: true }))).statusCode).toBe(422);
    expect((await internal('/internal/matches', match({ serverMatchId: 'd', endedAt: '2026-10-13T11:00:00.000Z' }))).statusCode).toBe(422);
    expect((await internal('/internal/matches', match({ serverMatchId: 'e', redScore: -1 }))).statusCode).toBe(400);
  });

  it('partida Ranked entra na temporada ativa', async () => {
    const humans = match().players.map((p, i) => ({ ...p, slot: i, isBot: false }));
    const res = await internal('/internal/matches', match({ serverMatchId: 'rk', roomId: 'ranked', mode: 'ranked', ranked: true, players: humans }));
    expect(res.statusCode).toBe(201);
    const [row] = await t.db.select().from(matches).where(eq(matches.id, res.json().id));
    const [season] = await t.db.select().from(seasons).where(eq(seasons.active, true));
    expect(row?.seasonId).toBe(season!.id);
  });

  it('jogador com conta inexistente fica anônimo; excluir a conta anonimiza a partida (RN-PLT-04)', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    const res = await internal('/internal/matches', match({ serverMatchId: 'g', players: [{ ...match().players[0], userId: ghost }] }));
    expect(res.statusCode).toBe(201);
    const [p] = await t.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, res.json().id));
    expect(p?.userId).toBeNull();

    const [player] = await t.db.select({ id: users.id }).from(users).where(eq(users.username, 'Jogador1'));
    await t.db.delete(users).where(eq(users.id, player!.id));
    const left = await t.db.select().from(matchPlayers).where(eq(matchPlayers.name, 'Jogador1'));
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((row) => row.userId === null)).toBe(true);
  });
});
