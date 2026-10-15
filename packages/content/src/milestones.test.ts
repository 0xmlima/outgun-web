// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { ACCURACY_MIN_SHOTS, MILESTONES, milestonesFrom, type MilestoneMatch } from './milestones.js';

const match = (i: number, o: Partial<MilestoneMatch> = {}): MilestoneMatch => ({
  matchId: `m${i}`,
  endedAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
  result: -1,
  kills: 0,
  captures: 0,
  shots: 0,
  hits: 0,
  ...o,
});
const series = (n: number, o: (i: number) => Partial<MilestoneMatch> = () => ({})) => Array.from({ length: n }, (_, i) => match(i, o(i)));
/** Marco → partida da conquista. */
const got = (list: MilestoneMatch[], beta = false) => Object.fromEntries(milestonesFrom(list, { beta }).map((a) => [a.id, a.matchId]));

describe('marcos (OG-213)', () => {
  it('catálogo sem ids repetidos', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
  });

  it('sem partidas, nenhum marco', () => {
    expect(milestonesFrom([], { beta: true })).toEqual([]);
  });

  it('partidas: 1, 10, 100 e 1000, na partida que cruza o limite', () => {
    const g = got(series(1000));
    expect([g.first_match, g.matches_10, g.matches_100, g.matches_1000]).toEqual(['m0', 'm9', 'm99', 'm999']);
    expect(got(series(999)).matches_1000).toBeUndefined();
  });

  it('capturas: primeira e 50', () => {
    const g = got(series(30, (i) => ({ captures: i === 4 ? 1 : i > 4 ? 2 : 0 })));
    expect(g.first_capture).toBe('m4');
    expect(g.captures_50).toBe('m29'); // 1 + 2*25 = 51 na m29, 49 na m28
  });

  it('kills: 100, 1000 e 10000 (kills em bots já vêm descontados; negativos não tiram)', () => {
    const g = got(series(101, (i) => ({ kills: i === 0 ? -5 : 100 })));
    expect([g.kills_100, g.kills_1000, g.kills_10000]).toEqual(['m1', 'm10', 'm100']);
    expect(got(series(1, () => ({ kills: 99 }))).kills_100).toBeUndefined();
  });

  it(`precisão ≥ 50% numa partida com pelo menos ${ACCURACY_MIN_SHOTS} tiros`, () => {
    expect(got([match(0, { shots: ACCURACY_MIN_SHOTS - 1, hits: ACCURACY_MIN_SHOTS - 1 })]).accuracy_50).toBeUndefined();
    expect(got([match(0, { shots: 40, hits: 19 })]).accuracy_50).toBeUndefined();
    expect(got([match(0, { shots: 40, hits: 19 }), match(1, { shots: 40, hits: 20 })]).accuracy_50).toBe('m1');
  });

  it('10 vitórias seguidas; empate ou derrota zeram a sequência', () => {
    expect(got(series(10, () => ({ result: 1 }))).win_streak_10).toBe('m9');
    expect(got(series(12, (i) => ({ result: i === 5 ? 0 : 1 }))).win_streak_10).toBeUndefined();
    expect(got(series(17, (i) => ({ result: i === 6 ? -1 : 1 }))).win_streak_10).toBe('m16');
  });

  it('beta: na primeira partida, só quando jogada no beta', () => {
    expect(got(series(3), true).beta).toBe('m0');
    expect(got(series(3), false).beta).toBeUndefined();
  });

  it('idempotente e na ordem do catálogo', () => {
    const list = series(120, (i) => ({ result: 1, kills: 1, captures: 1, shots: 20, hits: 10 + (i % 2) }));
    const a = milestonesFrom(list, { beta: true });
    expect(milestonesFrom(list, { beta: true })).toEqual(a);
    const order = MILESTONES.map((m) => m.id);
    expect(a.map((x) => x.id)).toEqual(order.filter((id) => a.some((x) => x.id === id)));
  });
});
