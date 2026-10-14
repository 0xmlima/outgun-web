// SPDX-License-Identifier: GPL-2.0-or-later
// Drenagem no deploy (OG-103): sem salas novas, a sala termina a partida em andamento e fecha, e só
// então o processo pode sair.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import type { Connection } from './room.js';
import { RoomManager } from './rooms.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['2 versus 2 (duel)']);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  closed: [number, string] | null = null;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
}

describe('drenagem (OG-103)', () => {
  it('a sala com jogadores fecha só no fim da partida; a vazia fecha na hora; nada novo abre', async () => {
    const m = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 1 });
    const busy = m.create({ id: 'cheia', preset: 'classic', maps, maxPlayers: 4 });
    m.create({ id: 'vazia', preset: 'classic', maps, maxPlayers: 4, persistent: true });
    const conn = new TestConnection();
    const joined = busy.join(conn, { name: 'Ana', accountId: null, admin: true });
    if (!joined.ok) throw new Error(joined.text);
    busy.handle(joined.pid, [message('clientReady', {})]);
    m.tickAll();

    const done = m.drain(60_000);
    expect(m.hasCapacity).toBe(false);
    m.tickAll(); // a vazia percebe que não tem humanos
    m.tickAll(); // e é fechada
    expect(m.get('vazia')).toBeUndefined();
    expect(m.get('cheia')).toBe(busy);
    expect(conn.received.some((x) => x.type === 'text' && x.text.includes('will close at the end of the current match'))).toBe(true);

    // partida segue até acabar (o admin força o fim com /forcemap) e a sala fecha sem começar outra
    for (let i = 0; i < 20; i++) m.tickAll();
    expect(conn.closed).toBeNull();
    busy.handle(joined.pid, [message('chat', { text: '/forcemap', teamOnly: false })]);
    for (let i = 0; i < 200 && m.get('cheia'); i++) m.tickAll();
    expect(m.get('cheia')).toBeUndefined();
    expect(conn.received.filter((x) => x.type === 'startGame')).toHaveLength(0);
    expect(conn.closed?.[0]).toBe(1001);
    await done;
  });

  it('o prazo fecha o que sobrou', async () => {
    const m = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 1 });
    const room = m.create({ id: 'longa', preset: 'classic', maps, maxPlayers: 4 });
    const conn = new TestConnection();
    room.join(conn, { name: 'Bia', accountId: null });
    const started = Date.now();
    await m.drain(300);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(m.get('longa')).toBeUndefined();
    expect(conn.closed?.[0]).toBe(1001);
  });
});
