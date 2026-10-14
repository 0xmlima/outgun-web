// SPDX-License-Identifier: GPL-2.0-or-later
// Telemetria de rede (OG-108): resumo anônimo guardado sem conta nem IP, região pela sala,
// métricas no /metrics e agregado por região no painel.
import { signInternalRequest } from '@outgun/tickets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import { migrateUp } from '../db/migrate.js';
import { netReports } from '../db/schema.js';
import { seed } from '../db/seed.js';
import { MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, pgAdminUrl, type TestDatabase } from '../test/db.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'segredo-de-teste-0123456789';
const report = { room: 'main', version: 'abc123', browser: 'Chrome 130', durationS: 120, pingP50: 130, pingP95: 180, lagP50: 150, lagP95: 210, fpsP5: 55, fpsP50: 60, correctionsPerMin: 1.5, stallSeconds: 3, framesPerSecond: 9.9 };

describe.skipIf(!pgAdminUrl)('telemetria de rede (OG-108)', () => {
  let t: TestDatabase;
  let app: App;

  beforeAll(async () => {
    t = await createTestDatabase();
    await migrateUp(t.sql);
    await seed(t.db);
    app = await buildApp({ config: { ...loadConfig({ INTERNAL_SECRETS: `gs-1:${SECRET}` }), databaseUrl: t.url }, database: t, mailer: new MemoryMailer(), logger: false });
    const body = JSON.stringify({
      server: { wsBaseUrl: 'ws://gs-1.test', region: 'nyc', maxRooms: 10 },
      rooms: [{ id: 'main', name: 'Principal', mode: 'casual', preset: 'classic', maxPlayers: 16, persistent: true, players: 1, map: 'outgun1', wsUrl: 'ws://gs-1.test/rooms/main' }],
    });
    const url = '/internal/rooms/heartbeat';
    await app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...signInternalRequest('gs-1', SECRET, 'POST', url, body) } });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  const send = (payload: object, ip = '10.30.0.1') => app.inject({ method: 'POST', url: '/telemetry', payload, remoteAddress: ip, headers: { origin: ORIGIN } });

  it('guarda o resumo sem dado pessoal; a região vem do servidor da sala', async () => {
    const res = await send({ ...report, name: 'Fulano', accountId: 'x' });
    expect(res.statusCode).toBe(204);
    const [row] = await t.db.select().from(netReports);
    expect(row).toMatchObject({ roomId: 'main', region: 'nyc', pingP50: 130, correctionsPerMin: 1.5, stallSeconds: 3, browser: 'Chrome 130' });
    // a tabela nem tem onde guardar quem mandou
    const columns = await t.sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'net_reports'`;
    expect(columns.map((c) => c.column_name)).not.toEqual(expect.arrayContaining([expect.stringMatching(/user|name|ip|account/)]));
    expect(await send({ ...report, room: 'sala-que-nao-existe', pingP50: null, pingP95: null })).toHaveProperty('statusCode', 204);
  });

  it('valores fora da faixa são recusados', async () => {
    expect((await send({ ...report, lagP50: -1 })).statusCode).toBe(400);
    expect((await send({ ...report, framesPerSecond: 1000 })).statusCode).toBe(400);
  });

  it('vira métrica no /metrics e agregado por região no painel', async () => {
    const metrics = (await app.inject('/metrics')).body;
    expect(metrics).toMatch(/^outgun_client_ping_seconds_count\{region="nyc"\} 1$/m);
    expect(metrics).toMatch(/^outgun_client_stall_seconds_total\{region="nyc"\} 3$/m);
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Admin', password: 'outgun-dev' }, headers: { origin: ORIGIN }, remoteAddress: '10.30.0.9' });
    const cookie = `og_session=${login.cookies.find((c) => c.name === 'og_session')!.value}`;
    const net = (await app.inject({ url: '/admin/network', headers: { cookie } })).json();
    expect(net.regions).toContainEqual({ region: 'nyc', reports: 1, seconds: 120, ping_p50: 130, ping_p95: 180, lag_p50: 150, corrections_per_min: 1.5, fps_p5: 55, stall_pct: 2.5 });
    expect(net.regions).toContainEqual(expect.objectContaining({ region: '?', reports: 1 }));
  });
});
