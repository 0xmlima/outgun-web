// SPDX-License-Identifier: GPL-2.0-or-later
// Integração com WebSocket de verdade (uWS + cliente WebSocket do Node).
import { fileURLToPath } from 'node:url';
import { decodeFrame, encodeFrame, message, PROTOCOL_VERSION, type AnyMessage } from '@outgun/protocol';
import { Position } from '@outgun/sim';
import { fromJwks, generateSigningKey, signTicket, toJwks, type TicketInput } from '@outgun/tickets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { percentile } from './loop.js';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { startServer, type RunningServer } from './server.js';
import { makeSpawner } from './spawn.js';

const mapsDir = fileURLToPath(new URL('../../../maps', import.meta.url));
const maps = loadMaps(mapsDir, ['outgun1']);
let manager: RoomManager;
let server: RunningServer;
const apiKey = generateSigningKey('k1');
const publicKeys = fromJwks(toJwks([apiKey]));

beforeAll(async () => {
  // salas sem espera de reconexão (como o original); a reconexão tem sala própria
  manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 3, maxRooms: 4, roomDefaults: { reconnectSeconds: 0 } });
  manager.create({ id: 'main', preset: 'classic', maps, maxPlayers: 32, persistent: true });
  manager.create({ id: 'ranked', preset: 'ranked', maps, maxPlayers: 16, persistent: true });
  manager.create({ id: 'volta', preset: 'classic', maps, maxPlayers: 16, persistent: true, reconnectSeconds: 15 });
  manager.start();
  const spawnRoom = makeSpawner(manager, { mapsDir, rotations: { casual: ['outgun1'], ranked: ['outgun1'] } });
  server = await startServer({ port: 0, host: '127.0.0.1', manager, devTickets: true, ticketKeys: () => publicKeys, spawnRoom });
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

  async hello(ticket: string, protocol = PROTOCOL_VERSION, ...extra: AnyMessage[]): Promise<void> {
    await this.opened;
    this.send(message('hello', { protocol, ticket, client: 'teste' }), ...extra);
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

describe('tickets da API (OG-083)', () => {
  const account: TicketInput = { aud: 'ranked', sub: 'u-1', name: 'Ana', clan: 'XYZ', acct: true, admin: false, ranked: true };
  const rejected = async (room: string, ticket: string) => {
    const c = new Client(room);
    await c.hello(ticket);
    await c.until(() => c.closed !== null);
    return c.of('reject')[0]?.reason;
  };

  it('ticket válido de conta entra no Ranked com o nome do ticket', async () => {
    const c = new Client('ranked');
    await c.hello(signTicket(account, apiKey));
    await c.until(() => c.of('playerJoined').some((m) => m.name === 'Ana'));
    expect(c.of('reject')).toHaveLength(0);
    c.close();
  });

  it('recusa ticket adulterado, de outra sala, vencido, de chave desconhecida ou reutilizado', async () => {
    const [h, p, sig] = signTicket(account, apiKey).split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), name: 'Admin', admin: true })).toString('base64url');
    expect(await rejected('ranked', `${h}.${forged}.${sig}`)).toBe('invalidTicket');
    expect(await rejected('main', signTicket(account, apiKey))).toBe('invalidTicket');
    expect(await rejected('ranked', signTicket(account, apiKey, Date.now() - 120_000))).toBe('invalidTicket');
    expect(await rejected('ranked', signTicket(account, generateSigningKey('k9')))).toBe('invalidTicket');
    const once = signTicket(account, apiKey);
    const first = new Client('ranked');
    await first.hello(once);
    await first.until(() => first.of('playerJoined').length > 0);
    expect(await rejected('ranked', once)).toBe('invalidTicket');
    first.close();
  });

  it('convidado com ticket não entra no Ranked (o ticket diz que não tem conta)', async () => {
    expect(await rejected('ranked', signTicket({ ...account, sub: 'guest:x', name: 'Visita*', acct: false, clan: null }, apiKey))).toBe('rankedNeedsAccount');
  });
});

describe('queda e volta (OG-047)', () => {
  it('quem cai e volta em até 15 s com o token mantém vaga, time e frags', async () => {
    const room = manager.get('volta')!;
    const a = new Client('volta');
    await a.hello('dev:Ana');
    await a.until(() => a.of('resumeToken').length > 0);
    const pid = a.of('welcome')[0]!.pid;
    const token = a.of('resumeToken')[0]!.token;
    const other = new Client('volta');
    await other.hello('dev:Bia');
    await other.until(() => other.of('welcome').length > 0);
    room.world.players[pid]!.stats.frags = 7; // depois da entrada da Bia, que recomeça a partida
    a.ws.close(); // queda
    await a.until(() => a.closed !== null);
    await new Promise((r) => setTimeout(r, 300));
    expect(room.playerCount).toBe(2); // vaga guardada
    expect(other.of('playerLeft')).toHaveLength(0);

    const back = new Client('volta');
    await back.hello('dev:Ana', PROTOCOL_VERSION, message('resume', { token }));
    await back.until(() => back.of('welcome').length > 0 && back.of('frags').some((f) => f.pid === pid));
    expect(back.of('welcome')[0]!.pid).toBe(pid);
    expect(back.of('frags').find((f) => f.pid === pid)!.frags).toBe(7);
    expect(room.world.teamOf(pid)).toBe(0);
    expect(back.of('resumeToken')[0]!.token).not.toBe(token); // token novo a cada volta
    expect(room.playerCount).toBe(2);
    back.close();
    other.close();
  });

  it('token errado entra como jogador novo', async () => {
    const room = manager.get('volta')!;
    await new Promise((r) => setTimeout(r, 100));
    const before = room.playerCount;
    const c = new Client('volta');
    await c.hello('dev:Cid', PROTOCOL_VERSION, message('resume', { token: 'nao-existe' }));
    await c.until(() => c.of('welcome').length > 0);
    expect(room.playerCount).toBe(before + 1);
    c.close();
    // vagas guardadas não podem contar nas métricas dos outros testes
    await new Promise((r) => setTimeout(r, 200));
    room.world.players.forEach((p, i) => p && room.leave(i));
  });
});

