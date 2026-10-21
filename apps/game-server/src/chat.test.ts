// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { censor, formatDuration, TalkMeter, wordSet } from './chat.js';

describe('anti-flood (D-60, OG-335: só rajadas extremas)', () => {
  it('30 mensagens seguidas passam; a 31ª bloqueia', () => {
    const m = new TalkMeter();
    const said = Array.from({ length: 31 }, () => m.speak());
    expect(said.slice(0, 30).every((b) => !b)).toBe(true);
    expect(said[30]).toBe(true);
  });

  it('uma mensagem por segundo nunca bloqueia', () => {
    const m = new TalkMeter();
    for (let i = 0; i < 300; i++) {
      expect(m.speak()).toBe(false);
      for (let f = 0; f < 10; f++) m.cool();
    }
  });

  it('o bloqueio acaba em ~11 s, mesmo insistindo durante ele', () => {
    const m = new TalkMeter();
    for (let i = 0; i < 31; i++) m.speak();
    for (let f = 0; f < 95; f++) {
      expect(m.speak()).toBe(true); // tentar de novo não prolonga
      m.cool();
    }
    for (let f = 0; f < 20; f++) m.cool(); // 31 − 11,5 ≤ 20: liberado
    expect(m.speak()).toBe(false);
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
