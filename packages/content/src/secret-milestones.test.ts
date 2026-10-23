// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import type { MilestoneEvent, MilestoneEvents } from './milestone-events.js';
import { MILESTONES, type MilestoneMatch } from './milestones.js';
import { ACE_WINDOW, BUZZER, KINGSLAYER_WINDOW, LONG_HAUL, SECRET_MILESTONES, SECRET_MIN_ACCOUNTS, secretMilestonesFrom } from './secret-milestones.js';

// índices 0 e 1 no time 0 (0 é a conta), 2, 3 e 4 no time 1
const TEAMS = [0, 0, 1, 1, 1];
const kill = (t: number, killer: number, victim: number, o: { carrier?: boolean; cause?: string } = {}) => [t, 'kill', killer, victim, 0, 0, o.carrier ? 1 : 0, o.cause ?? 'rocket'] as const;
const flag = (t: number, kind: 'take' | 'drop' | 'capture', who: number) => [t, kind, who, who < 2 ? 1 : 0] as const;
const ev = (...log: MilestoneEvent[]): MilestoneEvents => ({ me: [0], teams: TEAMS, log });
const match = (o: Partial<MilestoneMatch> = {}): MilestoneMatch => ({ matchId: 'm0', endedAt: '2026-10-23T12:00:00.000Z', result: -1, kills: 0, captures: 0, shots: 0, hits: 0, accounts: SECRET_MIN_ACCOUNTS, team: 0, ...o });
const has = (id: string, o: Partial<MilestoneMatch>) => secretMilestonesFrom([match(o)]).some((a) => a.id === id);

