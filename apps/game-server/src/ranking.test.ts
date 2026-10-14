// SPDX-License-Identifier: GPL-2.0-or-later
// Deltas do ranking (OG-084): vetores de plan/specs/ranking.md e integração com a sala.
import { fileURLToPath } from 'node:url';
import { message } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import type { DeltaReport, MatchReport } from './match-report.js';
import { playerStrength, RankingDeltas, teamModifiers, type PlayerRating } from './ranking.js';
import { Room, type Identity } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1', 'coliseu']);
const account = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const p = (team: 0 | 1, score = 0, neg = 0) => ({ team, score, neg });

describe('modificador de time (refresh_team_score_modifiers)', () => {
  it('força: 1,0 abaixo de 100 de score; senão (score+1)/(neg+1)', () => {
    expect(playerStrength(99, 0)).toBe(1);
    expect(playerStrength(900, 99)).toBeCloseTo(9.01);
  });

  it('times iguais → [1, 1]; time vazio → [0, 0]', () => {
    expect(teamModifiers([p(0), p(1)], false)).toEqual([1, 1]);
    expect(teamModifiers([p(0), p(0)], false)).toEqual([0, 0]);
  });

  it('limitado a [0,3333; 3]: o time mais fraco ganha mais', () => {
    expect(teamModifiers([p(0, 900, 99), p(1)], false)).toEqual([0.3333, 3]);
  });

  it('respawn_balancing_time ≥ 5: média em vez de soma', () => {
    // vermelho 1,0 + 3,0 (média 2,0) × azul 1,0
    expect(teamModifiers([p(0), p(0, 299, 99), p(1)], true)).toEqual([0.5, 2]);
    expect(teamModifiers([p(0), p(0, 299, 99), p(1)], false)).toEqual([0.3333, 3]); // 1/4 → limitado
  });
});

describe('acumuladores (score_frag, score_neg, client_report_status)', () => {
  it('trunca em direção a zero e só envia delta inteiro diferente de zero', () => {
    const d = new RankingDeltas();
    for (let i = 0; i < 3; i++) d.addFrag(1, 0.3333);
    expect(d.take()).toBeUndefined(); // 0,9999 → 0: nada a enviar, a fração continua
    d.addFrag(1, 0.3333);
    expect(d.take()).toEqual({ score: 1, neg: 0 });
    expect(d.take()).toBeUndefined(); // zerado depois do envio
    d.addFrag(-2, 0.3333);
    d.addNeg(1);
    expect(d.take()).toEqual({ score: 0, neg: 1 }); // −0,6666 → 0; a fração se perde
  });
});

describe('ranking na sala (OG-084)', () => {
  function setup(preset = 'ranked') {
    const matches: MatchReport[] = [];
    const deltas: DeltaReport[] = [];
    const r = new Room({ id: preset, preset, maps, mapFiles: ['outgun1', 'coliseu'], maxPlayers: 16, seed: 3, reportMatch: (m) => matches.push(m), reportDeltas: (d) => deltas.push(d) });
    const join = (n: number, rating: Partial<PlayerRating> | null = {}, extra: Partial<Identity> = {}) => {
      const res = r.join({ send() {}, close() {} }, { name: `J${n}`, accountId: account(n), ...(rating ? { rating: { score: 0, neg: 0, participate: true, ...rating } } : {}), ...extra });
      if (!res.ok) throw new Error(res.text);
      r.handle(res.pid, [message('clientReady', {})]);
      return res.pid;
    };
    return { r, join, matches, deltas };
  }

  it('Ranked com os mínimos: frags × modificador e neg vão no resultado da partida', () => {
    const { r, join, matches } = setup();
    // vermelho forte (força 9,01) × azul fraco: o azul ganha 3× e o vermelho 1/3
    const strong = join(1, { score: 900, neg: 99 });
    const others = [2, 3, 4].map((n) => join(n));
    const mate = others.find((pid) => r.world.teamOf(pid) === r.world.teamOf(strong))!;
    const red = [strong, mate];
    const blue = others.filter((pid) => pid !== mate);
    expect(blue).toHaveLength(2);
    const t = r.world.teamOf(strong);
    // força 9,01 + 1,0 contra 2,0: o time forte ganha 1/3 e o fraco 3
    expect(r.teamModifiers()[t]).toBe(0.3333);
    expect(r.teamModifiers()[1 - t]).toBe(3);
    const mRed = r.teamModifiers()[t]!;
    const mBlue = r.teamModifiers()[1 - t]!;
    r.sim.scoreFrag(blue[0]!, 1);
    r.sim.scoreFrag(red[0]!, 3);
    r.sim.scoreNeg(red[1]!, 2);
    r.settings.world.timeLimit = 30;
    for (let i = 0; i < 40; i++) r.tick();
    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.ranked).toBe(true);
    const of = (pid: number) => m.players.find((x) => x.slot === pid)!;
    expect(of(blue[0]!)).toMatchObject({ scoreDelta: Math.trunc(mBlue), negDelta: 0 });
    expect(of(blue[0]!).scoreDelta).toBe(3);
    expect(of(red[0]!)).toMatchObject({ scoreDelta: Math.trunc(3 * mRed), negDelta: 0 }); // 0,9999 → 0
    expect(of(red[1]!)).toMatchObject({ scoreDelta: 0, negDelta: 2 });
  });

  it('abaixo dos mínimos, sem participação ou no Casual: nenhum delta', () => {
    const few = setup();
    const a = few.join(1);
    few.join(2);
    few.join(3);
    few.r.sim.scoreFrag(a, 5);
    few.r.leave(a);
    expect(few.deltas).toEqual([]);

    const optOut = setup();
    const b = optOut.join(1, { participate: false });
    [2, 3, 4].forEach((n) => optOut.join(n));
    optOut.r.sim.scoreFrag(b, 5);
    optOut.r.leave(b);
    expect(optOut.deltas).toEqual([]);

    const casual = setup('classic');
    const c = casual.join(1);
    [2, 3, 4].forEach((n) => casual.join(n));
    casual.r.sim.scoreFrag(c, 5);
    casual.r.leave(c);
    expect(casual.deltas).toEqual([]);
  });

  it('quem sai leva os deltas na hora (client_disconnected); ids únicos por envio', () => {
    const { r, join, deltas } = setup();
    const pids = [1, 2, 3, 4].map((n) => join(n)); // 2 × 2, forças iguais: modificador 1
    r.sim.scoreFrag(pids[0]!, 2);
    r.sim.scoreNeg(pids[0]!, 1);
    r.sim.scoreNeg(pids[1]!, 1);
    r.leave(pids[0]!);
    r.leave(pids[1]!);
    expect(deltas.map((d) => [d.userId, d.scoreDelta, d.negDelta])).toEqual([
      [account(1), 2, 1],
      [account(2), 0, 1],
    ]);
    expect(new Set(deltas.map((d) => d.deltaId)).size).toBe(2);
  });

  it('time para quem entra (getLessScoredTeam): o mais fraco, que tem o maior modificador', () => {
    const { r, join } = setup('classic');
    const strong = join(1, { score: 5000, neg: 0 });
    const weak = join(2);
    expect(r.world.teamOf(strong)).not.toBe(r.world.teamOf(weak));
    // 1×1 empatado em humanos: getLessScoredTeam escolhe o time com maior modificador (o fraco)
    const third = join(3);
    expect(r.world.teamOf(third)).toBe(r.world.teamOf(weak));
  });
});
