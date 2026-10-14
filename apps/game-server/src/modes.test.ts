// SPDX-License-Identifier: GPL-2.0-or-later
// Modos de jogo Casual e Ranked (OG-049, RN-MOD-01..06, D-10, D-11).
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { GlibcRand, Position } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { rankingMinimumsMet, type MatchReport } from './match-report.js';
import { Room, type Connection, type Identity } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1']);
const account = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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

function setup(preset: string, reports: MatchReport[] = []) {
  let wall = Date.parse('2026-10-13T12:00:00Z');
  const r = new Room({ id: preset, preset, maps, mapFiles: ['outgun1'], maxPlayers: 16, seed: 11, reportMatch: (m) => reports.push(m), wallClock: () => (wall += 100) });
  const join = (name: string, identity: Partial<Identity> = {}) => {
    const conn = new TestConnection();
    const res = r.join(conn, { name, accountId: null, ...identity });
    if (!res.ok) return { conn, pid: -1, reason: res.reason };
    r.handle(res.pid, [message('clientReady', {})]);
    return { conn, pid: res.pid, reason: null };
  };
  const say = (pid: number, text: string) => {
    r.handle(pid, [message('chat', { text, teamOnly: false })]);
    r.tick();
  };
  return { r, join, say, reports };
}

/** Joga `frames` frames com 4 contas trocando tiros (todos postos na mesma sala de tempos em tempos). */
function play(r: Room, pids: number[], frames: number, each: (frame: number) => void) {
  const rng = new GlibcRand(5);
  for (let f = 1; f <= frames; f++) {
    if (f % 40 === 0) {
      pids.forEach((pid, i) => {
        const p = r.world.players[pid];
        if (p && !p.dead) p.pos = new Position(3, 2, 80 + i * 100, 120 + (i % 2) * 80);
      });
    }
    for (const pid of pids) {
      const msgs: AnyMessage[] = [message('input', { clientFrame: f % 256, controls: rng.rand() % 32, gundir: rng.rand() % 2048 })];
      if (f === 1) msgs.push(message('fire', { on: true }));
      r.handle(pid, msgs);
    }
    r.tick();
    each(f);
  }
}

describe('Ranked (RN-MOD-02): sem power-ups', () => {
  it('10 minutos de partida simulada: nenhum power-up no mapa, no spawn ou largado ao morrer', () => {
    const { r, join } = setup('ranked');
    const pids = [1, 2, 3, 4].map((n) => join(`J${n}`, { accountId: account(n) }).pid);
    let deaths = 0;
    play(r, pids, 6000, () => {
      expect(r.world.items.filter((i) => i.isReal())).toHaveLength(0);
      for (const pid of pids) {
        const p = r.world.players[pid]!;
        if (p.dead) continue;
        expect([p.shield, p.power, p.turbo, p.deathbringer, p.weapon, p.visibility]).toEqual([0, false, false, false, 1, 255]);
      }
    });
    for (const pid of pids) deaths += r.world.players[pid]!.stats.deaths;
    // a partida teve mortes (e portanto renascimentos) de verdade
    expect(deaths).toBeGreaterThan(10);
  });

  it('no Casual (Clássico) os power-ups aparecem', () => {
    const { r, join } = setup('classic');
    const pids = [join('Ana').pid, join('Bia').pid];
    let seen = 0;
    play(r, pids, 1200, () => (seen = Math.max(seen, r.world.items.filter((i) => i.isReal()).length)));
    expect(seen).toBeGreaterThan(0);
  });
});

