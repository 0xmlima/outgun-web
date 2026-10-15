// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { formatPlayers, newSeries, recordSeriesGame, seriesOver, seriesWinner, type SeriesBestOf } from './ranked.js';

const play = (bestOf: SeriesBestOf, games: (0 | 1 | null)[]) => games.reduce(recordSeriesGame, newSeries(bestOf));

describe('formatos e séries do Ranked (OG-250)', () => {
  it('sala = 2 × N', () => {
    expect([formatPlayers('3x3'), formatPlayers('4x4'), formatPlayers('5x5')]).toEqual([6, 8, 10]);
  });

  it('md1 = um jogo', () => {
    const s = play(1, [1]);
    expect(seriesOver(s)).toBe(true);
    expect(seriesWinner(s)).toBe(1);
    expect(seriesOver(play(1, [null]))).toBe(true);
    expect(seriesWinner(play(1, [null]))).toBe(null);
  });

  it('md3 termina em 2-0 e em 2-1', () => {
    expect(seriesOver(play(3, [0]))).toBe(false);
    const twoZero = play(3, [0, 0]);
    expect([seriesOver(twoZero), seriesWinner(twoZero), twoZero.games]).toEqual([true, 0, 2]);
    expect(seriesOver(play(3, [0, 1]))).toBe(false);
    const twoOne = play(3, [0, 1, 1]);
    expect([seriesWinner(twoOne), twoOne.wins]).toEqual([1, [1, 2]]);
  });

  it('md5 termina em 3-x; jogos depois do fim não contam', () => {
    expect(seriesWinner(play(5, [1, 1, 1]))).toBe(1);
    expect(seriesOver(play(5, [0, 1, 0, 1]))).toBe(false);
    const s = play(5, [0, 1, 0, 1, 0, 1]);
    expect([s.games, s.wins, seriesWinner(s)]).toEqual([5, [3, 2], 0]);
  });

  it('empates: série acaba depois de N jogos, sem ponto', () => {
    const s = play(3, [0, null, null]);
    expect([seriesOver(s), seriesWinner(s), s.wins]).toEqual([true, 0, [1, 0]]);
    expect(seriesWinner(play(3, [null, null, null]))).toBe(null);
  });
});
