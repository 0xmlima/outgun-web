// SPDX-License-Identifier: GPL-2.0-or-later
// Pausa tática do Ranked (OG-260, RN-RKL-15/16, D-45): saldo, pedidos, retomada só por quem pediu e
// o mundo parado na sala.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import type { PlayerState } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { PAUSE_BALANCE_FRAMES, RankedPause, RESUME_FRAMES } from './pause.js';
import { Room, type Connection } from './room.js';

describe('saldo e pedidos de pausa (OG-260)', () => {
  it('desconta o tempo real pausado; 4º pedido e pedido sem saldo são recusados', () => {
    const p = new RankedPause();
    let now = 0;
    const run = (frames: number) => {
      for (let i = 0; i < frames; i++) p.tick(++now);
    };
    expect(p.request(0, 1)).toBeNull();
    expect(p.request(1, 2)).toBe('busy');
    run(150);
    expect(p.resume(0, now)).toBeNull();
    run(RESUME_FRAMES);
    expect([p.active, p.balance[0], p.balance[1]]).toEqual([false, PAUSE_BALANCE_FRAMES - 150, PAUSE_BALANCE_FRAMES]);
    for (let i = 0; i < 2; i++) {
      expect(p.request(0, 1)).toBeNull();
      run(10);
      p.resume(0, now);
      run(RESUME_FRAMES);
    }
    expect(p.balance[0]).toBe(PAUSE_BALANCE_FRAMES - 170);
    expect(p.request(0, 1)).toBe('noRequests');

    const q = new RankedPause();
    q.request(1, 3);
    run(0);
    for (let i = 0; i < PAUSE_BALANCE_FRAMES; i++) q.tick(++now);
    expect([q.phase, q.balance[1]]).toEqual(['resuming', 0]); // saldo acabou: contagem de 3 s
    for (let i = 0; i < RESUME_FRAMES; i++) q.tick(++now);
    expect(q.active).toBe(false);
    expect(q.request(1, 3)).toBe('noBalance');
    q.reset();
    expect(q.request(1, 3)).toBeNull(); // jogo novo: saldo novo
  });

  it('o adversário não retoma nem estende; a contagem não é interrompida', () => {
    const p = new RankedPause();
    p.request(0, 1);
    expect(p.resume(1, 5)).toBe('notYours');
    expect(p.request(1, 2)).toBe('busy');
    expect(p.resume(0, 5)).toBeNull();
    expect(p.resume(0, 6)).toBe('notPaused');
    expect([p.phase, p.seconds(6)]).toEqual(['resuming', 3]);
  });
});

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
  last<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }> | undefined {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type).at(-1);
  }
  texts(): string[] {
    return this.received.flatMap((m) => (m.type === 'text' ? [m.text] : []));
  }
}

describe('sala pausada (OG-260)', () => {
  const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);
  const setup = (preset: 'ranked' | 'classic') => {
    const r = new Room({ id: 'r', preset, maps, maxPlayers: 4, seed: 5 });
    const players = [1, 2, 3, 4].map((n) => {
      const conn = new TestConnection();
      const res = r.join(conn, { name: `J${n}`, accountId: `00000000-0000-4000-8000-00000000000${n}` });
      if (!res.ok) throw new Error(res.text);
      r.handle(res.pid, [message('clientReady', {})]);
      return { conn, pid: res.pid };
    });
    for (let i = 0; i < 40; i++) r.tick();
    return { r, players };
  };
  const run = (r: Room, frames: number) => {
    for (let i = 0; i < frames; i++) r.tick();
  };
  const snapshot = (r: Room) =>
    JSON.stringify({
      frame: r.world.frame,
      mapTime: r.world.mapTime(),
      players: r.world.players.filter((p): p is PlayerState => !!p).map((p) => [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.dead, p.health, p.energy]),
      rockets: r.world.rockets.map((rk) => [rk.owner, rk.pos.x, rk.pos.y]),
      flags: r.world.teams.map((t) => t.flags.map((f) => [f.carrier, f.pos.x, f.pos.y])),
    });

  it('pausado o mundo e o tempo da partida não andam; o chat continua; retomada em 3 s', () => {
    const { r, players } = setup('ranked');
    const a = players[0]!;
    const enemy = players.find((p) => r.world.teamOf(p.pid) !== r.world.teamOf(a.pid))!;
    r.handle(a.pid, [message('input', { clientFrame: 1, controls: 1, gundir: 0 }), message('fire', { on: true })]);
    run(r, 5);
    r.handle(a.pid, [message('chat', { text: '/pause', teamOnly: false })]);
    run(r, 1);
    const before = snapshot(r);
    expect(a.conn.last('pauseState')).toMatchObject({ phase: 'paused', reason: 'team', by: a.pid, seconds: 60 });
    r.handle(enemy.pid, [message('input', { clientFrame: 1, controls: 4, gundir: 0 }), message('fire', { on: true }), message('chat', { text: 'oi', teamOnly: false })]);
    run(r, 100);
    expect(snapshot(r)).toBe(before);
    expect(a.conn.texts().some((t) => t.endsWith(': oi'))).toBe(true);
    expect(enemy.conn.last('pauseState')).toMatchObject({ phase: 'paused', seconds: 50 });
    r.handle(enemy.pid, [message('pauseRequest', { on: false })]);
    run(r, 1);
    expect(enemy.conn.texts().at(-1)).toBe('Só o time que pediu a pausa pode retomar.');
    r.handle(a.pid, [message('pauseRequest', { on: false })]);
    run(r, RESUME_FRAMES - 1);
    expect(snapshot(r)).toBe(before);
    expect(a.conn.last('pauseState')).toMatchObject({ phase: 'resuming', seconds: 1 });
    run(r, 2);
    expect(r.pause?.active).toBe(false);
    expect(r.world.frame).toBeGreaterThan(JSON.parse(before).frame);
    expect(a.conn.last('pauseState')).toMatchObject({ phase: 'none', redSeconds: r.world.teamOf(a.pid) === 0 ? 50 : 60 });
  });

  it('Casual não tem pausa', () => {
    const { r, players } = setup('classic');
    const a = players[0]!;
    r.handle(a.pid, [message('pauseRequest', { on: true })]);
    const frame = r.world.frame;
    run(r, 3);
    expect([r.pause, r.world.frame, a.conn.last('pauseState')]).toEqual([undefined, frame + 3, undefined]);
    expect(a.conn.texts().at(-1)).toBe('Pausa só no Ranked, com o jogo em andamento.');
  });
});
