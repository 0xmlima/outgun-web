// SPDX-License-Identifier: GPL-2.0-or-later
// Anti-cheat (OG-104) contra o servidor de verdade, com um cliente que fala o protocolo cru, como
// um cliente modificado: o que ele pede não muda o que o servidor manda (AOI garantida no servidor),
// e um endereço não abre conexões sem limite.
import { fileURLToPath } from 'node:url';
import { message } from '@outgun/protocol';
import { Position } from '@outgun/sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer, type RunningServer } from './server.js';
import { WsTestClient } from './ws-test-client.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1']);
let manager: RoomManager;
let server: RunningServer;

beforeAll(async () => {
  manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 5, roomDefaults: { reconnectSeconds: 0 } });
  manager.create({ id: 'main', preset: 'classic', maps, maxPlayers: 16, persistent: true });
  manager.start();
  server = await startServer({ port: 0, host: '127.0.0.1', manager, devTickets: true, maxConnectionsPerIp: 3 });
});

afterAll(() => {
  manager.stop();
  server.close();
});

const connect = async (name: string) => {
  const c = new WsTestClient(`ws://127.0.0.1:${server.port}/rooms/main`);
  await c.hello(`dev:${name}`);
  await c.until(() => c.of('welcome').length > 0);
  return { c, pid: c.of('welcome')[0]!.pid };
};

describe('cliente modificado não vê inimigos fora da AOI', () => {
  it('nem pedindo o minimapa inteiro: inimigo sozinho em outra sala não aparece no frame nem no minimapa', async () => {
    const attacker = await connect('Esperto');
    const enemy = await connect('Alvo');
    const room = manager.get('main')!;
    const world = room.world;
    expect(world.teamOf(attacker.pid)).not.toBe(world.teamOf(enemy.pid));
    await attacker.c.until(() => attacker.c.of('frame').some((f) => f.self !== null) && enemy.c.of('frame').some((f) => f.self !== null));

    // o cliente modificado pede todos os jogadores no minimapa em todo frame e manda controles
    attacker.c.send(message('minimapBandwidth', { playersPerFrame: 255 }));
    const far = new Position(world.map.width - 1, world.map.height - 1, 200, 150);
    const near = new Position(0, 0, 200, 150);
    world.players[attacker.pid]!.pos = near;
    world.players[enemy.pid]!.pos = far;
    const from = room.frame;
    for (let i = 0; i < 20; i++) {
      attacker.c.send(message('input', { clientFrame: i, controls: 0, gundir: 0 }));
      await new Promise((r) => setTimeout(r, 50));
      // os dois parados onde o teste os pôs (o mundo anda entre os ticks)
      world.players[attacker.pid]!.pos = near;
      world.players[enemy.pid]!.pos = far;
    }
    await attacker.c.until(() => attacker.c.of('frame').some((f) => f.frame > from + 8));
    const frames = attacker.c.of('frame').filter((f) => f.frame > from + 1);
    expect(frames.length).toBeGreaterThan(5);
    for (const f of frames) {
      expect(f.players.map((p) => p.pid)).not.toContain(enemy.pid);
      expect(f.minimap.map((p) => p.pid)).not.toContain(enemy.pid);
    }
    for (const m of attacker.c.of('minimapProperties').filter((m) => m.players.length > 0)) expect(m.players.map((p) => p.pid)).not.toContain(enemy.pid);
    expect(attacker.c.closed).toBeNull(); // pedir não é motivo de expulsão; só não adianta

    // controle: na mesma sala o inimigo aparece (o teste não passa à toa)
    const before = room.frame;
    for (let i = 0; i < 5; i++) {
      world.players[enemy.pid]!.pos = new Position(0, 0, 300, 200);
      await new Promise((r) => setTimeout(r, 100));
    }
    await attacker.c.until(() => attacker.c.of('frame').some((f) => f.frame > before + 2 && f.players.some((p) => p.pid === enemy.pid)));
    attacker.c.close();
    enemy.c.close();
    await attacker.c.until(() => room.playerCount === 0);
  });

  it('mensagem do servidor forjada pelo cliente é expulsão (client_misbehavior)', async () => {
    const { c } = await connect('Forjador');
    // um `frame` (só o servidor manda) no canal do cliente não decodifica como c2s
    c.ws.send(new Uint8Array([30, 0, 0, 0, 0]));
    await c.until(() => c.closed !== null);
    expect(c.closed?.code).toBe(4003);
  });
});

describe('limite de conexões por endereço', () => {
  it('a quarta conexão do mesmo IP é recusada; fechar uma libera a vaga', async () => {
    const open = await Promise.all([0, 1, 2].map((i) => connect(`Ip${i}`)));
    const extra = new WsTestClient(`ws://127.0.0.1:${server.port}/rooms/main`);
    await expect(extra.hello('dev:Ip3')).rejects.toThrow();
    open[0]!.c.close();
    await open[0]!.c.until(() => open[0]!.c.closed !== null);
    await new Promise((r) => setTimeout(r, 50));
    const again = await connect('Ip4');
    expect(again.pid).toBeGreaterThanOrEqual(0);
    for (const o of [...open.slice(1), again]) o.c.close();
  });
});
