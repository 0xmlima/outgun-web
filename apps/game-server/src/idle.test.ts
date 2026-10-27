// SPDX-License-Identifier: GPL-2.0-or-later
// Inatividade (RN-IDL-01) e reconexão (OG-047) na sala.
import { fileURLToPath } from 'node:url';
import { ClientSession } from '@outgun/netcode';
import { chatName, decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);

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
  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }
}

function setup(idleSeconds = 120, limit = 4) {
  const r = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 16, seed: 7 });
  r.settings.server.idlekickTime = idleSeconds * 10;
  r.settings.server.idlekickPlayerlimit = limit;
  const join = (name: string, accountId: string | null = null) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name, accountId });
    if (!res.ok) throw new Error(res.text);
    r.handle(res.pid, [message('clientReady', {})]);
    return { conn, pid: res.pid };
  };
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) r.tick();
  };
  return { r, join, ticks };
}

/** Mantém um jogador "ativo" (andando) a cada frame. */
function move(r: Room, pid: number, frame: number) {
  r.handle(pid, [message('input', { clientFrame: frame & 255, controls: 1, gundir: 0 })]);
}

describe('idle kick (RN-IDL-01)', () => {
  it('só com ≥ idlekick_playerlimit humanos', () => {
    const { r, join, ticks } = setup(10, 4);
    const players = [join('A'), join('B'), join('C')];
    ticks(200);
    expect(players.every((p) => p.conn.closed === null)).toBe(true);
    expect(r.playerCount).toBe(3);
  });

  it('avisa e expulsa após idlekick_time sem controles nem tiro (contando só vivo)', () => {
    const { r, join } = setup(120, 2);
    const idle = join('Parado');
    const active = join('Ativo');
    let aliveTicks = 0;
    for (let frame = 0; frame < 3000 && !idle.conn.closed; frame++) {
      move(r, active.pid, frame);
      r.tick();
      // a checagem roda depois da simulação: morto não conta (nem zera)
      if (idle.conn.closed || !r.world.players[idle.pid]!.dead) aliveTicks++;
    }
    expect(aliveTicks).toBe(1200);
    // aviso de 60 s só quando idlekick_time ≥ 180 s (src/server.cpp:1652)
    expect(idle.conn.of('idleKickWarning').map((m) => m.seconds)).toEqual([30, 15, 5]);
    expect(idle.conn.closed).toEqual([4006, 'idle']);
    expect(idle.conn.of('disconnecting').at(-1)?.reason).toBe('idleKick');
    expect(active.conn.closed).toBeNull();
  });

  it('com idlekick_time de 180 s há também o aviso de 60 s', () => {
    const { r, join } = setup(180, 1);
    const a = join('A');
    while (r.world.players[a.pid]!.dead) r.tick();
    for (let i = 0; i < 1800; i++) r.tick();
    expect(a.conn.of('idleKickWarning').map((m) => m.seconds)).toEqual([60, 30, 15, 5]);
    expect(a.conn.closed?.[1]).toBe('idle');
  });

  it('mexer zera a contagem; tempo 0 desliga', () => {
    const { r, join } = setup(10, 1);
    const a = join('A');
    let frame = 0;
    while (r.world.players[a.pid]!.dead) r.tick();
    for (let i = 0; i < 80; i++) r.tick();
    move(r, a.pid, frame++);
    r.tick();
    r.handle(a.pid, [message('input', { clientFrame: frame & 255, controls: 0, gundir: 0 })]);
    for (let i = 0; i < 80; i++) r.tick();
    expect(a.conn.closed).toBeNull();

    const off = setup(0, 1);
    const b = off.join('B');
    off.ticks(3000);
    expect(b.conn.closed).toBeNull();
  });
});

