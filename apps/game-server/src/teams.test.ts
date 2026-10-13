// SPDX-License-Identifier: GPL-2.0-or-later
import { GlibcRand } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { balanceMoves, botToRebalance, botToRemove, ColorPool, joinTeam, NO_COLOR, shuffleSwaps, teamChangeFor, type Slot } from './teams.js';

/** 8 vagas: 0..3 vermelho, 4..7 azul. */
const MAX = 8;
const human = (over: Partial<Slot> = {}): Slot => ({ bot: false, dead: false, hasFlag: false, wantChange: false, ...over });
const bot = (over: Partial<Slot> = {}): Slot => human({ bot: true, ...over });
function slots(map: Record<number, Slot>): (Slot | undefined)[] {
  return Array.from({ length: MAX }, (_, i) => map[i]);
}

describe('RN-TIM-01: time de quem entra', () => {
  const never = (): 0 | 1 => {
    throw new Error('não devia sortear');
  };
  it('o time com menos jogadores', () => {
    expect(joinTeam(slots({ 0: human(), 4: human(), 5: human() }), MAX, never)).toBe(0);
    expect(joinTeam(slots({ 0: human(), 1: human(), 4: human() }), MAX, never)).toBe(1);
  });
  it('empate: o único time com humanos e bots', () => {
    expect(joinTeam(slots({ 0: human(), 1: bot(), 4: bot(), 5: bot() }), MAX, never)).toBe(0);
    expect(joinTeam(slots({ 0: bot(), 1: bot(), 4: human(), 5: bot() }), MAX, never)).toBe(1);
  });
  it('empate: o time com menos humanos', () => {
    expect(joinTeam(slots({ 0: human(), 1: human(), 4: human(), 5: bot() }), MAX, never)).toBe(1);
  });
  it('empate total: o time mais fraco (desempate do servidor)', () => {
    expect(joinTeam(slots({ 0: human(), 4: human() }), MAX, () => 1)).toBe(1);
  });
});

describe('RN-TIM-02: troca de time (Ctrl+End)', () => {
  it('o outro time tem 2 a menos: muda sem troca, para a primeira vaga livre', () => {
    const s = slots({ 0: human({ wantChange: true }), 1: human(), 2: human(), 4: human() });
    expect(teamChangeFor(s, MAX, 0)).toEqual({ kind: 'move', from: 0, to: 5 });
  });
  it('alguém do outro time quer trocar: troca os dois', () => {
    const s = slots({ 0: human({ wantChange: true }), 1: human(), 4: human(), 5: human({ wantChange: true }) });
    expect(teamChangeFor(s, MAX, 0)).toEqual({ kind: 'swap', a: 0, b: 5 });
  });
  it('o meu time tem 1 a mais: muda', () => {
    const s = slots({ 0: human({ wantChange: true }), 1: human(), 4: human() });
    expect(teamChangeFor(s, MAX, 0)).toEqual({ kind: 'move', from: 0, to: 5 });
  });
  it('times iguais e ninguém quer trocar: troca com um bot (morto primeiro)', () => {
    const s = slots({ 0: human({ wantChange: true }), 1: human(), 4: bot({ hasFlag: true }), 5: bot(), 6: bot({ dead: true }), 2: human() });
    expect(teamChangeFor(s, MAX, 0)).toEqual({ kind: 'swap', a: 0, b: 6 });
  });
  it('bot sem bandeira antes de bot com bandeira', () => {
    const s = slots({ 0: human({ wantChange: true }), 4: bot({ hasFlag: true }), 5: bot() });
    expect(teamChangeFor(s, MAX, 0)).toEqual({ kind: 'swap', a: 0, b: 5 });
  });
  it('só bots com bandeira: qualquer um', () => {
    const s = slots({ 0: human({ wantChange: true }), 4: bot({ hasFlag: true }) });
    expect(teamChangeFor(s, MAX, 0)).toEqual({ kind: 'swap', a: 0, b: 4 });
  });
  it('times iguais, sem bots e ninguém querendo: fica', () => {
    expect(teamChangeFor(slots({ 0: human({ wantChange: true }), 4: human() }), MAX, 0)).toBeNull();
  });
  it('o outro time tem mais gente: não muda (nem com bot pedindo)', () => {
    expect(teamChangeFor(slots({ 4: bot({ wantChange: true }), 0: human(), 1: human(), 5: bot() }), MAX, 4)).toBeNull();
  });
  it('sem pedido: nada', () => {
    expect(teamChangeFor(slots({ 0: human(), 4: bot() }), MAX, 0)).toBeNull();
  });
});

describe('bots dando lugar e equilibrando', () => {
  it('sala cheia: sai um bot do time maior, morto primeiro', () => {
    const s = slots({ 0: human(), 1: bot(), 2: bot({ dead: true }), 3: bot(), 4: human(), 5: bot({ dead: true }), 6: human() });
    expect(botToRemove(s, MAX)).toBe(2);
  });
  it('times iguais: qualquer time; sem bot morto, um sem bandeira', () => {
    expect(botToRemove(slots({ 0: bot({ hasFlag: true }), 4: bot() }), MAX)).toBe(4);
  });
  it('diferença de 2: um bot do time maior pede troca', () => {
    expect(botToRebalance(slots({ 0: human(), 1: bot(), 2: bot({ dead: true }), 4: human() }), MAX)).toBe(2);
    expect(botToRebalance(slots({ 0: human(), 1: bot(), 4: human() }), MAX)).toBe(-1);
  });
});

describe('RN-TIM-03: balanceamento e embaralhamento por mapa', () => {
  it('balance: move do time maior até a diferença ser no máximo 1', () => {
    const moves = balanceMoves(slots({ 0: human(), 1: human(), 2: human(), 3: human(), 4: human() }), MAX, { rand: () => 0 });
    expect(moves).toEqual([{ from: 0, to: 5 }]);
  });
  it('shuffle: só trocas entre times, com 3+ jogadores', () => {
    expect(shuffleSwaps(slots({ 0: human(), 4: human() }), MAX, new GlibcRand(1))).toEqual([]);
    const swaps = shuffleSwaps(slots({ 0: human(), 1: human(), 4: human(), 5: human() }), MAX, new GlibcRand(3));
    for (const [a, b] of swaps) expect(a < 4 && b >= 4).toBe(true);
  });
});

describe('RN-TIM-05: cores pessoais', () => {
  it('a primeira favorita livre do time; times não competem', () => {
    const pool = new ColorPool(new GlibcRand(1));
    expect(pool.assign(0, NO_COLOR, [3, 4])).toBe(3);
    expect(pool.assign(0, NO_COLOR, [3, 4])).toBe(4);
    expect(pool.assign(1, NO_COLOR, [3])).toBe(3);
  });
  it('sem favorita livre: sorteia uma livre; mantém a atual se já tem', () => {
    const pool = new ColorPool(new GlibcRand(1));
    const a = pool.assign(0, NO_COLOR, []);
    expect(a).toBeLessThan(16);
    expect(pool.assign(0, a, [])).toBe(a);
    const all = new Set([a]);
    for (let i = 1; i < 16; i++) all.add(pool.assign(0, NO_COLOR, []));
    expect(all.size).toBe(16);
  });
});
