// SPDX-License-Identifier: GPL-2.0-or-later
// Ranked 2x2 (OG-516/518, D-88): 15 min com a prorrogação de 5 e no máximo 1 bot substituto por lado.
// Sala de confronto da OutCup (OG-525, RN-CUP-09): só as 4 contas entram, cada dupla no seu lado, sem
// troca de lado no lobby.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { COUNTDOWN_FRAMES } from './ranked-lobby.js';
import { Room, type Connection } from './room.js';

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
}

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['2 versus 2 (duel)', 'pari2']);
const account = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const run = (r: Room, frames: number) => {
  for (let i = 0; i < frames; i++) r.tick();
};

/** Sala 2x2 md1 com 4 contas; com `start`, passa pelo voto, "Pronto" e contagem até o jogo. */
function duoRoom(opts: { cup?: Record<string, 0 | 1>; start?: boolean } = {}) {
  const r = new Room({ id: 'c-1', preset: 'ranked', maps, mapFiles: ['2 versus 2 (duel)', 'pari2'], maxPlayers: 4, seed: 7, ranked: { format: '2x2', bestOf: 1 }, ...(opts.cup ? { cup: { sides: opts.cup } } : {}) });
  const players = [1, 2, 3, 4].map((n) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name: `J${n}`, accountId: account(n) });
    if (!res.ok) throw new Error(res.text);
    r.handle(res.pid, [message('clientReady', {})]);
    return { conn, pid: res.pid, n };
  });
  if (opts.start) {
    run(r, 1);
    for (const p of players) r.handle(p.pid, [message('lobbyVote', { map: 0 })]);
    run(r, 1);
    for (const p of players) r.handle(p.pid, [message('lobbyReady', { ready: true })]);
    run(r, COUNTDOWN_FRAMES + 2);
    for (const p of players) r.handle(p.pid, [message('clientReady', {})]);
    run(r, 30);
  }
  return { r, players };
}

describe('Ranked 2x2 (OG-516/518)', () => {
  it('15 min de tempo normal e 5 de prorrogação; os outros formatos seguem com 20', () => {
    const { r } = duoRoom();
    expect([r.settings.world.timeLimit, r.settings.world.extraTime]).toEqual([15 * 600, 5 * 600]);
    const three = new Room({ id: 'r-3', preset: 'ranked', maps, maxPlayers: 6, seed: 1, ranked: { format: '3x3', bestOf: 1 } });
    expect(three.settings.world.timeLimit).toBe(20 * 600);
  });

  it('no máximo 1 bot substituto por lado: a queda do parceiro não ganha outro bot (o lado sem humanos cancela, D-62)', () => {
    const { r, players } = duoRoom({ start: true });
    expect(r.lobby?.phase).toBe('game');
    const a = players[0]!;
    const mate = players.find((p) => p !== a && r.world.teamOf(p.pid) === r.world.teamOf(a.pid))!;
    r.disconnect(a.pid, a.conn, true);
    r.handle(mate.pid, [message('substituteVote', { bot: true })]);
    run(r, 1);
    expect(r.bots()).toEqual([a.pid]);
    run(r, 60);
    // o parceiro também sai: nenhum voto de bot é aberto e, sem humanos do lado, a partida é cancelada
    r.disconnect(mate.pid, mate.conn, true);
    run(r, 1);
    expect(r.pause?.votes.length ?? 0).toBe(0);
    expect(r.bots()).toEqual([]);
    expect(r.lobby?.phase).not.toBe('game');
  });
});

describe('sala de confronto da OutCup (OG-525)', () => {
  const sides = { [account(1)]: 1, [account(2)]: 1, [account(3)]: 0, [account(4)]: 0 } as const;

  it('só as contas do confronto entram, cada dupla no seu lado', () => {
    const { r, players } = duoRoom({ cup: sides });
    for (const p of players) expect(r.world.teamOf(p.pid)).toBe(sides[account(p.n)]);
    const fresh = new Room({ id: 'c-2', preset: 'ranked', maps, maxPlayers: 4, seed: 7, ranked: { format: '2x2', bestOf: 3 }, cup: { sides } });
    expect(fresh.join(new TestConnection(), { name: 'Intruso', accountId: account(9) })).toMatchObject({ ok: false, reason: 'roomClosed' });
  });

  it('ninguém troca de lado no lobby', () => {
    const { r, players } = duoRoom({ cup: sides });
    const p = players[0]!;
    const before = r.world.teamOf(p.pid);
    r.handle(p.pid, [message('lobbySide', { target: 255 })]);
    run(r, 1);
    expect(r.world.teamOf(p.pid)).toBe(before);
  });
});
