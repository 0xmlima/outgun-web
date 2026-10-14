// SPDX-License-Identifier: GPL-2.0-or-later
// Espectadores ao vivo (OG-092): stream do replay com `spectating_delay`, sem ocupar vaga.
import { fileURLToPath } from 'node:url';
import { ReplayPlayer } from '@outgun/netcode';
import { decodeFrame, type AnyMessage, type Replay } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);

class Viewer implements Connection {
  packets: AnyMessage[][] = [];
  closed = false;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.packets.push(r.messages);
  }
  close(): void {
    this.closed = true;
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
