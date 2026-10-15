// SPDX-License-Identifier: GPL-2.0-or-later
// População de bots na sala (OG-054, RN-BOT-01/03, D-11, D-27) e o comando /bot.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room, type Connection, type Identity } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
  texts(): string[] {
    return this.received.flatMap((m) => (m.type === 'text' ? [m.text] : []));
  }
}

function setup(preset = 'classic', opts: { botsFill?: number; maxPlayers?: number } = {}) {
  const r = new Room({ id: preset, preset, maps, mapFiles: ['outgun1'], maxPlayers: opts.maxPlayers ?? 8, seed: 11, ...(opts.botsFill !== undefined ? { botsFill: opts.botsFill } : {}) });
  const join = (name: string, identity: Partial<Identity> = {}) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name, accountId: null, ...identity });
    if (!res.ok) throw new Error(res.reason);
    r.handle(res.pid, [message('clientReady', {})]);
    r.tick();
    return { conn, pid: res.pid };
  };
  const say = (pid: number, text: string) => {
    r.handle(pid, [message('chat', { text, teamOnly: false })]);
    r.tick();
    r.tick();
  };
  const botNames = () => r.bots().map((pid) => r.playerName(pid));
  return { r, join, say, botNames };
}

describe('RN-BOT-01: população automática no Casual', () => {
  it('bots_fill completa a sala quando entra o primeiro humano; sem humanos, nenhum bot (D-27)', () => {
    const { r, join } = setup('classic', { botsFill: 6 });
    r.tick();
    expect(r.bots()).toHaveLength(0);
    const a = join('Ana');
    expect(r.bots()).toHaveLength(5);
    const b = join('Bia');
    expect(r.bots()).toHaveLength(4);
    r.leave(a.pid);
    r.tick();
    expect(r.bots()).toHaveLength(5);
    r.leave(b.pid);
    r.tick();
    expect(r.playerCount).toBe(0);
  });

  it('humano entrando com a sala cheia substitui um bot', () => {
    const { r, join } = setup('classic', { botsFill: 8 });
    join('Ana');
    expect(r.playerCount).toBe(8);
    join('Bia');
    expect(r.playerCount).toBe(8);
    expect(r.bots()).toHaveLength(6);
  });

  it('nomes com prefixo BOT, sem repetir', () => {
    const { join, botNames } = setup('classic', { botsFill: 8 });
    join('Ana');
    const names = botNames();
    expect(names.every((n) => n.startsWith('BOT '))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('Ranked ignora bots_fill e não tem /bot (D-11)', () => {
    const { r, join, say } = setup('ranked', { botsFill: 6 });
    const adm = join('Chefe', { accountId: '00000000-0000-4000-8000-000000000001', admin: true });
    expect(r.bots()).toHaveLength(0);
    say(adm.pid, '/bot add 2');
    expect(adm.conn.texts().at(-1)).toBe('Bots are not allowed in Ranked rooms.');
    expect(r.bots()).toHaveLength(0);
  });
});

describe('/bot (src/server.cpp:1328-1456)', () => {
  it('add, remove, fill, balance e ping como o original', () => {
    const { r, join, say } = setup();
    const adm = join('Chefe', { admin: true });
    say(adm.pid, '/bot add 3');
    expect(adm.conn.texts().at(-1)).toBe('3 bots will be added.');
    expect(r.bots()).toHaveLength(3);
    say(adm.pid, '/bot remove');
    expect(adm.conn.texts().at(-1)).toBe('1 bots will be removed.');
    expect(r.bots()).toHaveLength(2);
    say(adm.pid, '/bot balance on');
    expect(adm.conn.texts().at(-1)).toBe('Balance bot is now on.');
    expect(r.bots()).toHaveLength(3);
    say(adm.pid, '/bot fill 6');
    expect(adm.conn.texts().at(-1)).toBe('Bot fill is now 6.');
    expect(r.bots()).toHaveLength(7); // max(6−1, 0) + 2 extra = 7 → 8 com o humano, par
    say(adm.pid, '/bot fill 99');
    expect(adm.conn.texts().at(-1)).toBe('Syntax error. Valid range is 0 - 8.');
    say(adm.pid, '/bot ping 250');
    expect(r.settings.server.botPing).toBe(250);
    say(adm.pid, '/bot');
    expect(adm.conn.texts().at(-1)).toBe('min_bots 0, bots_fill 6, extra_bots 2, balance_bot on');
  });

  it('list e rename; jogador comum não tem /bot; dono da sala Casual tem', () => {
    const { r, join, say } = setup();
    const adm = join('Chefe', { admin: true });
    const joe = join('Joe');
    say(adm.pid, '/bot add 2');
    say(adm.pid, '/bot list');
    const lines = adm.conn.texts();
    expect(lines).toContain('Red team:');
    const bot = r.bots()[0] as number;
    const uid = Number(lines.find((l) => l.includes(r.playerName(bot)))!.trim().split(' ')[0]);
    say(adm.pid, `/bot rename ${uid} Robo  Rocha`);
    expect(r.playerName(bot)).toBe('Robo  Rocha');
    expect(adm.conn.received.some((m) => m.type === 'playerName' && m.name === 'Robo  Rocha')).toBe(true);
    say(adm.pid, '/bot rename 999 X');
    expect(adm.conn.texts().at(-1)).toBe('No such bot. Type /bot list for a list of IDs.');
    say(joe.pid, '/bot add');
    expect(joe.conn.texts().at(-1)).toBe('Unknown command bot. Type /help for a list.');
    const dono = join('Dono', { owner: true });
    say(dono.pid, '/bot add');
    expect(dono.conn.texts().at(-1)).toBe('1 bots will be added.');
  });
});

describe('OG-289: bots do Casual escolhidos pelo cliente (D-51)', () => {
  const levels = (r: Room) =>
    r
      .botClients()
      .map((b) => b.skill.level)
      .sort();

  it('sala privada criada com bots: quantidade fixa e nível; no modo variável cada bot sorteia o seu', () => {
    const fixed = new Room({ id: 'p1', preset: 'classic', maps, mapFiles: ['outgun1'], maxPlayers: 16, seed: 11, botsFill: 8, casualBots: { bots: 6, level: 2 } });
    fixed.join(new TestConnection(), { name: 'Ana', accountId: null });
    fixed.tick();
    expect(levels(fixed)).toEqual([2, 2, 2, 2, 2, 2]);
    const varied = new Room({ id: 'p2', preset: 'classic', maps, mapFiles: ['outgun1'], maxPlayers: 16, seed: 11, casualBots: { bots: 10, level: 0 } });
    varied.join(new TestConnection(), { name: 'Ana', accountId: null });
    varied.tick();
    const got = levels(varied);
    expect(got).toHaveLength(10);
    expect(got.every((l) => l >= 1 && l <= 5)).toBe(true);
    expect(new Set(got).size).toBeGreaterThan(1);
  });

  it('só o dono ou admin muda; vale na próxima partida, ou já com reinício', () => {
    const { r, join } = setup('classic', { maxPlayers: 16 });
    const dono = join('Dono', { owner: true });
    const joe = join('Joe');
    expect(dono.conn.received.some((m) => m.type === 'casualConfig')).toBe(true);
    expect(joe.conn.received.some((m) => m.type === 'casualConfig')).toBe(false);

    r.handle(joe.pid, [message('casualBots', { bots: 4, level: 5, restart: true })]);
    r.tick();
    expect(r.bots()).toHaveLength(0);
    expect(joe.conn.texts().at(-1)).toBe('Only the room owner can change the bots.');

    r.handle(dono.pid, [message('casualBots', { bots: 4, level: 5, restart: false })]);
    r.tick();
    r.tick();
    expect(r.bots()).toHaveLength(0); // pendente até a próxima partida
    expect(dono.conn.received.filter((m) => m.type === 'casualConfig').at(-1)).toMatchObject({ pending: true });

    r.handle(dono.pid, [message('casualBots', { bots: 4, level: 5, restart: true })]);
    r.tick();
    r.tick();
    expect(levels(r)).toEqual([5, 5, 5, 5]);
    expect(dono.conn.received.filter((m) => m.type === 'casualConfig').at(-1)).toMatchObject({ bots: 4, level: 5, pending: false });
  });

  it('/bot level: dono vê e muda o nível dos próximos bots', () => {
    const { r, join, say } = setup('classic', { maxPlayers: 16 });
    const dono = join('Dono', { owner: true });
    say(dono.pid, '/bot level');
    expect(dono.conn.texts().at(-1)).toBe('Current bot level is 4.');
    say(dono.pid, '/bot level 1');
    expect(dono.conn.texts().at(-1)).toBe('Bot level is now 1. New bots will use it.');
    say(dono.pid, '/bot add');
    expect(levels(r)).toEqual([1]);
    say(dono.pid, '/bot level 9');
    expect(dono.conn.texts().at(-1)).toBe('Syntax error. Valid level range is 0 - 5 (0 = variable).');
  });
});
