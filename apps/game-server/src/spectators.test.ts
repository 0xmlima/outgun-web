// SPDX-License-Identifier: GPL-2.0-or-later
// Espectadores ao vivo (OG-092): stream do replay com `spectating_delay`, sem ocupar vaga.
import { fileURLToPath } from 'node:url';
import { ReplayPlayer } from '@outgun/netcode';
import { decodeFrame, type AnyMessage, type Replay } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';
import { RoomManager } from './rooms.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);

class Viewer implements Connection {
  packets: AnyMessage[][] = [];
  closed = false;
  code = 0;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.packets.push(r.messages);
  }
  close(code: number): void {
    this.closed = true;
    this.code = code;
  }
  messages(): AnyMessage[] {
    return this.packets.flat();
  }
  lastFrame(): number {
    const frames = this.messages().flatMap((m) => (m.type === 'replayFrame' ? [m.frame] : []));
    return frames.at(-1) ?? -1;
  }
}

function room(gamemod: string, maxSpectators?: number) {
  const r = new Room({ id: 's', preset: 'classic', maps, mapFiles: ['outgun1'], maxPlayers: 16, seed: 2, botTest: true, gamemod, ...(maxSpectators ? { maxSpectators } : {}) });
  for (let i = 0; i < 4; i++) r.addBot();
  return r;
}

