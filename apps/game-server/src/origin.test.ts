// SPDX-License-Identifier: GPL-2.0-or-later
// Origem do WebSocket (OG-311, OWASP WebSocket Security): navegador vindo de outro site é recusado no
// upgrade; a origem do site e clientes sem `Origin` (bots, carga) passam.
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer, type RunningServer } from './server.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);
let manager: RoomManager;
let server: RunningServer;

beforeAll(async () => {
  manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 5, roomDefaults: { reconnectSeconds: 0 } });
  manager.create({ id: 'main', preset: 'classic', maps, maxPlayers: 16, persistent: true });
  manager.start();
  server = await startServer({ port: 0, host: '127.0.0.1', manager, devTickets: true, allowedOrigins: ['https://outgunweb.com.br/'] });
});

afterAll(() => {
  manager.stop();
  server.close();
});

/** Status HTTP do upgrade (101 = aceito). */
function upgrade(path: string, origin?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port: server.port,
      path,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...(origin ? { Origin: origin } : {}),
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('origem do WebSocket', () => {
  it('jogador: outro site é recusado com 403', async () => {
    expect(await upgrade('/rooms/main', 'https://site-malicioso.example')).toBe(403);
  });
  it('jogador: a origem do site (sem diferença de maiúsculas) e a ausência de origem passam', async () => {
    expect(await upgrade('/rooms/main', 'https://OutgunWeb.com.br')).toBe(101);
    expect(await upgrade('/rooms/main')).toBe(101);
  });
  it('espectador: mesma regra', async () => {
    expect(await upgrade('/rooms/main/spectate', 'https://site-malicioso.example')).toBe(403);
    expect(await upgrade('/rooms/main/spectate', 'https://outgunweb.com.br')).toBe(101);
  });
});
