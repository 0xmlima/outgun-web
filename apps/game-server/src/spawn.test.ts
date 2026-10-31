// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Connection } from './room.js';
import { RoomManager } from './rooms.js';
import { makeSpawner } from './spawn.js';

const mapsDir = fileURLToPath(new URL('../../../_legacy/maps', import.meta.url));

describe('abertura de sala sob demanda (OG-086)', () => {
  const setup = () => {
    const manager = new RoomManager({ emptyTimeoutMs: 1000, seed: () => 1, maxRooms: 2 });
    return { manager, spawn: makeSpawner(manager, { mapsDir, rotations: { casual: ['outgun1', 'coliseu'], ranked: ['coliseu'] } }) };
  };

  it('Ranked usa sempre a rotação oficial e o preset travado', () => {
    const { manager, spawn } = setup();
    const room = spawn('ranked-2', { name: 'Ranked 2', mode: 'ranked', preset: 'ranked', maxPlayers: 16, persistent: true, maps: ['outgun1'] })!;
    expect(room.mode).toBe('ranked');
    expect(manager.hosted()[0]).toMatchObject({ id: 'ranked-2', name: 'Ranked 2', preset: 'ranked', persistent: true, maxPlayers: 16 });
    expect(room.world.map.title).not.toBe('');
  });

  it('recusa preset de outro modo, preset desconhecido e mapa com caminho', () => {
    const { manager, spawn } = setup();
    expect(spawn('a', { name: 'A', mode: 'casual', preset: 'ranked', maxPlayers: 16, persistent: false })).toBeUndefined();
    expect(spawn('b', { name: 'B', mode: 'casual', preset: 'nada', maxPlayers: 16, persistent: false })).toBeUndefined();
    // mapa fora da pasta é ignorado: cai na rotação oficial
    const room = spawn('c', { name: 'C', mode: 'casual', preset: 'classic', maxPlayers: 8, persistent: false, maps: ['../config/gamemod'] })!;
    expect(room).toBeDefined();
    expect(manager.list()).toHaveLength(1);
  });

  it('sala da OutCup aberta pelo ticket guarda os lados das duplas (OG-525)', () => {
    const { spawn } = setup();
    const sides = { a1: 0, a2: 0, b1: 1, b2: 1 } as const;
    const room = spawn('c-x', { name: 'OutCup Semifinal', mode: 'ranked', preset: 'ranked', maxPlayers: 4, persistent: false, ranked: { format: '2x2', bestOf: 3 }, cup: { sides } })!;
    const conn: Connection = { send: () => {}, close: () => {} };
    expect(room.join(conn, { name: 'Intruso', accountId: 'x' })).toMatchObject({ ok: false, reason: 'roomClosed' });
    for (const id of ['b1', 'a1', 'b2', 'a2'] as const) {
      const res = room.join(conn, { name: id, accountId: id });
      expect(res.ok && room.world.teamOf(res.pid)).toBe(sides[id]);
    }
  });

  it('respeita o limite de salas do processo', () => {
    const { spawn } = setup();
    const spec = { name: 'X', mode: 'casual' as const, preset: 'classic', maxPlayers: 8, persistent: false };
    expect(spawn('x1', spec)).toBeDefined();
    expect(spawn('x2', spec)).toBeDefined();
    expect(spawn('x3', spec)).toBeUndefined();
  });
});