describe('entrada, regras e bots por modo (RN-MOD-03/04/06)', () => {
  it('convidado é recusado no Ranked; conta entra', () => {
    const { join } = setup('ranked');
    expect(join('Visita*').reason).toBe('rankedNeedsAccount');
    expect(join('Ana', { accountId: account(1) }).reason).toBeNull();
  });

  it('/set: dono da sala privada muda as regras no Casual; no Ranked nem dono nem admin', () => {
    const casual = setup('classic');
    const visita = casual.join('Visita*');
    const dono = casual.join('Dono', { accountId: account(1), owner: true });
    casual.say(visita.pid, '/set capture_limit 3');
    expect(visita.conn.texts().at(-1)).toBe('Unknown command set. Type /help for a list.');
    casual.say(dono.pid, '/help');
    expect(dono.conn.texts()).toContain('/set        manage room settings');
    casual.say(dono.pid, '/set capture_limit 3');
    expect(casual.r.settings.world.captureLimit).toBe(3);

    const ranked = setup('ranked');
    const rdono = ranked.join('Dono', { accountId: account(1), owner: true });
    const radm = ranked.join('Chefe', { accountId: account(2), admin: true });
    for (const pid of [rdono.pid, radm.pid]) ranked.say(pid, '/set pups_max 10');
    expect(rdono.conn.texts().at(-1)).toBe('Unknown command set. Type /help for a list.');
    expect(radm.conn.texts().at(-1)).toBe('Unknown command set. Type /help for a list.');
    expect(ranked.r.settings.powerups.pupsMax).toBe(0);
  });

  it('Ranked nunca recebe bot; Casual aceita', () => {
    const ranked = setup('ranked');
    expect(ranked.r.addBot('Robô').ok).toBe(false);
    expect(ranked.r.settings.server.minBots).toBe(0);
    expect(ranked.r.settings.server.botsFill).toBe(0);
    const casual = setup('classic');
    expect(casual.r.addBot('Robô').ok).toBe(true);
  });
});

describe('resultado da partida (RN-MOD-05, RN-RNK-01)', () => {
  it('mínimos: 2 contas distintas e 4 jogadores', () => {
    const p = (accountId: string | null, bot = false) => ({ name: 'x', accountId, bot });
    expect(rankingMinimumsMet([p(account(1)), p(account(2)), p(account(3)), p(account(4))], 2, 4)).toBe(true);
    expect(rankingMinimumsMet([p(account(1)), p(account(1)), p(account(1)), p(account(1))], 2, 4)).toBe(false);
    expect(rankingMinimumsMet([p(account(1)), p(account(2)), p(account(3))], 2, 4)).toBe(false);
  });

  const finish = (r: Room) => {
    r.settings.world.captureLimit = 1;
    r.settings.world.timeLimit = 60; // frames: termina por tempo
    for (let i = 0; i < 100; i++) r.tick();
  };

  it('Ranked com os mínimos manda partida ranqueada, com contas e estatísticas', () => {
    const { r, join, reports } = setup('ranked');
    [1, 2, 3, 4].forEach((n) => join(`J${n}`, { accountId: account(n) }));
    finish(r);
    expect(reports).toHaveLength(1);
    const m = reports[0]!;
    expect(m).toMatchObject({ roomId: 'ranked', mode: 'ranked', ranked: true, map: 'outgun1' });
    expect(m.serverMatchId).toMatch(/^ranked-[a-z0-9]+-1$/);
    expect(m.players).toHaveLength(4);
    expect(m.players[0]).toMatchObject({ isBot: false, stats: expect.objectContaining({ shots: expect.any(Number) }) });
    expect(m.players.map((p) => p.userId).sort()).toEqual([1, 2, 3, 4].map(account));
    expect(Date.parse(m.endedAt)).toBeGreaterThan(Date.parse(m.startedAt));
  });

  it('Ranked abaixo dos mínimos e Casual mandam só estatísticas', () => {
    const ranked = setup('ranked');
    [1, 2, 3].forEach((n) => ranked.join(`J${n}`, { accountId: account(n) }));
    finish(ranked.r);
    expect(ranked.reports[0]).toMatchObject({ mode: 'ranked', ranked: false });

    const casual = setup('classic');
    [1, 2, 3, 4].forEach((n) => casual.join(`J${n}`, { accountId: account(n) }));
    finish(casual.r);
    expect(casual.reports[0]).toMatchObject({ mode: 'casual', ranked: false });
    expect(casual.reports[0]!.players.every((p) => p.scoreDelta === 0 && p.negDelta === 0)).toBe(true);
  });
});
