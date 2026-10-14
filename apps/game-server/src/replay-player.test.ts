// SPDX-License-Identifier: GPL-2.0-or-later
// Player de replay (OG-091): um replay gravado pela sala (OG-090) tocado pelo `ReplayPlayer` do
// netcode reproduz o que aconteceu no servidor, e o seek é rápido.
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { ReplayPlayer } from '@outgun/netcode';
import { decodeReplayBody, readReplayPrefix } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { message } from '@outgun/protocol';
import { Room } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1']);

/** Partida de bots gravada; devolve o replay e as posições do servidor por frame. */
function record(minutes: number) {
  const saved = new Map<string, Uint8Array>();
  const room = new Room({
    id: 'r',
    preset: 'classic',
    maps,
    mapFiles: ['outgun1'],
    maxPlayers: 16,
    seed: 9,
    botTest: true,
    gamemod: `time_limit ${minutes}\nbot_ping 0`,
    replays: { save: (key, data) => (saved.set(key, data), `http://gs/replays/${key}.ogr`) },
  });
  // o replay só fica com pelo menos um humano no fim (`recording`)
  const human = room.join({ send: () => {}, close: () => {} }, { name: 'Ana', accountId: null });
  if (!human.ok) throw new Error(human.reason);
  room.handle(human.pid, [message('clientReady', {})]);
  for (let i = 0; i < 7; i++) room.addBot();
  const truth = new Map<number, Map<number, [number, number, number, number, boolean]>>();
  while (room.results.length === 0) {
    room.tick();
    const frame = room.frame - 1;
    const at = new Map<number, [number, number, number, number, boolean]>();
    room.world.players.forEach((p) => p && at.set(p.pid, [p.pos.roomX, p.pos.roomY, Math.fround(p.pos.x), Math.fround(p.pos.y), p.dead]));
    truth.set(frame, at);
  }
  const data = [...saved.values()].at(-1)!;
  const prefix = readReplayPrefix(data)!;
  return { replay: decodeReplayBody(gunzipSync(prefix.body), prefix.version, prefix.protocol), truth };
}

describe('OG-091: player de replay', () => {
  const { replay, truth } = record(1);
  const map = maps[0]!;

  it('reproduz as posições e mortes do servidor em todos os frames', () => {
    const player = new ReplayPlayer(replay, map);
    const endFrame = Math.max(...truth.keys());
    let checked = 0;
    while (player.step()) {
      const s = player.session;
      const w = s.world!;
      const expected = truth.get(w.frame);
      // o frame do fim da partida: o servidor já reiniciou o mundo no meio dele
      if (!expected || s.skipped || w.frame === endFrame) continue;
      for (const [pid, [rx, ry, x, y, dead]] of expected) {
        const p = w.players[pid]!;
        expect([p.pos.roomX, p.pos.roomY, p.pos.x, p.pos.y, p.dead], `frame ${w.frame}, jogador ${pid}`).toEqual([rx, ry, x, y, dead]);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
    // estatísticas finais e nomes chegaram ao espectador
    // o último bloco traz as estatísticas do fim da partida
    expect(player.session.statsReadyCount).toBe(1);
    expect([...player.session.names.values()].filter((n) => n.startsWith('BOT '))).toHaveLength(7);
  });

  it('seek para trás e para a frente chega ao mesmo estado que tocar em ordem', () => {
    const a = new ReplayPlayer(replay, map);
    for (let i = 0; i < 400; i++) a.step();
    const b = new ReplayPlayer(replay, map);
    b.seek(550);
    b.seek(120);
    b.seek(400);
    expect(b.position).toBe(400);
    const pos = (p: ReplayPlayer) => p.session.world!.players.map((pl) => pl && [pl.pos.roomX, pl.pos.roomY, pl.pos.x, pl.pos.y]);
    expect(pos(b)).toEqual(pos(a));
    const rockets = (p: ReplayPlayer) => p.session.world!.rockets.filter((r) => r.owner !== -1).map((r) => [r.pos.x, r.pos.y]);
    expect(rockets(b)).toEqual(rockets(a));
  });

  it('seek ao fim de 10 minutos de partida em menos de 2 s', () => {
    // 10 min: o mesmo minuto repetido 10 vezes (o custo é por frame)
    const long = { ...replay, frames: Array.from({ length: 10 }, () => replay.frames).flat() };
    const player = new ReplayPlayer(long, map);
    const t0 = performance.now();
    player.seek(long.frames.length);
    const ms = performance.now() - t0;
    expect(long.frames.length).toBeGreaterThan(5900);
    expect(ms).toBeLessThan(2000);
  });
});
