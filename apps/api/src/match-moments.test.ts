// SPDX-License-Identifier: GPL-2.0-or-later
// Multi-kill, troca e primeiro abate (OG-363) a partir de eventos montados à mão.
import { describe, expect, it } from 'vitest';
import type { MatchEvent } from './db/schema.js';
import { MULTI_KILL_WINDOW, TRADE_WINDOW, momentStats } from './match-moments.js';

// jogadores 0 e 1 no vermelho, 2 e 3 no azul
const TEAMS = [0, 0, 1, 1];
const kill = (t: number, killer: number, victim: number): MatchEvent => [t, 'kill', killer, victim, 0, 0, 0, 'rocket'];
const capture = (t: number, pid: number): MatchEvent => [t, 'capture', pid, 1];

describe('stats de momento (OG-363)', () => {
  it('multi-kill: até a janela entre abates encadeia; a sequência conta uma vez', () => {
    const s = momentStats([kill(0, 0, 2), kill(MULTI_KILL_WINDOW, 0, 3), kill(2 * MULTI_KILL_WINDOW, 0, 2), kill(1000, 0, 3), kill(1001 + MULTI_KILL_WINDOW, 0, 2)], TEAMS);
    expect(s[0]!.multiKills).toBe(1);
  });

  it('troca: matar em até 3 s quem matou um aliado; fora da janela, a si mesmo ou sem aliado não conta', () => {
    expect(momentStats([kill(100, 2, 0), kill(100 + TRADE_WINDOW, 1, 2)], TEAMS)[1]!.trades).toBe(1);
    expect(momentStats([kill(100, 2, 0), kill(101 + TRADE_WINDOW, 1, 2)], TEAMS)[1]!.trades).toBe(0);
    // vingar a si mesmo não existe (estava morto); matar quem não matou ninguém também não
    expect(momentStats([kill(100, 2, 1), kill(110, 1, 3)], TEAMS)[1]!.trades).toBe(0);
  });

  it('primeiro abate: o da partida e o primeiro depois de cada captura', () => {
    const s = momentStats([kill(10, 2, 0), kill(20, 0, 3), capture(30, 1), kill(40, 1, 2), kill(50, 3, 1), capture(60, 2), capture(70, 3), kill(80, 0, 2)], TEAMS);
    expect(s.map((x) => x.firstKills)).toEqual([1, 1, 1, 0]);
  });

  it('abate em aliado, suicídio e matador fora dos slots são ignorados', () => {
    const s = momentStats([kill(0, 0, 1), kill(1, 0, 0), kill(2, -1, 2), kill(3, 0, 2), kill(4, 0, 3)], TEAMS);
    expect(s[0]).toEqual({ multiKills: 1, trades: 0, firstKills: 1 });
  });
});
