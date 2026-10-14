// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { bestPlayer, captureTimeline } from './MatchReport.js';
import type { PlayerLine } from './stats.js';

const p = (slot: number, frags: number, captures = 0, kills = frags, deaths = 0): PlayerLine => ({
  slot, name: `p${slot}`, username: null, team: slot % 2, isBot: false, frags, kills, deaths, captures, playSeconds: 0, scoreDelta: 0, negDelta: 0, stats: {},
});

describe('relatório de partida (OG-214)', () => {
  it('melhor jogador: mais frags; desempate por capturas, kills e menos mortes', () => {
    expect(bestPlayer([p(0, 5), p(1, 7), p(2, 7, 1)])?.slot).toBe(2);
    expect(bestPlayer([p(0, 3, 0, 3, 4), p(1, 3, 0, 3, 1)])?.slot).toBe(1);
    expect(bestPlayer([])).toBeUndefined();
  });

  it('linha do tempo: placar depois de cada captura, a partir do placar base', () => {
    const t = captureTimeline(
      [
        { time: 60, team: 0, capturer: 'a', assistant: null },
        { time: 125, team: 1, capturer: 'b', assistant: 'c' },
      ],
      [1, 0],
    );
    expect(t.map((c) => `${c.red}-${c.blue}`)).toEqual(['2-0', '2-1']);
  });
});
