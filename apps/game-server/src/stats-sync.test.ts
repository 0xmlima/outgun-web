// SPDX-License-Identifier: GPL-2.0-or-later
// Estatísticas para F3/F4 (OG-066): retrato ao entrar, a cada mudança e o fecho no fim da partida.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);

class Conn implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }
}

describe('estatísticas para as telas F3/F4 (OG-066)', () => {
  const setup = () => {
    const r = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 16, seed: 3 });
    const join = (name: string) => {
      const conn = new Conn();
      const res = r.join(conn, { name, accountId: null });
      if (!res.ok) throw new Error(res.text);
      r.handle(res.pid, [message('clientReady', {})]);
      return { conn, pid: res.pid };
    };
    return { r, join };
  };

  it('quem entra recebe o retrato de todos e dos dois times', () => {
    const { join } = setup();
    const a = join('Ana');
    const b = join('Bia');
    expect(b.conn.of('stats').map((m) => m.stats.pid).sort()).toEqual([a.pid, b.pid].sort());
    expect(b.conn.of('teamStats').map((m) => m.team)).toEqual(['red', 'blue']);
  });

  it('contador que muda vai para todos (uma vez por frame); só o tempo não manda nada', () => {
    const { r, join } = setup();
    const a = join('Ana');
    const b = join('Bia');
    r.tick();
    const before = b.conn.of('stats').length;
    for (let i = 0; i < 5; i++) r.tick();
    expect(b.conn.of('stats').length).toBe(before); // só o tempo passou
    const pl = r.world.players[a.pid]!;
    pl.stats.kills += 2;
    pl.stats.flagsReturned++;
    r.tick();
    const last = b.conn.of('stats').filter((m) => m.stats.pid === a.pid).at(-1)!;
    expect(last.stats).toMatchObject({ kills: 2, flagsReturned: 1 });
    expect(b.conn.of('stats').length).toBe(before + 1);
    r.world.teams[1].suicides++;
    r.tick();
    expect(b.conn.of('teamStats').at(-1)).toMatchObject({ team: 'blue', suicides: 1 });
  });

  it('fim da partida: movimento e tiros de cada um, dos times e statsReady', () => {
    const { r, join } = setup();
    const a = join('Ana');
    join('Bia');
    r.world.players[a.pid]!.stats.shots = 7;
    r.settings.world.timeLimit = 30;
    for (let i = 0; i < 40; i++) r.tick();
    const types = a.conn.received.map((m) => m.type);
    const ready = types.indexOf('statsReady');
    expect(ready).toBeGreaterThan(0);
    expect(types.slice(ready - 3, ready)).toEqual(['movementShots', 'movementShots', 'teamMovementShots']);
    expect(a.conn.of('movementShots').find((m) => m.pid === a.pid)?.data.shots).toBe(7);
    expect(types.indexOf('gameOver')).toBeGreaterThan(ready);
  });
});
