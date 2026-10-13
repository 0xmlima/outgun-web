// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { censor, formatDuration, isFlood, TalkMeter, wordSet } from './chat.js';

describe('anti-flood (RN-CHT-02, mesmos limiares do original)', () => {
  it('mensagens seguidas: a 4ª no mesmo frame já é "too much talk"', () => {
    // temp: 1, 1+4=5, 5+6=11 → bloqueia na 3ª
    const m = new TalkMeter();
    expect([m.speak(), m.speak(), m.speak()]).toEqual([false, false, true]);
    expect(m.temp).toBe(18);
  });

  it('esfria 0,1 por frame (temp até 0, calor até 1)', () => {
    const m = new TalkMeter();
    m.speak(); // temp 1, calor 4
    for (let i = 0; i < 10; i++) m.cool();
    expect(m.temp).toBeCloseTo(0);
    expect(m.hotness).toBeCloseTo(3);
    for (let i = 0; i < 100; i++) m.cool();
    expect(m.hotness).toBe(1);
  });

  it('uma mensagem a cada 3 s nunca bloqueia; a cada 1 s bloqueia', () => {
    const run = (gapFrames: number) => {
      const m = new TalkMeter();
      let blocked = false;
      for (let i = 0; i < 30; i++) {
        blocked ||= m.speak();
        for (let f = 0; f < gapFrames; f++) m.cool();
      }
      return blocked;
    };
    expect(run(30)).toBe(false);
    expect(run(10)).toBe(true);
  });

  it('depois do bloqueio, leva 8 s para voltar a falar', () => {
    const m = new TalkMeter();
    m.speak();
    m.speak();
    m.speak(); // bloqueado, temp 18, calor 6 (teto)
    for (let i = 0; i < 79; i++) m.cool();
    expect(m.speak()).toBe(true); // 18 - 7,9 = 10,1 + 1 > 10
    const n = new TalkMeter();
    n.speak();
    n.speak();
    n.speak();
    for (let i = 0; i < 140; i++) n.cool();
    expect(n.speak()).toBe(false);
  });

  it('isFlood: mesmo caractere 7 vezes seguidas', () => {
    expect(isFlood('aaaaaa')).toBe(false);
    expect(isFlood('aaaaaaa')).toBe(true);
    expect(isFlood('ab!!!!!!!c')).toBe(true);
    expect(isFlood('aaaaaabaaaaaa')).toBe(false);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 seconds'],
    [1, '1 second'],
    [59, '59 seconds'],
    [60, '1:00 minutes'],
    [3599, '59:59 minutes'],
    [3600, '1:00:00 hours'],
    [90061, '1 day 1:01:01'],
    [2 * 86400, '2 days 0:00:00'],
  ])('%i → %s', (s, out) => expect(formatDuration(s)).toBe(out));
});

describe('filtro de palavras', () => {
  it('troca palavras da lista por * sem diferenciar maiúsculas e acentos', () => {
    const words = wordSet(['bobo', 'chatô']);
    expect(censor('Seu BOBO, que chato!', words)).toBe('Seu ****, que *****!');
    expect(censor('bobagem', words)).toBe('bobagem');
    expect(censor('oi', new Set())).toBe('oi');
  });
});
