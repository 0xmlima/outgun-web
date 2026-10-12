// SPDX-License-Identifier: GPL-2.0-or-later
// Integração com WebSocket de verdade (uWS + cliente WebSocket do Node).
import { fileURLToPath } from 'node:url';
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION, type AnyMessage } from '@outgun/protocol';
import { Position } from '@outgun/sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { percentile } from './loop.js';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer, type RunningServer } from './server.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1']);
let manager: RoomManager;
let server: RunningServer;

beforeAll(async () => {
  manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 3 });
  manager.create({ id: 'main', preset: 'classic', maps, maxPlayers: 32, persistent: true });
  manager.create({ id: 'ranked', preset: 'ranked', maps, maxPlayers: 16, persistent: true });
  manager.start();
  server = await startServer({ port: 0, host: '127.0.0.1', manager, devTickets: true });
});

afterAll(() => {
  manager.stop();
  server.close();
});

class Client {
  readonly ws: WebSocket;
  readonly received: AnyMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private readonly opened: Promise<void>;

  constructor(room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${server.port}/rooms/${room}`);
    this.ws.binaryType = 'arraybuffer';
    this.opened = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('falha ao conectar'));
    });
    this.ws.onmessage = (e) => {
      const r = decodeFrame(new Uint8Array(e.data as ArrayBuffer), 's2c');
      if (!r.ok) throw new Error(r.error);
      this.received.push(...r.messages);
      for (const m of r.messages) if (m.type === 'mapChange') this.send(message('clientReady', {}));
    };
    this.ws.onclose = (e) => (this.closed = { code: e.code, reason: e.reason });
  }

  async hello(ticket: string, protocol = PROTOCOL_VERSION): Promise<void> {
    await this.opened;
    this.send(message('hello', { protocol, ticket, client: 'teste' }));
  }

  send(...m: AnyMessage[]): void {
    this.ws.send(encodeFrame(...m));
  }

  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }

  async until(pred: () => boolean, ms = 3000): Promise<void> {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error('tempo esgotado esperando condição');
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  close(): void {
    this.ws.close();
  }
}

describe('game server', () => {
  it('health, métricas e lista de salas', async () => {
    const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
    expect(health).toMatchObject({ status: 'ok', rooms: 2 });
    const metrics = await (await fetch(`http://127.0.0.1:${server.port}/metrics`)).text();
    expect(metrics).toMatch(/^outgun_tick_lateness_p99_ms /m);
    const rooms = (await (await fetch(`http://127.0.0.1:${server.port}/rooms`)).json()) as { id: string }[];
    expect(rooms.map((r) => r.id).sort()).toEqual(['main', 'ranked']);
  });

  it('recusa versão errada, ticket inválido e convidado no Ranked', async () => {
    const cases: [string, string, number, string][] = [
      ['main', 'dev:a', PROTOCOL_VERSION + 1, 'protocolMismatch'],
      ['main', 'jwt-falso', PROTOCOL_VERSION, 'invalidTicket'],
      ['ranked', 'dev:a', PROTOCOL_VERSION, 'rankedNeedsAccount'],
    ];
    for (const [room, ticket, protocol, reason] of cases) {
      const c = new Client(room);
      await c.hello(ticket, protocol);
      await c.until(() => c.closed !== null);
      expect(c.of('reject')[0]?.reason).toBe(reason);
    }
  });

  it('duas conexões na mesma sala veem o mesmo estado', async () => {
    const a = new Client('main');
    const b = new Client('main');
    await a.hello('dev:Ana');
    await a.until(() => a.of('welcome').length > 0);
    await b.hello('dev:Bia');
    await a.until(() => a.of('welcome').length > 0 && b.of('welcome').length > 0);
    const pa = a.of('welcome')[0]!.pid;
    const pb = b.of('welcome')[0]!.pid;
    await a.until(() => a.of('frame').some((f) => f.self !== null) && b.of('frame').some((f) => f.self !== null));
    // os dois na mesma sala do mapa (o teste mexe no mundo entre ticks, como um teletransporte)
    const room = manager.get('main')!;
    room.world.players[pa]!.pos = new Position(2, 2, 100, 100);
    room.world.players[pb]!.pos = new Position(2, 2, 300, 200);
    const from = room.frame;
    await a.until(() => a.of('frame').some((f) => f.frame > from + 2) && b.of('frame').some((f) => f.frame > from + 2));
    const frame = from + 2;
    const fa = a.of('frame').find((f) => f.frame === frame)!;
    const fb = b.of('frame').find((f) => f.frame === frame)!;
    expect(fa.players.map((p) => p.pid).sort()).toEqual([pa, pb].sort());
    expect(fa.players).toEqual(fb.players);
    a.close();
    b.close();
    await a.until(() => room.playerCount === 0);
  });

  it('32 conexões: tick estável em 100 ms ± 2 ms', async () => {
    const clients = Array.from({ length: 32 }, () => new Client('main'));
    await Promise.all(clients.map((c, i) => c.hello(`dev:Bot${i}`)));
    await clients[0]!.until(() => clients.every((c) => c.of('welcome').length > 0), 5000);
    // todos mandam entrada a cada 100 ms, como o cliente do jogo
    let n = 0;
    const timer = setInterval(() => {
      for (const c of clients) c.send(message('input', { clientFrame: n & 255, controls: 1 + (n % 15), gundir: 0 }));
      n++;
    }, 100);
    await new Promise((r) => setTimeout(r, 3000));
    clearInterval(timer);
    // os últimos 25 ticks, todos com as 32 conexões ativas
    const lateness = manager.loop.stats.recent.slice(-25);
    console.log(`atraso do tick com 32 conexões: p50 ${percentile(lateness, 50).toFixed(2)} ms, p95 ${percentile(lateness, 95).toFixed(2)} ms, máx ${Math.max(...lateness).toFixed(2)} ms`);
    expect(lateness.length).toBeGreaterThanOrEqual(25);
    expect(percentile(lateness, 95)).toBeLessThanOrEqual(2);
    expect(manager.metrics().players).toBe(32);
    // cada cliente recebeu ~30 frames nos 3 s
    for (const c of clients) expect(c.of('frame').length).toBeGreaterThanOrEqual(25);
    for (const c of clients) c.close();
    await clients[0]!.until(() => manager.get('main')!.playerCount === 0);
  }, 20_000);
});
