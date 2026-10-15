// SPDX-License-Identifier: GPL-2.0-or-later
// Registro de salas e matchmaking (OG-086): heartbeat, saída do lobby, abertura sob demanda,
// "Jogar agora" e sala privada.
import { fromJwks, signInternalRequest, verifyTicket } from '@outgun/tickets';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { gameServers, rooms } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { ONLINE_MS, pickServer, type ServerRow } from '../registry.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'segredo-de-teste-0123456789';

describe('escolha do servidor', () => {
  const s = (id: string, players: number, rooms = 1, region = 'eu', maxRooms = 10): ServerRow => ({
    id, wsBaseUrl: `ws://${id}`, region, maxRooms, rooms, players, lastHeartbeatAt: new Date(), maps: [],
  });

  it('menos jogadores primeiro; servidor lotado de salas fica fora', () => {
    expect(pickServer([s('a', 10), s('b', 2), s('c', 0, 10)])?.id).toBe('b');
  });

  it('servidor drenando (maxRooms 0) fica fora', () => {
    expect(pickServer([s('a', 0, 0, 'eu', 0), s('b', 9)])?.id).toBe('b');
    expect(pickServer([s('a', 0, 0, 'eu', 0)])).toBeUndefined();
  });

  it('a região pedida tem preferência, se houver vaga nela', () => {
    expect(pickServer([s('a', 0, 1, 'us'), s('b', 9, 1, 'eu')], 'eu')?.id).toBe('b');
    expect(pickServer([s('a', 0, 1, 'us'), s('b', 9, 10, 'eu')], 'eu')?.id).toBe('a');
    expect(pickServer([])).toBeUndefined();
  });
});

