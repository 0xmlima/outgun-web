// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { MULTI_KILL_WINDOW, WILD_FLAG, type MilestoneEvent, type MilestoneEvents } from './milestone-events.js';
import { ACCURACY_MIN_SHOTS, ELITE_ACCURACY_MIN_SHOTS, MILESTONE_TOTALS, MILESTONES, milestonesFrom, type MilestoneMatch } from './milestones.js';

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

  it('clã x clã (OG-259): guerra, conquistas, série, varrida, rivalidade e defensor', () => {
    const war = (opponent: string, o: Partial<NonNullable<MilestoneMatch['clanWar']>> = {}) => ({ clanWar: { opponent, conceded: 1, seriesWon: false, sweep: false, ...o } });
    const list = [
      match(0),
      match(1, { result: -1, ...war('BC') }),
      match(2, { result: 1, ...war('BC') }),
      match(3, { result: 1, ...war('XY', { seriesWon: true }) }),
      match(4, { result: 1, ...war('BC', { conceded: 0 }) }),
      match(5, { result: -1, ...war('BC') }),
      match(6, { result: 1, ...war('BC', { seriesWon: true, sweep: true }) }),
    ];
    const g = got(list);
    expect(g).toMatchObject({ clan_war: 'm1', clan_war_win: 'm2', clan_series_win: 'm3', clan_defender: 'm4', clan_rivalry_5: 'm6', clan_sweep: 'm6' });
    expect(g.clan_war_10).toBeUndefined();
    const many = got(series(12, (i) => ({ result: i % 3 === 0 ? -1 : 1, ...war(`c${i % 4}`) })));
    expect([many.clan_war_10, many.clan_war_wins_10, many.clan_rivalry_5]).toEqual(['m9', undefined, undefined]);
    expect(got(series(3)).clan_war).toBeUndefined();
  });

  describe('stats da partida (OG-390)', () => {
    const one = (o: Partial<MilestoneMatch>) => got([match(0, o)]);
    const withStats = (stats: Record<string, number>, o: Partial<MilestoneMatch> = {}) => one({ stats, ...o });

    it('todo marco de total existe no catálogo e todo marco tem grupo', () => {
      const ids = new Set(MILESTONES.map((m) => m.id));
      for (const id of Object.keys(MILESTONE_TOTALS)) expect(ids.has(id)).toBe(true);
      for (const m of MILESTONES) expect(m.group).toBeTruthy();
    });

    it('vitórias: 1, 100 e 500 (empate não conta)', () => {
      const g = got(series(500, (i) => ({ result: i === 0 ? 0 : 1 })));
      expect([g.wins_1, g.wins_100, g.wins_500]).toEqual(['m1', 'm100', undefined]);
      expect(got(series(501, (i) => ({ result: i === 0 ? 0 : 1 }))).wins_500).toBe('m500');
    });

    it('horas: 10 e 100, pela soma dos segundos jogados', () => {
      const g = got(series(100, () => ({ playSeconds: 3600 })));
      expect([g.hours_10, g.hours_100]).toEqual(['m9', 'm99']);
      expect(got(series(10, (i) => ({ playSeconds: i === 9 ? 3599 : 3600 }))).hours_10).toBeUndefined();
    });

    it('totais dos stats: devolvidas, defesas, trocas, primeiros abates, assistências e base inimiga', () => {
      const g = got(series(50, () => ({ captures: 5, stats: { flagsReturned: 2, defenses: 5, trades: 1, firstKills: 1, assists: 2, killsEnemyBase: 2 } })));
      expect([g.captures_250, g.returns_100, g.defenses_250, g.trades_50, g.first_kills_50, g.assists_100, g.enemy_base_kills_100]).toEqual(['m49', 'm49', 'm49', 'm49', 'm49', 'm49', 'm49']);
      const short = got(series(49, () => ({ captures: 5, stats: { flagsReturned: 2, defenses: 5, trades: 1, firstKills: 1, assists: 2, killsEnemyBase: 2 } })));
      expect([short.captures_250, short.returns_100, short.defenses_250, short.trades_50]).toEqual([undefined, undefined, undefined, undefined]);
    });

    it('feitos de bandeira e defesa numa partida, no limite', () => {
      expect([one({ captures: 3 }).hat_trick, one({ captures: 2 }).hat_trick]).toEqual(['m0', undefined]);
      expect([withStats({ flagCarryingTime: 60 }).carry_60, withStats({ flagCarryingTime: 59.9 }).carry_60]).toEqual(['m0', undefined]);
      expect([withStats({ defenses: 10 }).defenses_match_10, withStats({ defenses: 9 }).defenses_match_10]).toEqual(['m0', undefined]);
      expect([withStats({ carriersKilled: 5 }).carriers_match_5, withStats({ carriersKilled: 4 }).carriers_match_5]).toEqual(['m0', undefined]);
    });

    it('sem chance: vitória sem sofrer captura; derrota, placar sofrido ou partida antiga não', () => {
      expect(one({ result: 1, conceded: 0 }).shutout).toBe('m0');
      expect([one({ result: 1, conceded: 1 }).shutout, one({ result: 0, conceded: 0 }).shutout, one({ result: 1 }).shutout]).toEqual([undefined, undefined, undefined]);
    });

    it('precisão de 70% com o mínimo de tiros', () => {
      const n = ELITE_ACCURACY_MIN_SHOTS;
      expect(one({ shots: n, hits: Math.ceil(n * 0.7) }).accuracy_70).toBe('m0');
      expect(one({ shots: n, hits: Math.ceil(n * 0.7) - 1 }).accuracy_70).toBeUndefined();
      expect(one({ shots: n - 1, hits: n - 1 }).accuracy_70).toBeUndefined();
    });

    it('sequências, massacre e intocável só sem kills em bots', () => {
      expect([withStats({ consecutiveKills: 10, botKills: 0 }).streak_10, withStats({ consecutiveKills: 9, botKills: 0 }).streak_10]).toEqual(['m0', undefined]);
      expect([withStats({ consecutiveKills: 20, botKills: 0 }).streak_20, withStats({ consecutiveKills: 19, botKills: 0 }).streak_20]).toEqual(['m0', undefined]);
      expect(withStats({ consecutiveKills: 20, botKills: 1 }).streak_10).toBeUndefined();
      expect([withStats({ botKills: 0 }, { kills: 30 }).kills_match_30, withStats({ botKills: 0 }, { kills: 29 }).kills_match_30]).toEqual(['m0', undefined]);
      expect(withStats({ botKills: 0 }, { kills: 10, deaths: 0 }).flawless).toBe('m0');
      expect([withStats({ botKills: 0 }, { kills: 9, deaths: 0 }).flawless, withStats({ botKills: 0 }, { kills: 10, deaths: 1 }).flawless, withStats({ botKills: 2 }, { kills: 10, deaths: 0 }).flawless]).toEqual([undefined, undefined, undefined]);
    });

    it('dobradinha no primeiro multi-kill; partida sem stats não concede nada dos stats', () => {
      expect(got([match(0), match(1, { stats: { multiKills: 1 } })]).multi_kill).toBe('m1');
      const old = got([match(0, { kills: 40, captures: 3 })]);
      expect([old.multi_kill, old.streak_10, old.kills_match_30, old.flawless, old.shutout, old.hat_trick]).toEqual([undefined, undefined, undefined, undefined, undefined, 'm0']);
    });
  });

  describe('eventos e contexto (OG-391)', () => {
    // índices 0 e 1 no time 0 (0 é a conta), 2 e 3 no time 1
    const TEAMS = [0, 0, 1, 1];
    const kill = (t: number, killer: number, victim: number, cause = 'rocket') => [t, 'kill', killer, victim, 0, 0, 0, cause] as const;
    const cap = (t: number, who: number, flag = who < 2 ? 1 : 0) => [t, 'capture', who, flag] as const;
    const ev = (...log: MilestoneEvent[]): MilestoneEvents => ({ me: [0], teams: TEAMS, log });
    const one = (o: Partial<MilestoneMatch>) => got([match(0, o)]);

    it('domador: captura da bandeira selvagem pela conta', () => {
      expect(one({ events: ev(cap(10, 0, WILD_FLAG)) }).wild_flag).toBe('m0');
      expect(one({ events: ev(cap(10, 0, 1), cap(20, 1, WILD_FLAG)) }).wild_flag).toBeUndefined();
    });

    it('triplo: 3 kills em inimigos dentro da janela; aliado e intervalo longo quebram', () => {
      const w = MULTI_KILL_WINDOW;
      expect(one({ events: ev(kill(0, 0, 2), kill(w, 0, 3), kill(2 * w, 0, 2)) }).triple_kill).toBe('m0');
      expect(one({ events: ev(kill(0, 0, 2), kill(w, 0, 3), kill(2 * w + 1, 0, 2)) }).triple_kill).toBeUndefined();
      expect(one({ events: ev(kill(0, 0, 2), kill(w, 0, 1), kill(2 * w, 0, 3)) }).triple_kill).toBeUndefined();
    });

    it('deathbringer: primeira kill e 50, pelos stats', () => {
      const g = got(series(25, () => ({ stats: { deathbringerKills: 2 } })));
      expect([g.deathbringer_1, g.deathbringer_50]).toEqual(['m0', 'm24']);
    });

    it('virada: ranqueada vencida depois de estar 2 atrás; 1 atrás ou Casual não', () => {
      const behind2 = ev(cap(1, 2), cap(2, 3), cap(3, 0), cap(4, 0), cap(5, 1));
      expect(one({ ranked: true, result: 1, team: 0, events: behind2 }).comeback).toBe('m0');
      expect(one({ ranked: false, result: 1, team: 0, events: behind2 }).comeback).toBeUndefined();
      expect(one({ ranked: true, result: -1, team: 0, events: behind2 }).comeback).toBeUndefined();
      expect(one({ ranked: true, result: 1, team: 0, events: ev(cap(1, 2), cap(2, 0), cap(3, 0)) }).comeback).toBeUndefined();
    });

    it('ranqueada: estreia, vitória, 100 vitórias e vitória por formato', () => {
      const g = got(series(101, (i) => ({ ranked: true, result: i === 0 ? -1 : 1, format: i === 0 ? '5x5' : i === 1 ? '3x3' : '4x4' })));
      expect([g.ranked_first, g.ranked_win, g.ranked_wins_100, g.win_3x3, g.win_4x4, g.win_5x5]).toEqual(['m0', 'm1', 'm100', 'm1', 'm2', undefined]);
      expect(one({ result: 1, format: '3x3' }).win_3x3).toBeUndefined();
    });

    it('série longa: md5 vencida no jogo que fecha; md3 e série perdida não', () => {
      const bo5 = (res: (1 | -1)[], bestOf = 5) => res.map((result, i) => match(i, { result, series: { id: 's', bestOf } }));
      expect(got(bo5([-1, -1, 1, 1, 1])).series_bo5).toBe('m4');
      expect(got(bo5([1, 1, -1, -1, -1])).series_bo5).toBeUndefined();
      expect(got(bo5([1, 1], 3)).series_bo5).toBeUndefined();
    });

    it('mapas: 10 e 25 distintos; gerados contam como um', () => {
      const g = got(series(25, (i) => ({ map: `mapa${i}` })));
      expect([g.maps_10, g.maps_25]).toEqual(['m9', 'm24']);
      expect(got(series(30, (i) => ({ map: i < 9 ? `mapa${i}` : `mapgen_${i}` }))).maps_10).toBe('m9');
      expect(got(series(30, (i) => ({ map: i < 8 ? `mapa${i}` : `mapgen_${i}` }))).maps_10).toBeUndefined();
    });

    it('rotina: 7 dias seguidos; um dia de folga zera; duas partidas no mesmo dia contam um', () => {
      const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;
      expect(got([1, 1, 2, 3, 4, 5, 6, 7].map((d, i) => match(i, { day: day(d) }))).days_7).toBe('m7');
      expect(got([1, 2, 3, 5, 6, 7, 8].map((d, i) => match(i, { day: day(d) }))).days_7).toBeUndefined();
      expect(got(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'].map((d, i) => match(i, { day: d }))).days_7).toBe('m6');
    });

    it('dupla dinâmica: 50 partidas no mesmo time do mesmo jogador', () => {
      expect(got(series(50, (i) => ({ mates: i % 2 ? ['a', 'b'] : ['a'] }))).duo_50).toBe('m49');
      expect(got(series(50, (i) => ({ mates: i ? ['a'] : ['b'] }))).duo_50).toBeUndefined();
    });

    it('partida sem eventos não concede marco de evento', () => {
      const g = one({ ranked: true, result: 1, team: 0 });
      expect([g.wild_flag, g.triple_kill, g.comeback]).toEqual([undefined, undefined, undefined]);
    });
  });
});