describe('game server', () => {
  it('health, métricas e lista de salas', async () => {
    const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
    expect(health).toMatchObject({ status: 'ok', rooms: 3 });
    const res = await fetch(`http://127.0.0.1:${server.port}/metrics`);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain; version=0\.0\.4/);
    const metrics = await res.text();
    expect(metrics).toMatch(/^outgun_tick_duration_seconds_bucket\{le="0\.02"\} \d+$/m);
    expect(metrics).toMatch(/^outgun_rooms\{mode="ranked"\} 1$/m);
    expect(metrics).toMatch(/^outgun_ws_sent_bytes_total \d+$/m);
    expect(metrics).toMatch(/^outgun_ws_connections_total\{kind="player",result="accepted"\} \d+$/m);
    expect(metrics).toMatch(/^process_resident_memory_bytes \d+$/m);
    const rooms = (await (await fetch(`http://127.0.0.1:${server.port}/rooms`)).json()) as { id: string }[];
    expect(rooms.map((r) => r.id).sort()).toEqual(['main', 'ranked', 'volta']);
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

  it('flood de inputs ou bytes inválidos: desconecta com client_misbehavior', async () => {
    const flood = new Client('main');
    await flood.hello('dev:Flood');
    await flood.until(() => flood.of('welcome').length > 0);
    for (let i = 0; i < 200; i++) flood.send(message('input', { clientFrame: i & 127, controls: 0, gundir: 0 }));
    await flood.until(() => flood.closed !== null);
    expect(flood.closed).toEqual({ code: 4003, reason: 'client_misbehavior' });
    expect(flood.of('disconnecting').at(-1)?.reason).toBe('misbehavior');

    const garbage = new Client('main');
    await garbage.hello('dev:Lixo');
    await garbage.until(() => garbage.of('welcome').length > 0);
    garbage.ws.send(new Uint8Array([0xff, 0xff, 0xff, 0x01]));
    await garbage.until(() => garbage.closed !== null);
    expect(garbage.closed?.reason).toBe('client_misbehavior');
  });
});

describe('sala aberta pelo ticket (OG-086)', () => {
  const guest: TicketInput = { aud: 'p-nova', sub: 'guest:1', name: 'Bia*', acct: false, admin: false, clan: null, ranked: false };
  const spawn = { name: 'Treino', mode: 'casual' as const, preset: 'duel', maxPlayers: 2, persistent: false, maps: ['coliseu', 'nao-existe'] };
  const outcome = async (room: string, ticket: string) => {
    const c = new Client(room);
    await c.hello(ticket);
    await c.until(() => c.closed !== null || c.of('welcome').length > 0);
    return c;
  };

  it('sala desconhecida sem pedido de abertura é recusada', async () => {
    const c = await outcome('p-nova', signTicket(guest, apiKey));
    expect(c.of('reject')[0]?.reason).toBe('roomClosed');
    expect(manager.get('p-nova')).toBeUndefined();
  });

  it('o primeiro ticket abre a sala com a configuração da API; o segundo entra nela', async () => {
    const a = await outcome('p-nova', signTicket({ ...guest, spawn }, apiKey));
    expect(a.of('welcome')[0]).toMatchObject({ maxPlayers: 2, mode: 'casual' });
    const room = manager.get('p-nova')!;
    expect(manager.hosted().find((r) => r.id === 'p-nova')).toMatchObject({ name: 'Treino', preset: 'duel', persistent: false, players: 1, map: room.world.map.title });
    // mapa inexistente sai da rotação
    expect(room.world.map.title).toBe(loadMaps(mapsDir, ['coliseu'])[0]!.title);
    const b = await outcome('p-nova', signTicket({ ...guest, sub: 'guest:2', name: 'Caio*', spawn }, apiKey));
    expect(b.of('welcome')).toHaveLength(1);
    a.close();
    b.close();
  });

  it('sem vaga para mais salas, recusa', async () => {
    const c = await outcome('p-outra', signTicket({ ...guest, aud: 'p-outra', spawn }, apiKey));
    expect(c.of('reject')[0]?.reason).toBe('roomClosed');
    manager.close('p-nova');
  });
});