describe('queda e volta (OG-047)', () => {
  it('queda de 10 s não perde frags, time nem vaga', () => {
    const { r, join, ticks } = setup();
    const a = join('Ana', 'u-1');
    join('Bia');
    ticks(5);
    r.world.players[a.pid]!.stats.frags = 4;
    const team = r.world.teamOf(a.pid);
    const token = a.conn.of('resumeToken')[0]!.token;
    r.disconnect(a.pid, a.conn);
    ticks(100); // 10 s
    expect(r.playerCount).toBe(2);
    const back = new TestConnection();
    const res = r.resume(back, { name: 'Ana', accountId: 'u-1' }, token);
    expect(res).toEqual({ ok: true, pid: a.pid });
    expect(r.world.teamOf(a.pid)).toBe(team);
    expect(r.world.players[a.pid]!.stats.frags).toBe(4);
    expect(back.of('welcome')[0]?.pid).toBe(a.pid);
    expect(back.of('frags').find((f) => f.pid === a.pid)?.frags).toBe(4);
  });

  it('quem volta pela conta numa página nova sabe o próprio nome, clã e número (OG-321, OG-443)', () => {
    const r = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 16, seed: 7 });
    const join = (name: string, accountId: string, clanTag?: string, number?: number) => {
      const conn = new TestConnection();
      const res = r.join(conn, { name, accountId, ...(clanTag ? { clanTag } : {}), ...(number ? { number } : {}) });
      if (!res.ok) throw new Error(res.text);
      return { conn, pid: res.pid };
    };
    const a = join('Ana', 'u-1', 'Sk', 7);
    const b = join('Bia', 'u-2');
    for (let i = 0; i < 5; i++) r.tick();
    r.disconnect(a.pid, a.conn);
    // página recarregada: sessão nova, sem token, volta à mesma vaga pela conta
    const back = new TestConnection();
    expect(r.resume(back, { name: 'Ana', accountId: 'u-1' }, '')).toEqual({ ok: true, pid: a.pid });
    const s = new ClientSession({ send: () => {}, onMapChange: () => {} });
    s.handle(back.received, 0);
    expect(s.me).toBe(a.pid);
    expect(s.names.get(a.pid)).toBe(chatName('Ana', 'Sk'));
    expect(s.names.get(b.pid)).toBe('Bia');
    expect(s.numbers.get(a.pid)).toBe(7); // o número também volta (OG-443)
    // a volta não anuncia uma entrada nova no feed
    expect(back.of('playerJoined').some((m) => m.pid === a.pid)).toBe(false);
  });

  it('conta volta mesmo sem token (outra aba); convidado precisa do token', () => {
    const { r, join } = setup();
    const a = join('Ana', 'u-1');
    const g = join('Visita*');
    r.disconnect(a.pid, a.conn);
    r.disconnect(g.pid, g.conn);
    expect(r.resume(new TestConnection(), { name: 'Ana', accountId: 'u-1' }, '')).toEqual({ ok: true, pid: a.pid });
    expect(r.resume(new TestConnection(), { name: 'Visita*', accountId: null }, '')).toBeNull();
    expect(r.resume(new TestConnection(), { name: 'Visita*', accountId: null }, g.conn.of('resumeToken')[0]!.token)).toEqual({ ok: true, pid: g.pid });
  });

  it('depois de 15 s a vaga é liberada e os outros veem a saída', () => {
    const { r, join, ticks } = setup();
    const a = join('Ana');
    const b = join('Bia');
    r.disconnect(a.pid, a.conn);
    ticks(150); // sai no tick em que se completam 150 frames da queda
    expect(r.playerCount).toBe(2);
    ticks(1);
    expect(r.playerCount).toBe(1);
    expect(b.conn.of('playerLeft').map((m) => m.pid)).toEqual([a.pid]);
    expect(r.resume(new TestConnection(), { name: 'Ana', accountId: null }, a.conn.of('resumeToken')[0]!.token)).toBeNull();
  });

  it('quem caiu fica parado; conexão antiga que cai depois da volta não derruba a nova', () => {
    const { r, join } = setup();
    const a = join('Ana', 'u-1');
    r.handle(a.pid, [message('input', { clientFrame: 1, controls: 5, gundir: 0 })]);
    const token = a.conn.of('resumeToken')[0]!.token;
    // volta com o token antes de o servidor perceber a queda: a conexão antiga é fechada
    const back = new TestConnection();
    expect(r.resume(back, { name: 'Ana', accountId: 'u-1' }, token)?.ok).toBe(true);
    expect(a.conn.closed).toEqual([4005, 'resumed']);
    r.disconnect(a.pid, a.conn); // o fechamento da antiga chega depois
    expect(r.playerCount).toBe(1);
    r.disconnect(a.pid, back);
    expect(r.world.players[a.pid]!.controls).toBe(0);
  });

  it('expulso por admin não fica com a vaga guardada', () => {
    const r = new Room({ id: 'r', preset: 'classic', maps, maxPlayers: 16, seed: 7, reconnectSeconds: 0 });
    const conn = new TestConnection();
    const res = r.join(conn, { name: 'Ana', accountId: null });
    if (!res.ok) throw new Error();
    r.disconnect(res.pid, conn);
    expect(r.playerCount).toBe(0); // reconnectSeconds 0 = como o original
  });
});
