// SPDX-License-Identifier: GPL-2.0-or-later
// Várias máquinas no mesmo domínio (Fly, OG-103): a sala responde em /m/<instância>/rooms/<id> e um
// pedido entregue à máquina errada recebe `fly-replay` para o proxy reenviar à certa.
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer, type RunningServer } from './server.js';
import { WsTestClient } from './ws-test-client.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1']);
let manager: RoomManager;
let server: RunningServer;

beforeAll(async () => {
  manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 2 });
  manager.create({ id: 'main', preset: 'classic', maps, maxPlayers: 16, persistent: true });
  manager.start();
  server = await startServer({ port: 0, host: '127.0.0.1', manager, devTickets: true, instanceId: 'e784079b' });
});

afterAll(() => {
  manager.stop();
  server.close();
});

/** Pedido de upgrade WebSocket cru: devolve status e cabeçalhos da resposta. */
const upgrade = (path: string) =>
  new Promise<{ status: number; replay: string | undefined }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.port, path, headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, replay: res.headers['fly-replay'] as string | undefined });
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, replay: res.headers['fly-replay'] as string | undefined });
    });
    req.on('error', reject);
    req.end();
  });

describe('endereço por instância (OG-103)', () => {
  it('a própria instância atende em /m/<id>/rooms/<sala>', async () => {
    const c = new WsTestClient(`ws://127.0.0.1:${server.port}/m/e784079b/rooms/main`);
    await c.hello('dev:Ana');
    await c.until(() => c.of('welcome').length > 0);
    c.close();
  });

  it('outra instância: 409 com fly-replay; id malformado: 404', async () => {
    expect(await upgrade('/m/0a1b2c3d/rooms/main')).toEqual({ status: 409, replay: 'instance=0a1b2c3d' });
    expect(await upgrade('/m/0a1b2c3d/rooms/main/spectate')).toEqual({ status: 409, replay: 'instance=0a1b2c3d' });
    expect((await upgrade('/m/X%0D%0Ay/rooms/main')).status).toBe(404);
    expect((await upgrade('/m/e784079b/rooms/main/spectate')).status).toBe(101);
  });
});