describe('marcos secretos (OG-398)', () => {
  it('ids únicos, todos com prefixo secret_ e fora do catálogo público', () => {
    const ids = SECRET_MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('secret_'))).toBe(true);
    expect(MILESTONES.some((m) => m.id.startsWith('secret_') || m.group === 'secret')).toBe(false);
  });

  it('ás: os 3 adversários numa vida e na janela; um vivo, morte no meio ou janela longa não', () => {
    expect(has('secret_ace', { events: ev(kill(0, 0, 2), kill(50, 0, 3), kill(100, 0, 4)) })).toBe(true);
    expect(has('secret_ace', { events: ev(kill(0, 0, 2), kill(50, 0, 3), kill(100, 0, 3)) })).toBe(false);
    expect(has('secret_ace', { events: ev(kill(0, 0, 2), kill(50, 0, 3), kill(60, 2, 0), kill(100, 0, 4)) })).toBe(false);
    expect(has('secret_ace', { events: ev(kill(0, 0, 2), kill(50, 0, 3), kill(ACE_WINDOW + 1, 0, 4)) })).toBe(false);
  });

  it('empate técnico: matou e morreu para o mesmo adversário no mesmo décimo', () => {
    expect(has('secret_mutual', { events: ev(kill(70, 0, 2), kill(70, 2, 0)) })).toBe(true);
    expect(has('secret_mutual', { events: ev(kill(70, 0, 2), kill(71, 2, 0)) })).toBe(false);
    expect(has('secret_mutual', { events: ev(kill(70, 0, 2), kill(70, 3, 0)) })).toBe(false);
  });

  it('pacifista: vitória, 2 capturas, nenhum kill (nem em bot)', () => {
    expect(has('secret_pacifist', { result: 1, captures: 2, kills: 0, stats: { botKills: 0 } })).toBe(true);
    expect(has('secret_pacifist', { result: 1, captures: 2, kills: 0, stats: { botKills: 1 } })).toBe(false);
    expect(has('secret_pacifist', { result: 1, captures: 1, kills: 0, stats: { botKills: 0 } })).toBe(false);
    expect(has('secret_pacifist', { result: -1, captures: 2, kills: 0, stats: { botKills: 0 } })).toBe(false);
  });

  it('hat-trick perfeito: 3 capturas e 0 mortes', () => {
    expect(has('secret_perfect_hat_trick', { captures: 3, deaths: 0 })).toBe(true);
    expect(has('secret_perfect_hat_trick', { captures: 3, deaths: 1 })).toBe(false);
    expect(has('secret_perfect_hat_trick', { captures: 3 })).toBe(false);
  });

  it('davi contra golias: ranqueada vencida com o time desfalcado', () => {
    expect(has('secret_underdog', { ranked: true, result: 1, shortHanded: true })).toBe(true);
    expect(has('secret_underdog', { ranked: true, result: 1, shortHanded: false })).toBe(false);
    expect(has('secret_underdog', { ranked: false, result: 1, shortHanded: true })).toBe(false);
  });

  it('viagem longa: pegou e capturou sem largar, com 2 min ou mais', () => {
    expect(has('secret_long_haul', { events: ev(flag(0, 'take', 0), flag(LONG_HAUL, 'capture', 0)) })).toBe(true);
    expect(has('secret_long_haul', { events: ev(flag(0, 'take', 0), flag(LONG_HAUL - 1, 'capture', 0)) })).toBe(false);
    expect(has('secret_long_haul', { events: ev(flag(0, 'take', 0), flag(100, 'drop', 0), flag(200, 'take', 0), flag(LONG_HAUL + 1, 'capture', 0)) })).toBe(false);
  });

  it('no apagar das luzes: captura da conta que desempata nos últimos 3 s e vence', () => {
    const end = 6000;
    const tie = (t: number, who = 0) => ev(flag(100, 'capture', 2), flag(200, 'capture', 1), flag(t, 'capture', who));
    expect(has('secret_buzzer', { result: 1, endTime: end, events: tie(end - BUZZER) })).toBe(true);
    expect(has('secret_buzzer', { result: 1, endTime: end, events: tie(end - BUZZER - 1) })).toBe(false);
    expect(has('secret_buzzer', { result: 1, endTime: end, events: tie(end - 5, 1) })).toBe(false);
    expect(has('secret_buzzer', { result: 1, endTime: end, events: ev(flag(100, 'capture', 1), flag(end - 5, 'capture', 0)) })).toBe(false);
  });

  it('caçador de reis: 3 portadores em 10 s', () => {
    const c = { carrier: true };
    expect(has('secret_kingslayer', { events: ev(kill(0, 0, 2, c), kill(50, 0, 3, c), kill(KINGSLAYER_WINDOW, 0, 4, c)) })).toBe(true);
    expect(has('secret_kingslayer', { events: ev(kill(0, 0, 2, c), kill(50, 0, 3, c), kill(KINGSLAYER_WINDOW + 1, 0, 4, c)) })).toBe(false);
    expect(has('secret_kingslayer', { events: ev(kill(0, 0, 2, c), kill(50, 0, 3), kill(60, 0, 4, c)) })).toBe(false);
  });

  it('atropelamento: kill por colisão num adversário', () => {
    expect(has('secret_roadkill', { events: ev(kill(10, 0, 2, { cause: 'collision' })) })).toBe(true);
    expect(has('secret_roadkill', { events: ev(kill(10, 2, 0, { cause: 'collision' })) })).toBe(false);
  });

  it('coruja: fim entre 3h e 5h', () => {
    expect([2, 3, 4, 5].map((hour) => has('secret_night_owl', { hour }))).toEqual([false, true, true, false]);
  });

  it('anti-farm: com menos contas que o mínimo, nenhum secreto', () => {
    expect(secretMilestonesFrom([match({ accounts: SECRET_MIN_ACCOUNTS - 1, hour: 4, captures: 3, deaths: 0 })])).toEqual([]);
  });

  describe('7x1 e séries (OG-399)', () => {
    // capturas: índice 2 (adversário) e 0 (a conta); `flag` não importa aqui
    const caps = (seq: string) => ev(...[...seq].map((c, i) => [i * 10, 'capture', c === 'o' ? 0 : 2, 0] as const));

    it('e lá vem eles de novo: ranqueada que passou por 1 a 7; a revanche só se virou', () => {
      const sete = caps('xoxxxxxx'); // 1 a 7
      expect(has('secret_seven_one', { ranked: true, events: sete })).toBe(true);
      expect(has('secret_seven_one_comeback', { ranked: true, events: sete })).toBe(false);
      expect(has('secret_seven_one', { ranked: false, events: sete })).toBe(false);
      expect(has('secret_seven_one', { ranked: true, events: caps('xoxxxxx') })).toBe(false); // 1 a 6
      expect(has('secret_seven_one', { ranked: true, events: caps('xxxxxxxx') })).toBe(false); // 0 a 8
      expect(has('secret_seven_one', { ranked: true, events: caps('xxxxxxxo') })).toBe(true); // 0 a 7, depois 1 a 7
    });

    it('revanche do mineirão: de 1 a 7 para 8 a 7 concede os dois', () => {
      const ids = secretMilestonesFrom([match({ ranked: true, result: 1, events: caps('oxxxxxxxooooooo') })]).map((a) => a.id);
      expect(ids).toEqual(expect.arrayContaining(['secret_seven_one', 'secret_seven_one_comeback']));
    });

    const bo5 = (res: (1 | -1)[]) => secretMilestonesFrom(res.map((result, i) => match({ matchId: `g${i}`, result, series: { id: 's', bestOf: 5 } }))).map((a) => [a.id, a.matchId]);

    it('amarelou: 2 a 0 e perdeu a série; virada histórica: 0 a 2 e venceu', () => {
      expect(bo5([1, 1, -1, -1, -1])).toEqual([['secret_choked', 'g4']]);
      expect(bo5([-1, -1, 1, 1, 1])).toEqual([['secret_series_comeback', 'g4']]);
      expect(bo5([1, -1, -1, 1, -1])).toEqual([]);
      expect(bo5([-1, 1, 1, -1, 1])).toEqual([]);
    });
  });
});