describe.skipIf(!pgAdminUrl)('registro de salas (OG-086)', () => {
  let t: TestDatabase;
  let app: App;
  let keys: ReturnType<typeof fromJwks>;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    // como em produção: sem servidor de desenvolvimento, só os que mandam heartbeat
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET},gs-2:${SECRET}` }), databaseUrl: t.url, devRoomWsUrl: undefined };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    keys = fromJwks((await app.inject('/.well-known/jwks.json')).json());
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Jogador1', password: 'outgun-dev' }, headers: { origin: ORIGIN } });
    cookie = `og_session=${login.cookies.find((c) => c.name === 'og_session')!.value}`;
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });
  beforeEach(async () => {
    await t.db.delete(gameServers);
    await t.db.update(rooms).set({ serverId: null, wsUrl: null, players: 0, map: null, lastHeartbeatAt: null });
  });

  const heartbeat = (server: string, hosted: { id: string; players: number; mode?: string; preset?: string; persistent?: boolean; maxPlayers?: number; phase?: string; roster?: { uid: number; name: string; team: number; bot: boolean; muted: number }[] }[], region = 'eu', maxRooms = 10) => {
    const base = `ws://${server}.test`;
    const body = JSON.stringify({
      server: { wsBaseUrl: base, region, maxRooms },
      rooms: hosted.map((r) => ({
        id: r.id,
        name: r.id,
        mode: r.mode ?? 'casual',
        preset: r.preset ?? 'classic',
        maxPlayers: r.maxPlayers ?? 16,
        persistent: r.persistent ?? true,
        players: r.players,
        map: 'outgun1',
        wsUrl: `${base}/rooms/${r.id}`,
        ...(r.phase ? { phase: r.phase } : {}),
        ...(r.roster ? { roster: r.roster } : {}),
      })),
    });
    const url = '/internal/rooms/heartbeat';
    return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest(server, SECRET, 'POST', url, body) } });
  };
  const list = async (query = '') => (await app.inject(`/rooms${query}`)).json().rooms as { id: string; online: boolean; players: number; region: string | null }[];
  const post = (url: string, payload: unknown, withCookie = false) =>
    app.inject({ method: 'POST', url, payload: payload as object, remoteAddress: '10.9.0.1', headers: { origin: ORIGIN, ...(withCookie ? { cookie } : {}) } });
  const claims = (ticket: string, room: string) => {
    const r = verifyTicket(ticket, keys, room);
    if (!r.ok) throw new Error(r.reason);
    return r.claims;
  };

  it('sem nenhum game server, o lobby fica vazio e a entrada responde 503', async () => {
    expect(await list()).toEqual([]);
    expect((await post('/rooms/main/join', { name: 'Ana' })).json().error).toBe('room_offline');
  });

  it('a sala informa quantas pessoas tem, sem os bots (OG-282)', async () => {
    const roster = [0, 1, 2].map((uid) => ({ uid, name: `p${uid}`, team: 0, bot: uid > 0, muted: 0 }));
    await heartbeat('gs-1', [{ id: 'main', players: 3, roster }]);
    expect((await list()).find((r) => r.id === 'main')).toMatchObject({ players: 3, humans: 1 });
  });

  it('heartbeat registra o servidor; a sala some do lobby quando o heartbeat para (≤ 10 s)', async () => {
    expect((await heartbeat('gs-1', [{ id: 'main', players: 4 }])).statusCode).toBe(200);
    const [server] = await t.db.select().from(gameServers);
    expect(server).toMatchObject({ id: 'gs-1', region: 'eu', rooms: 1, players: 4, wsBaseUrl: 'ws://gs-1.test' });
    expect((await list()).find((r) => r.id === 'main')).toMatchObject({ online: true, players: 4, region: 'eu' });

    // servidor caiu: 10 s sem heartbeat
    const stale = new Date(Date.now() - ONLINE_MS - 1);
    await t.db.update(gameServers).set({ lastHeartbeatAt: stale });
    await t.db.update(rooms).set({ lastHeartbeatAt: stale });
    expect(await list()).toEqual([]);
  });

  it('sala encerrada pelo servidor sai do ar no heartbeat seguinte', async () => {
    await t.db.insert(rooms).values({ id: 'p-temp', name: 'Temp', mode: 'casual', preset: 'classic', maxPlayers: 8 }).onConflictDoNothing();
    await heartbeat('gs-1', [{ id: 'main', players: 1 }, { id: 'p-temp', players: 2, persistent: false }]);
    expect((await list()).map((r) => r.id)).toContain('p-temp');
    await heartbeat('gs-1', [{ id: 'main', players: 1 }]);
    expect((await list()).map((r) => r.id)).not.toContain('p-temp');
    const [row] = await t.db.select().from(rooms).where(eq(rooms.id, 'p-temp'));
    expect(row).toMatchObject({ players: 0, serverId: 'gs-1' });
  });

  it('sala da plataforma fora do ar abre no servidor menos carregado, pelo ticket', async () => {
    await heartbeat('gs-1', [{ id: 'main', players: 12 }]);
    await heartbeat('gs-2', [], 'eu');
    // Ranked não está no ar, mas é da plataforma: aparece e abre sob demanda
    expect((await list('?mode=ranked')).map((r) => r.id)).toEqual(['ranked']);
    const res = await post('/rooms/ranked/join', {}, true);
    expect(res.statusCode).toBe(200);
    expect(res.json().wsUrl).toBe('ws://gs-2.test/rooms/ranked');
    expect(claims(res.json().ticket, 'ranked').spawn).toEqual({ name: 'Ranked', mode: 'ranked', preset: 'ranked', maxPlayers: 16, persistent: true });
    // o segundo jogador vai para o mesmo servidor, mesmo antes do heartbeat da sala
    await heartbeat('gs-2', [], 'eu');
    await t.db.update(gameServers).set({ players: 0 }).where(eq(gameServers.id, 'gs-1'));
    expect((await post('/rooms/ranked/join', {}, true)).json().wsUrl).toBe('ws://gs-2.test/rooms/ranked');
    // no ar, o ticket não pede abertura
    const online = await post('/rooms/main/join', { name: 'Ana' });
    expect(online.json().wsUrl).toBe('ws://gs-1.test/rooms/main');
    expect(claims(online.json().ticket, 'main').spawn).toBeUndefined();
  });

  it('servidor drenando (maxRooms 0, OG-103) não recebe salas novas, nem a que já esteve nele', async () => {
    // gs-2 começou a drenar e já fechou a ranked; gs-1 segue normal
    await heartbeat('gs-2', [], 'eu', 0);
    await heartbeat('gs-1', [{ id: 'main', players: 12 }]);
    await t.db.update(rooms).set({ lastHeartbeatAt: null }).where(eq(rooms.id, 'ranked'));
    const res = await post('/rooms/ranked/join', {}, true);
    expect(res.statusCode).toBe(200);
    expect(res.json().wsUrl).toBe('ws://gs-1.test/rooms/ranked');
  });

  it('"Jogar agora" junta jogadores na sala pública mais cheia do modo', async () => {
    await t.db
      .insert(rooms)
      .values([
        { id: 'c-a', name: 'A', mode: 'casual', preset: 'classic', maxPlayers: 16 },
        { id: 'c-b', name: 'B', mode: 'casual', preset: 'classic', maxPlayers: 16 },
        { id: 'c-full', name: 'Cheia', mode: 'casual', preset: 'classic', maxPlayers: 16 },
      ])
      .onConflictDoNothing();
    await heartbeat('gs-1', [{ id: 'main', players: 2 }, { id: 'c-a', players: 5 }, { id: 'c-b', players: 9 }, { id: 'c-full', players: 16 }]);
    const res = await post('/rooms/quick-join', { mode: 'casual', name: 'Rápido' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ roomId: 'c-b', name: 'Rápido*', guest: true });
    // Ranked: convidado precisa de conta; com conta, cai na sala da plataforma (aberta sob demanda)
    expect((await post('/rooms/quick-join', { mode: 'ranked', name: 'Rápido' })).json().error).toBe('account_required');
    const ranked = await post('/rooms/quick-join', { mode: 'ranked' }, true);
    expect(ranked.json()).toMatchObject({ roomId: 'ranked', wsUrl: 'ws://gs-1.test/rooms/ranked' });
  });

  it('cria sala privada Casual em menos de 1 s, com senha e mapas próprios', async () => {
    await heartbeat('gs-1', [{ id: 'main', players: 2 }]);
    expect((await post('/rooms', { name: 'Treino', preset: 'classic' })).statusCode).toBe(401);
    expect((await post('/rooms', { name: 'Treino', preset: 'ranked' }, true)).json().error).toBe('invalid_preset');

    const begin = performance.now();
    const res = await post('/rooms', { name: 'Treino da tarde', preset: 'duel', password: 'segredo', maps: ['outgun1', 'coliseu'] }, true);
    expect(performance.now() - begin).toBeLessThan(1000);
    expect(res.statusCode).toBe(201);
    const { room, inviteUrl } = res.json();
    expect(room).toMatchObject({ name: 'Treino da tarde', mode: 'casual', preset: 'duel', hasPassword: true, maxPlayers: 2, online: false, region: 'eu' });
    expect(room.id).toMatch(/^p-[a-z0-9]{8}$/);
    expect(inviteUrl).toBe(`http://localhost:5173/rooms/${room.id}`);
    // a página do convite acha a sala mesmo fora do lobby
    expect((await app.inject(`/rooms/${room.id}`)).json().room).toMatchObject({ id: room.id, hasPassword: true, online: false });
    expect((await app.inject('/regions')).json()).toEqual({ regions: [{ region: 'eu', pingUrl: 'http://gs-1.test/health' }] });

    // fora do lobby até abrir; entra com a senha e o ticket abre a sala com os mapas pedidos
    expect((await list()).map((r) => r.id)).not.toContain(room.id);
    expect((await post(`/rooms/${room.id}/join`, { name: 'Bia' })).json().error).toBe('password_required');
    const join = await post(`/rooms/${room.id}/join`, { name: 'Bia', password: 'segredo' });
    expect(join.json().wsUrl).toBe(`ws://gs-1.test/rooms/${room.id}`);
    expect(claims(join.json().ticket, room.id).spawn).toEqual({ name: 'Treino da tarde', mode: 'casual', preset: 'duel', maxPlayers: 2, persistent: false, maps: ['outgun1', 'coliseu'] });
    // só o dono recebe o direito de mudar as regras (OG-049)
    expect(claims(join.json().ticket, room.id).owner).toBeUndefined();
    const owner = await post(`/rooms/${room.id}/join`, { password: 'segredo' }, true);
    expect(claims(owner.json().ticket, room.id).owner).toBe(true);
  });

  it('sala privada abandonada há 1 h é apagada; a da plataforma fica', async () => {
    const old = new Date(Date.now() - 61 * 60_000);
    await t.db.insert(rooms).values({ id: 'p-velha', name: 'Velha', mode: 'casual', preset: 'classic', maxPlayers: 8, lastHeartbeatAt: old });
    await t.db.update(rooms).set({ lastHeartbeatAt: old }).where(eq(rooms.id, 'ranked'));
    await heartbeat('gs-1', []);
    const ids = (await t.db.select({ id: rooms.id }).from(rooms)).map((r) => r.id);
    expect(ids).not.toContain('p-velha');
    expect(ids).toContain('ranked');
  });

  it('sala de lobby Ranked (OG-252): formato e série, fase na lista, conta antes da senha, em jogo recusa, fechada some', async () => {
    await heartbeat('gs-1', []);
    expect((await post('/rooms/ranked', { name: 'x', format: '3x3', bestOf: 3 })).statusCode).toBe(401);
    expect((await post('/rooms/ranked', { name: 'x', format: '6x6', bestOf: 3 }, true)).statusCode).toBe(400);
    const created = await post('/rooms/ranked', { name: 'Treino nn', format: '3x3', bestOf: 3, password: 'segredo' }, true);
    expect(created.statusCode).toBe(201);
    const room = created.json().room;
    expect(room).toMatchObject({ mode: 'ranked', preset: 'ranked', maxPlayers: 6, format: '3x3', bestOf: 3, phase: 'lobby', hasPassword: true });
    // convidado é recusado antes da senha; senha errada não diz nada da sala
    expect((await post(`/rooms/${room.id}/join`, { name: 'Ana' })).json().error).toBe('account_required');
    expect((await post(`/rooms/${room.id}/join`, { password: 'errada' }, true)).json()).toEqual({ error: 'wrong_password', message: 'wrong room password' });
    const ok = await post(`/rooms/${room.id}/join`, { password: 'segredo' }, true);
    expect(ok.statusCode).toBe(200);
    expect(claims(ok.json().ticket, room.id).spawn).toMatchObject({ mode: 'ranked', preset: 'ranked', maxPlayers: 6, ranked: { format: '3x3', bestOf: 3 } });
    await heartbeat('gs-1', [{ id: room.id, players: 6, mode: 'ranked', preset: 'ranked', persistent: false, maxPlayers: 6, phase: 'game' }]);
    expect((await list('?mode=ranked&format=3x3')).find((r) => r.id === room.id)).toMatchObject({ online: true, players: 6, phase: 'game' });
    expect((await list('?format=5x5')).some((r) => r.id === room.id)).toBe(false);
    expect((await post(`/rooms/${room.id}/join`, { password: 'segredo' }, true)).json().error).toBe('room_in_game');
    // "Jogar agora" do Ranked não cai em sala de lobby (RN-RKL-05: entra-se pela lista)
    expect((await post('/rooms/quick-join', { mode: 'ranked' }, true)).json().roomId).not.toBe(room.id);
    // o servidor fechou a sala (série acabada ou lobby vazio): ela não reabre
    await heartbeat('gs-1', []);
    expect(await t.db.select().from(rooms).where(eq(rooms.id, room.id))).toEqual([]);
  });
});
