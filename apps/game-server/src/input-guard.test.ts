// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { CONTROL } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { InputGuard, isNewerOrSame } from './input-guard.js';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';

const MAPS = fileURLToPath(new URL('../../../_legacy/maps', import.meta.url));
const maps = loadMaps(MAPS, ['outgun1']);

class Conn implements Connection {
  received: AnyMessage[] = [];
  closed: [number, string] | null = null;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (r.ok) this.received.push(...r.messages);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
}

function setup() {
  const room = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 16, seed: 1 });
  const conn = new Conn();
  const res = room.join(conn, { name: 'Ana', accountId: null });
  if (!res.ok) throw new Error(res.text);
  room.handle(res.pid, [message('clientReady', {})]);
  for (let i = 0; i < 5; i++) room.tick();
  return { room, conn, pid: res.pid };
}

const input = (clientFrame: number, controls: number) => message('input', { clientFrame, controls, gundir: 0 });

describe('ordem dos inputs (incoming_client_data)', () => {
  it('janela de 128 num contador de 8 bits', () => {
    expect(isNewerOrSame(10, 12)).toBe(true);
    expect(isNewerOrSame(12, 11)).toBe(false);
    expect(isNewerOrSame(12, 12)).toBe(true);
    expect(isNewerOrSame(250, 3)).toBe(true);
    expect(isNewerOrSame(3, 250)).toBe(false);
  });

  it('fora de ordem e duplicados não quebram a simulação: vale o mais novo', () => {
    const { room, pid } = setup();
    const pl = room.world.players[pid]!;
    room.handle(pid, [input(10, CONTROL.right)]);
    room.handle(pid, [input(12, CONTROL.left)]);
    room.handle(pid, [input(11, CONTROL.up)]); // atrasado: ignorado
    expect(pl.controls).toBe(CONTROL.left);
    room.handle(pid, [input(12, CONTROL.left), input(12, CONTROL.left)]); // repetido
    expect(pl.controls).toBe(CONTROL.left);
    room.handle(pid, [input(255, CONTROL.down)]); // 255 é "antigo" em relação a 12
    expect(pl.controls).toBe(CONTROL.left);
    for (let i = 0; i < 30; i++) room.tick();
    expect(Number.isFinite(pl.pos.x) && Number.isFinite(pl.pos.y)).toBe(true);
  });

  it('o primeiro input vale com qualquer número', () => {
    const { room, pid } = setup();
    room.handle(pid, [input(200, CONTROL.up)]);
    expect(room.world.players[pid]!.controls).toBe(CONTROL.up);
  });
});

describe('limite de taxa e mensagens inválidas', () => {
  it('ritmo do cliente do jogo (1 input por frame, tiro na mudança) passa', () => {
    const { room, conn, pid } = setup();
    for (let f = 0; f < 300; f++) {
      room.handle(pid, [input(f & 255, f % 20 < 10 ? CONTROL.up : 0), ...(f % 10 === 0 ? [message('fire', { on: f % 20 === 0 })] : [])]);
      room.tick();
    }
    expect(conn.closed).toBeNull();
  });

  it('acordes rápidos em jogo intenso (40 inputs/s por um minuto) nunca são descartados (OG-462)', () => {
    const g = new InputGuard();
    let dropped = 0;
    for (let t = 0; t < 600; t++) {
      // envio do frame + 2 mudanças de tecla por tick e, a cada 5 ticks, um acorde de 5 de uma vez
      const n = 3 + (t % 5 === 0 ? 5 : 0);
      for (let k = 0; k < n; k++) {
        const v = g.check(input(t & 255, CONTROL.up));
        if (!v.ok || v.drop) dropped++;
      }
      g.tick();
    }
    expect(dropped).toBe(0);
  });

  it('inputs acumulados por uma conexão travada: o excesso é descartado, sem expulsão', () => {
    const { room, conn, pid } = setup();
    room.handle(pid, Array.from({ length: 200 }, (_, i) => input(i & 127, i < 80 ? CONTROL.up : CONTROL.left)));
    expect(conn.closed).toBeNull();
    expect(room.world.players[pid]!.controls).toBe(CONTROL.up); // os 120 além do balde não valeram
    for (let f = 0; f < 100; f++) room.tick(); // a dívida se paga e o ritmo normal volta a valer
    room.handle(pid, [input(200, CONTROL.down)]);
    expect(room.world.players[pid]!.controls).toBe(CONTROL.down);
  });

  it('enxurrada de inputs: desconectado por client_misbehavior', () => {
    const { room, conn, pid } = setup();
    room.handle(pid, Array.from({ length: 1000 }, (_, i) => input(i & 127, 0)));
    expect(conn.closed).toEqual([4003, 'client_misbehavior']);
    expect(conn.received.some((m) => m.type === 'disconnecting' && m.reason === 'misbehavior')).toBe(true);
    expect(room.playerCount).toBe(0);
    expect(room.kicks[0]?.reason).toMatch(/input/);
  });

  it('suicídio em excesso também; gundir fora de 12 bits e hello repetido são inválidos', () => {
    const a = setup();
    a.room.handle(a.pid, Array.from({ length: 10 }, () => message('suicide', {})));
    expect(a.conn.closed?.[1]).toBe('client_misbehavior');
    const b = setup();
    b.room.handle(b.pid, [message('input', { clientFrame: 1, controls: 0, gundir: 0x1000 })]);
    expect(b.conn.closed?.[1]).toBe('client_misbehavior');
    const c = setup();
    c.room.handle(c.pid, [message('hello', { protocol: 1, ticket: 'dev:x', client: 'teste' })]);
    expect(c.conn.closed?.[1]).toBe('client_misbehavior');
  });

  it('o balde recarrega com os ticks', () => {
    const g = new InputGuard();
    for (let i = 0; i < 6; i++) expect(g.check(message('suicide', {})).ok).toBe(true);
    expect(g.check(message('suicide', {})).ok).toBe(false);
    for (let i = 0; i < 5; i++) g.tick(); // 0,5 s a 2/s = 1 ficha
    expect(g.check(message('suicide', {})).ok).toBe(true);
    expect(g.check(message('suicide', {})).ok).toBe(false);
  });
});

describe('atividade (RN-IDL-01)', () => {
  it('controles ou tiro atualizam; input parado não', () => {
    const { room, pid } = setup();
    const start = room.lastActivity(pid)!;
    for (let i = 0; i < 5; i++) room.tick();
    room.handle(pid, [input(1, 0)]);
    expect(room.lastActivity(pid)).toBe(start);
    room.handle(pid, [input(2, CONTROL.left)]);
    expect(room.lastActivity(pid)).toBe(room.world.frame);
  });
});
