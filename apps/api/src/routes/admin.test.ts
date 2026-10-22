// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin (OG-087): acesso por papel em todas as rotas, auditoria de toda ação e o caminho
// dos comandos até o game server (resposta do heartbeat) e de volta (confirmação → ban).
import { signInternalRequest } from '@outgun/tickets';
import { count, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { adminActions, adminCommands, bans, gameServers, casualPresetVersions, users } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'segredo-de-teste-0123456789';
const DEVICE = 'cd'.repeat(16);

describe.skipIf(!pgAdminUrl)('painel admin (OG-087)', () => {
  let t: TestDatabase;
  let app: App;
  const cookies: Record<'admin' | 'mod' | 'player', string> = { admin: '', mod: '', player: '' };

  const login = async (username: string) => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'outgun-dev' }, headers: { origin: ORIGIN }, remoteAddress: `10.8.0.${username.length}` });
    return `og_session=${res.cookies.find((c) => c.name === 'og_session')!.value}`;
  };

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    await t.db.update(users).set({ isModerator: true }).where(eq(users.username, 'Jogador2'));
    const config = { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url };
    app = await buildApp({ config, database: t, mailer: new MemoryMailer(), logger: false });
    cookies.admin = await login('Admin');
    cookies.mod = await login('Jogador2');
    cookies.player = await login('Jogador1');
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, who?: keyof typeof cookies, payload?: unknown) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) } });

  const roster = [
    { uid: 7, name: 'Visita*', team: 0, bot: false, muted: 0 },
    { uid: 8, name: 'BOT Taywor', team: 1, bot: true, muted: 0 },
  ];
  const heartbeat = (acks: unknown[] = [], server: Record<string, unknown> = {}) => {
    const body = JSON.stringify({
      server: { wsBaseUrl: 'ws://gs-1.test', region: 'eu', maxRooms: 10, ...server },
      rooms: [{ id: 'main', name: 'Principal', mode: 'casual', preset: 'classic', maxPlayers: 16, persistent: true, players: 2, map: 'outgun1', wsUrl: 'ws://gs-1.test/rooms/main', roster }],
      acks,
    });
    const url = '/internal/rooms/heartbeat';
    return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
  };
  const auditCount = async () => (await t.db.select({ n: count() }).from(adminActions))[0]!.n;
  const lastAudit = async () => (await t.db.select().from(adminActions).orderBy(desc(adminActions.id)).limit(1))[0]!;

  it('cada rota exige o papel certo: sem sessão 401, jogador 403, moderador só o dele', async () => {
    await heartbeat();
    const routes: [method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, role: 'moderator' | 'admin', body?: unknown][] = [
      ['GET', '/admin/me', 'moderator'],
      ['GET', '/admin/rooms', 'moderator'],
      ['POST', '/admin/rooms/main/commands', 'moderator', { kind: 'mute', uid: 7 }],
      ['GET', '/admin/reports', 'moderator'],
      ['GET', '/admin/bans', 'moderator'],
      ['GET', '/admin/audit', 'moderator'],
      ['GET', '/admin/presets', 'moderator'],
      ['GET', '/admin/rotations', 'moderator'],
      ['POST', '/admin/broadcast', 'admin', { text: 'oi' }],
      ['POST', '/admin/bans', 'admin', { ip: '10.66.0.1', reason: 'x' }],
      // presets, rotações e mapas: moderador também (D-70)
      ['PUT', '/admin/presets/permissao', 'moderator', { description: 'Permissão', overrides: 'rocket_damage 140' }],
      ['DELETE', '/admin/presets/permissao', 'moderator'],
      ['PUT', '/admin/rotations/ranked:5x5', 'moderator', { maps: ['outgun1'] }],
      ['GET', '/admin/maps', 'moderator'],
      ['PUT', '/admin/maps/permissao', 'moderator', { text: 'P width 1\nP height 1\nP title P\nS 16 12\nflag 0 0 0 1 1\nspawn 0 0 0 8 6\nflag 1 0 0 15 11\nspawn 1 0 0 8 3\n' }],
      ['DELETE', '/admin/maps/permissao', 'moderator'],
      ['PUT', '/admin/users/Jogador1/role', 'admin', { role: 'player' }],
      ['GET', '/admin/users', 'admin'],
    ];
    for (const [method, url, role, body] of routes) {
      expect((await call(method, url, undefined, body)).statusCode, `${method} ${url} sem sessão`).toBe(401);
      expect((await call(method, url, 'player', body)).statusCode, `${method} ${url} jogador`).toBe(403);
      const mod = (await call(method, url, 'mod', body)).statusCode;
      if (role === 'moderator') expect(mod, `${method} ${url} moderador`).toBeLessThan(400);
      else expect(mod, `${method} ${url} moderador`).toBe(403);
      expect((await call(method, url, 'admin', body)).statusCode, `${method} ${url} admin`).toBeLessThan(method === 'DELETE' ? 405 : 400);
    }
    // moderador não dá ban de plataforma, nem pela sala
    expect((await call('POST', '/admin/rooms/main/commands', 'mod', { kind: 'ban', uid: 7, platform: true })).statusCode).toBe(403);
  });

  it('kick e ban pela sala: auditoria na hora, comando no heartbeat, ban criado com a confirmação', async () => {
    await heartbeat();
    const before = await auditCount();
    const ban = await call('POST', '/admin/rooms/main/commands', 'mod', { kind: 'ban', uid: 7, minutes: 30, reason: 'trapaça' });
    expect(ban.statusCode).toBe(202);
    expect(await auditCount()).toBe(before + 1);
    expect(await lastAudit()).toMatchObject({ actorName: 'Jogador2', action: 'ban', targetName: 'Visita*', roomId: 'main', reason: 'trapaça', durationSeconds: 1800 });
    // bot e uid inexistente não são alvo; ban de sala acima de 7 dias não
    expect((await call('POST', '/admin/rooms/main/commands', 'mod', { kind: 'kick', uid: 8 })).statusCode).toBe(422);
    expect((await call('POST', '/admin/rooms/main/commands', 'mod', { kind: 'kick', uid: 99 })).statusCode).toBe(422);
    expect((await call('POST', '/admin/rooms/main/commands', 'mod', { kind: 'ban', uid: 7, minutes: 8 * 24 * 60 })).statusCode).toBe(422);

    const id = ban.json().commandId as number;
    const hb = (await heartbeat()).json();
    const delivered = hb.commands.find((c: { id: number }) => c.id === id);
    expect(delivered).toMatchObject({ roomId: 'main', kind: 'ban', uid: 7, minutes: 30, reason: 'trapaça', actor: 'Jogador2' });
    // entregue uma vez só
    expect((await heartbeat()).json().commands.some((c: { id: number }) => c.id === id)).toBe(false);
    expect((await call('GET', `/admin/commands/${id}`, 'mod')).json().status).toBe('delivered');

    await heartbeat([{ id, ok: true, target: { name: 'Visita*', ip: '10.7.7.7', device: DEVICE } }]);
    expect((await call('GET', `/admin/commands/${id}`, 'mod')).json()).toMatchObject({ status: 'done', result: { ok: true, target: 'Visita*' } });
    const [row] = await t.db.select().from(bans).where(eq(bans.deviceHash, DEVICE));
    expect(row).toMatchObject({ ip: '10.7.7.7', roomId: 'main', reason: 'trapaça' });
    expect(row!.expiresAt!.getTime() - row!.createdAt.getTime()).toBe(30 * 60_000);
  });

  it('presets Casual: versionados, validados, auditados e entregues aos game servers; os do jogo não mudam', async () => {
    const before = await auditCount();
    expect((await call('PUT', '/admin/presets/ranked', 'admin', { description: 'x', overrides: '' })).statusCode).toBe(409);
    expect((await call('PUT', '/admin/presets/classic', 'admin', { description: 'x', overrides: '' })).statusCode).toBe(409);
    const bad = await call('PUT', '/admin/presets/ruim', 'admin', { description: 'Ruim', overrides: 'server_name X' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().problems).toEqual(['server_name: configuração do servidor, não de preset']);
    expect(await auditCount()).toBe(before);

    expect((await call('PUT', '/admin/presets/sniper', 'admin', { description: 'Sniper: dano alto', overrides: 'rocket_damage 200' })).json()).toEqual({ id: 'sniper', version: 1 });
    expect((await call('PUT', '/admin/presets/sniper', 'admin', { description: 'Sniper: dano alto', overrides: 'rocket_damage 250' })).json().version).toBe(2);
    expect(await auditCount()).toBe(before + 2);
    expect(await lastAudit()).toMatchObject({ action: 'preset', details: { preset: 'sniper', version: 2, overrides: 'rocket_damage 250' } });
    const versions = await t.db.select().from(casualPresetVersions).where(eq(casualPresetVersions.presetId, 'sniper'));
    expect(versions.map((v) => [v.version, v.overrides])).toEqual([
      [1, 'rocket_damage 200'],
      [2, 'rocket_damage 250'],
    ]);
    expect((await heartbeat()).json().config.presets).toContainEqual({ id: 'sniper', description: 'Sniper: dano alto', overrides: 'rocket_damage 250' });
    expect((await app.inject('/presets')).json().presets.map((p: { id: string }) => p.id)).toEqual(['classic', 'duel', 'insta', 'chaos', 'carnage', 'sniper']);

    // sala privada com o preset do painel
    const room = await call('POST', '/rooms', 'player', { name: 'Tiro', preset: 'sniper' });
    expect(room.statusCode).toBe(201);
    expect(room.json().room.preset).toBe('sniper');

    expect((await call('DELETE', '/admin/presets/sniper', 'admin')).statusCode).toBe(204);
    expect((await heartbeat()).json().config.presets.map((p: { id: string }) => p.id)).not.toContain('sniper');
    expect((await call('GET', '/admin/presets/sniper/versions', 'mod')).json().versions[0]).toMatchObject({ version: 3, deleted: true, changedBy: 'Admin' });
  });

  it('heartbeat traz as rotações padrão do servidor e o painel parte delas (OG-378)', async () => {
    expect((await heartbeat([], { rotations: { casual: ['outgun1', 'gun dance'], ranked: ['outgun1'] } })).statusCode).toBe(200);
    expect((await call('GET', '/admin/rotations', 'mod')).json().server).toEqual({ casual: ['outgun1', 'gun dance'], ranked: ['outgun1'] });
    // servidor antigo (sem o campo) não apaga as que já informou
    await heartbeat();
    expect((await call('GET', '/admin/rotations', 'mod')).json().server.casual).toEqual(['outgun1', 'gun dance']);
  });

  it('rotação Ranked por formato (OG-251): formato vazio e mapa inexistente recusados, mudança auditada e no heartbeat', async () => {
    await t.db.update(gameServers).set({ maps: ['outgun1', 'gun dance', 'The Blunt'] }).where(eq(gameServers.id, 'gs-1'));
    expect((await call('GET', '/admin/rotations', 'mod')).json().catalog).toEqual(['gun dance', 'outgun1', 'The Blunt']);
    expect((await call('PUT', '/admin/rotations/ranked:3x3', 'admin', { maps: [] })).statusCode).toBe(400);
    expect((await call('PUT', '/admin/rotations/ranked:3x3', 'admin', { maps: ['  '] })).json()).toMatchObject({ error: 'empty_rotation' });
    expect((await call('PUT', '/admin/rotations/ranked:3x3', 'admin', { maps: ['outgun1', 'nao existe'] })).json()).toMatchObject({ error: 'unknown_map', message: 'unknown maps: nao existe' });
    expect((await call('PUT', '/admin/rotations/ranked:6x6', 'admin', { maps: ['outgun1'] })).statusCode).toBe(400);
    expect((await call('PUT', '/admin/rotations/ranked:4x4', 'player', { maps: ['The Blunt'] })).statusCode).toBe(403);
    const before = await auditCount();
    expect((await call('PUT', '/admin/rotations/ranked:4x4', 'admin', { maps: ['The Blunt', 'outgun1', 'random_map 3 3'] })).json()).toMatchObject({ key: 'ranked:4x4', version: 1 });
    expect((await call('PUT', '/admin/rotations/ranked:3x3', 'admin', { maps: ['outgun1'] })).json()).toMatchObject({ key: 'ranked:3x3', version: 1 });
    expect(await auditCount()).toBe(before + 2);
    expect(await lastAudit()).toMatchObject({ action: 'rotation', reason: 'ranked:3x3' });
    const rotations = (await heartbeat()).json().config.rotations;
    expect(rotations['ranked:4x4']).toEqual(['The Blunt', 'outgun1', 'random_map 3 3']);
    expect(rotations['ranked:3x3']).toEqual(['outgun1']);
    await t.db.update(gameServers).set({ maps: [] }).where(eq(gameServers.id, 'gs-1'));
  });

  it('rotação, mensagem a todas as salas, ban de plataforma e papel: auditados', async () => {
    const before = await auditCount();
    expect((await call('PUT', '/admin/rotations/ranked', 'admin', { maps: ['outgun1', 'gun dance'] })).json()).toMatchObject({ key: 'ranked', version: 1 });
    expect((await heartbeat()).json().config.rotations.ranked).toEqual(['outgun1', 'gun dance']);
    await heartbeat();
    expect((await call('POST', '/admin/broadcast', 'admin', { text: 'Manutenção às 22h' })).json()).toEqual({ rooms: 1 });
    expect((await heartbeat()).json().commands).toContainEqual(expect.objectContaining({ kind: 'message', text: 'Manutenção às 22h' }));
    const ban = await call('POST', '/admin/bans', 'admin', { username: 'jogador1', minutes: 60, reason: 'spam' });
    expect(ban.statusCode).toBe(201);
    expect((await call('DELETE', `/admin/bans/${ban.json().id}`, 'mod')).statusCode).toBe(403); // de plataforma: só admin
    expect((await call('DELETE', `/admin/bans/${ban.json().id}`, 'admin')).statusCode).toBe(204);
    expect((await call('PUT', '/admin/users/Admin/role', 'admin', { role: 'player' })).statusCode).toBe(422); // o próprio papel não
    expect((await call('PUT', '/admin/users/Jogador1/role', 'admin', { role: 'moderator' })).json()).toEqual({ username: 'Jogador1', role: 'moderator' });
    // lista por papel (OG-388): admin, moderador, jogador; busca pelo nome
    const listed = (await call('GET', '/admin/users', 'admin')).json();
    const roles = listed.users.map((u: { role: string }) => u.role);
    expect(roles).toEqual([...roles].sort((a: string, b: string) => ['admin', 'moderator', 'player'].indexOf(a) - ['admin', 'moderator', 'player'].indexOf(b)));
    expect(listed.users.find((u: { username: string }) => u.username === 'Jogador1')).toMatchObject({ role: 'moderator' });
    expect((await call('GET', '/admin/users?busca=jogador1', 'admin')).json().users.map((u: { username: string }) => u.username)).toEqual(['Jogador1']);
    expect((await call('GET', '/admin/me', 'player')).json()).toEqual({ role: 'moderator' }); // a sessão do Jogador1 já vale como moderador
    await call('PUT', '/admin/users/Jogador1/role', 'admin', { role: 'player' });
    const actions = (await t.db.select().from(adminActions).orderBy(desc(adminActions.id)).limit((await auditCount()) - before)).map((a) => a.action).reverse();
    expect(actions).toEqual(['rotation', 'broadcast', 'platform-ban', 'unban', 'role', 'role']);
    const audit = (await call('GET', '/admin/audit?limit=3', 'mod')).json().entries;
    expect(audit.map((e: { action: string }) => e.action)).toEqual(['role', 'role', 'unban']);
    expect(await t.db.select({ n: count() }).from(adminCommands)).toBeTruthy();
  });

  it('moderador edita presets e a rotação Casual; sala privada só escolhe mapas da rotação (OG-365, D-69, D-70)', async () => {
    await t.db.update(gameServers).set({ maps: ['outgun1', 'gun dance', 'The Blunt'] }).where(eq(gameServers.id, 'gs-1'));
    expect((await call('PUT', '/admin/presets/festival', 'player', { description: 'Festival', overrides: '' })).statusCode).toBe(403);
    expect((await call('PUT', '/admin/presets/festival', 'mod', { description: 'Festival: tudo liberado', overrides: 'rocket_damage 100' })).json()).toEqual({ id: 'festival', version: 1 });
    expect(await lastAudit()).toMatchObject({ action: 'preset', details: { preset: 'festival' } });
    // sem rotação Casual no painel: escolha livre
    expect((await app.inject('/rotation')).json()).toEqual({ maps: null, published: [] });
    expect((await call('POST', '/rooms', 'player', { name: 'Livre', preset: 'festival', maps: ['The Blunt'] })).statusCode).toBe(201);
    expect((await call('PUT', '/admin/rotations/casual', 'mod', { maps: ['outgun1', 'gun dance'] })).json()).toMatchObject({ key: 'casual', version: 1 });
    expect((await app.inject('/rotation')).json()).toEqual({ maps: ['outgun1', 'gun dance'], published: [] });
    expect((await call('POST', '/rooms', 'player', { name: 'Fora', preset: 'festival', maps: ['The Blunt', 'outgun1'] })).json()).toMatchObject({ error: 'map_not_in_rotation', message: 'not in the casual rotation: The Blunt' });
    const ok = await call('POST', '/rooms', 'player', { name: 'Dentro', preset: 'festival', maps: ['gun dance'] });
    expect([ok.statusCode, ok.json().room.preset]).toEqual([201, 'festival']);
    await t.db.update(gameServers).set({ maps: [] }).where(eq(gameServers.id, 'gs-1'));
  });

  it('mapas .txt da moderação (OG-366, D-70): conferidos pelo parser, publicados, na rotação e servidos em Latin-1', async () => {
    const text = 'P width 1\nP height 1\nP title Teste\nP author Moderação\nS 16 12\nflag 0 0 0 1 1\nspawn 0 0 0 8 6\nflag 1 0 0 15 11\nspawn 1 0 0 8 3\n';
    await t.db.update(gameServers).set({ maps: ['outgun1', 'gun dance'] }).where(eq(gameServers.id, 'gs-1'));
    expect((await call('POST', '/admin/maps/check', 'player', { name: 'teste', text })).statusCode).toBe(403);
    expect((await call('POST', '/admin/maps/check', 'mod', { name: 'teste', text })).json()).toEqual({ ok: true, errors: [], preview: { title: 'Teste', author: 'Moderação', width: 1, height: 1, crc: expect.any(Number) } });
    expect((await call('POST', '/admin/maps/check', 'mod', { name: 'teste', text: 'P width 1\nP height x\n' })).json()).toEqual({ ok: false, errors: ['Invalid map line: P height x'] });
    expect((await call('PUT', '/admin/maps/outgun1', 'mod', { text })).json()).toMatchObject({ error: 'builtin_map' });
    expect((await call('PUT', '/admin/maps/mapgen_1', 'mod', { text })).statusCode).toBe(422);
    expect((await call('PUT', '/admin/maps/teste', 'mod', { text: 'P width 1\nP height x\n' })).json()).toMatchObject({ error: 'invalid_map', problems: ['Invalid map line: P height x'] });
    const saved = await call('PUT', '/admin/maps/teste', 'mod', { text });
    expect(saved.json()).toMatchObject({ name: 'teste', version: 1, title: 'Teste' });
    expect(await lastAudit()).toMatchObject({ action: 'map', details: { map: 'teste', version: 1 } });
    expect((await call('PUT', '/admin/maps/teste', 'mod', { text: text.replace('8 3', '8 4') })).json().version).toBe(2);
    // servido em Latin-1, com o CRC; entra no catálogo e na rotação
    const served = await app.inject('/maps/teste');
    const crc = (await call('GET', '/admin/maps', 'mod')).json().maps.find((m: { name: string }) => m.name === 'teste').crc;
    expect([served.statusCode, served.headers['x-map-crc'], served.rawPayload.toString('latin1')]).toEqual([200, String(crc), text.replace('8 3', '8 4')]);
    expect((await call('GET', '/admin/rotations', 'mod')).json().catalog).toContain('teste');
    // publicado entra na escolha livre de "Criar sala" (OG-377)
    expect((await app.inject('/rotation')).json().published).toEqual(['teste']);
    expect((await call('PUT', '/admin/rotations/casual', 'mod', { maps: ['outgun1', 'teste'] })).statusCode).toBe(200);
    expect((await call('DELETE', '/admin/maps/teste', 'mod')).json()).toMatchObject({ error: 'map_in_rotation' });
    await call('PUT', '/admin/rotations/casual', 'mod', { maps: ['outgun1', 'gun dance'] });
    expect((await call('DELETE', '/admin/maps/teste', 'mod')).statusCode).toBe(204);
    expect((await app.inject('/maps/teste')).statusCode).toBe(404);
    expect((await call('GET', '/admin/maps/teste/versions', 'mod')).json().versions.map((v: { version: number; deleted: boolean }) => [v.version, v.deleted])).toEqual([[3, true], [2, false], [1, false]]);
    await t.db.update(gameServers).set({ maps: [] }).where(eq(gameServers.id, 'gs-1'));
  });
});