describe('OG-092: espectador ao vivo', () => {
  it('recebe a partida com o atraso de spectating_delay e não vira jogador', () => {
    const r = room('spectating_delay 5');
    const v = new Viewer();
    for (let i = 0; i < 20; i++) r.tick();
    const players = r.playerCount;
    expect(r.addSpectator(v)).toBe(true);
    expect(r.playerCount).toBe(players);
    for (let i = 0; i < 30; i++) r.tick();
    // ainda dentro do atraso: o frame 0 da partida só sai 50 frames depois
    expect(v.messages().filter((m) => m.type === 'replayFrame').length).toBeLessThanOrEqual(1);
    for (let i = 0; i < 100; i++) r.tick();
    expect(v.lastFrame()).toBe(r.frame - 1 - 50);
    // sem `playerJoined` nem lugar na lista de jogadores
    expect(v.messages().some((m) => m.type === 'playerJoined' && !r.bots().includes(m.pid))).toBe(false);
    expect(r.spectatorCount).toBe(1);
  });

  it('o stream é um replay: começa com spectatorStart e o estado inicial e toca no ReplayPlayer', () => {
    const r = room('spectating_delay 0\ntime_limit 1');
    const v = new Viewer();
    r.addSpectator(v);
    for (let i = 0; i < 300; i++) r.tick();
    const [start, init, ...frames] = v.packets;
    expect(start?.[0]?.type).toBe('spectatorStart');
    const s = start![0]!;
    if (s.type !== 'spectatorStart') throw new Error();
    expect(s).toMatchObject({ maxPlayers: 16, delay: 0, map: 'outgun1' });
    expect(init!.some((m) => m.type === 'mapChange')).toBe(true);
    const replay: Replay = { version: 1, protocol: s.protocol, header: { roomId: 's', mode: 'casual', preset: 'classic', map: s.map, mapTitle: s.mapTitle, maxPlayers: s.maxPlayers, startedAt: '', startFrame: 0, frames: 0 }, init: init!, frames };
    const player = new ReplayPlayer(replay, maps[0]!);
    player.seek(player.length);
    const w = player.session.world!;
    for (const p of r.world.players) {
      if (!p) continue;
      expect(w.players[p.pid]?.pos.roomX).toBe(p.pos.roomX);
      expect(w.players[p.pid]?.pos.x).toBe(Math.fround(p.pos.x));
    }
  });

  it('partida nova: outro spectatorStart com o estado inicial dela', () => {
    const r = room('spectating_delay 0\ntime_limit 1');
    const v = new Viewer();
    r.addSpectator(v);
    for (let i = 0; i < 800; i++) r.tick();
    expect(r.results.length).toBe(1);
    expect(v.messages().filter((m) => m.type === 'spectatorStart')).toHaveLength(2);
  });

  it('sem gamemod, o atraso é de 15 s (D-89, OG-534)', () => {
    const r = room('');
    const v = new Viewer();
    r.addSpectator(v);
    for (let i = 0; i < 400; i++) r.tick();
    expect(v.messages().find((m) => m.type === 'spectatorStart')).toMatchObject({ delay: 15 });
    expect(v.lastFrame()).toBe(r.frame - 1 - 150);
  });

  it('sala encerrada no fim da partida: o espectador vê o fim e o placar antes de fechar (OG-533)', () => {
    const r = room('spectating_delay 15\ntime_limit 1');
    const v = new Viewer();
    r.addSpectator(v);
    for (let i = 0; i < 2000 && r.results.length === 0; i++) r.tick();
    expect(r.results.length).toBe(1);
    const last = r.frame - 1; // último frame gravado da partida
    expect(v.lastFrame()).toBeLessThan(last - 100); // ainda no atraso
    r.close(true);
    expect(v.closed).toBe(false);
    let ticks = 0;
    while (r.drainSpectators()) ticks++;
    expect(v.lastFrame()).toBe(last);
    expect(v.closed).toBe(true);
    expect(v.code).toBe(1000);
    expect(ticks).toBeGreaterThanOrEqual(150); // o atraso inteiro, mais a folga do placar
  });

  it('o atraso é de tempo de verdade: segue andando com o jogo parado (OG-533)', () => {
    const r = room('spectating_delay 3\ntime_limit 1');
    const v = new Viewer();
    r.addSpectator(v);
    for (let i = 0; i < 2000 && r.results.length === 0; i++) r.tick();
    const last = r.frame - 1;
    r.close(true);
    // sem tick da sala (o mundo parado), o dreno ainda entrega o fim
    for (let i = 0; i < 31; i++) r.drainSpectators();
    expect(v.lastFrame()).toBe(last);
  });

  it('RoomManager: sala esvaziada com espectador sai da lista, mas ele segue até o fim (OG-533)', () => {
    let now = 0;
    const manager = new RoomManager({ emptyTimeoutMs: 1000, seed: () => 5, clock: { now: () => now } as never });
    const r = manager.create({ id: 'x', preset: 'classic', maps, mapFiles: ['outgun1'], maxPlayers: 16 });
    const v = new Viewer();
    r.addSpectator(v);
    manager.close('x', 'empty');
    expect(manager.get('x')).toBeUndefined();
    expect(v.closed).toBe(false);
    for (let i = 0; i < 400 && !v.closed; i++) {
      now += 100;
      manager.tickAll();
    }
    expect(v.closed).toBe(true);
    expect(v.code).toBe(1000);
  });

  it('RoomManager: desligar o servidor fecha os espectadores na hora', () => {
    const manager = new RoomManager({ emptyTimeoutMs: 1000, seed: () => 5 });
    const r = manager.create({ id: 'y', preset: 'classic', maps, mapFiles: ['outgun1'], maxPlayers: 16 });
    const v = new Viewer();
    r.addSpectator(v);
    manager.stop();
    expect(v.closed).toBe(true);
    expect(v.code).toBe(1001);
  });

  it('limite de espectadores por sala', () => {
    const r = room('spectating_delay 0', 2);
    expect(r.addSpectator(new Viewer())).toBe(true);
    expect(r.addSpectator(new Viewer())).toBe(true);
    expect(r.addSpectator(new Viewer())).toBe(false);
  });

  it('quem sai para de receber; a sala fechando fecha os espectadores', () => {
    const r = room('spectating_delay 0');
    const a = new Viewer();
    const b = new Viewer();
    r.addSpectator(a);
    r.addSpectator(b);
    r.tick();
    r.removeSpectator(a);
    const before = a.packets.length;
    for (let i = 0; i < 5; i++) r.tick();
    expect(a.packets.length).toBe(before);
    r.close();
    expect(b.closed).toBe(true);
  });
});
