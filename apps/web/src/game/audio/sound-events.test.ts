// SPDX-License-Identifier: GPL-2.0-or-later
import { message } from '@outgun/protocol';
import { Position, SAMPLES } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { SoundEvents, type SoundContext } from './sound-events.js';

const ctx = (over: Partial<SoundContext> = {}): SoundContext => ({ me: 0, room: { x: 1, y: 1 }, onscreen: new Set([0, 8]), time: 10, ...over });
const visa = (name: string) => name !== 'colldam' && name !== 'wallhit' && name !== 'qwallhit';

describe('SoundEvents', () => {
  it('som da sala vindo do servidor pelo código do original', () => {
    const s = new SoundEvents(visa);
    expect(s.fromMessage(message('sound', { sample: SAMPLES.indexOf('speedon') }), ctx(), {})).toEqual(['speedon']);
  });

  it('morte: som só se o alvo está na tela; bandeira perdida e sequência minha', () => {
    const s = new SoundEvents(visa, () => 0.7);
    const kill = (target: number) => message('kill', { attacker: 0, target, cause: 'rocket', carriedFlag: 'enemy', carrierDefended: false, flagDefended: false });
    expect(s.fromMessage(kill(8), ctx(), { spreeStarted: 0 })).toEqual(['death2', 'lost', 'spree']);
    expect(s.fromMessage(kill(9), ctx(), {})).toEqual(['lost']);
    expect(s.fromMessage(message('kill', { attacker: 8, target: 0, cause: 'deathbringer', carriedFlag: 'none', carrierDefended: false, flagDefended: false }), ctx(), {})).toEqual(['diedb']);
  });

  it('entrada só quando anunciada; chat, captura, avisos de tempo', () => {
    const s = new SoundEvents(visa);
    expect(s.fromMessage(message('playerJoined', { pid: 3, name: 'x', color: 0, bot: false }), ctx(), {})).toEqual([]);
    expect(s.fromMessage(message('playerJoined', { pid: 3, name: 'x', color: 0, bot: false }), ctx(), { joined: true })).toEqual(['entergam']);
    expect(s.fromMessage(message('text', { kind: 'team', from: 0, text: 'a' }), ctx(), {})).toEqual(['talk']);
    expect(s.fromMessage(message('text', { kind: 'server', from: 255, text: 'a' }), ctx(), {})).toEqual([]);
    expect(s.fromMessage(message('timeEvent', { kind: 'oneMinuteLeft' }), ctx(), {})).toEqual(['1_min']);
    expect(s.fromMessage(message('powerCollision', { pid: 1 }), ctx(), {})).toEqual(['hit']); // Visa não tem colldam
  });

  it('tiro e acerto só na sala atual; foguete com power', () => {
    const s = new SoundEvents(visa);
    expect(s.fromSession({ kind: 'rocketFired', pos: new Position(1, 1, 10, 10), power: true, owner: 0 }, ctx())).toEqual(['quadfire']);
    expect(s.fromSession({ kind: 'rocketFired', pos: new Position(0, 1, 10, 10), power: false, owner: 2 }, ctx())).toEqual([]);
    expect(s.fromSession({ kind: 'rocketHitPlayer', pos: new Position(1, 1, 10, 10), target: 8, team: 0 }, ctx())).toEqual(['hit']);
  });

  it('quiques: no máximo um a cada 0,2 s por jogador', () => {
    const s = new SoundEvents(visa);
    const hit = { kind: 'playerHitWall', pid: 0 } as const;
    expect(s.fromSession(hit, ctx({ time: 10 }))).toEqual(['wabounce']);
    expect(s.fromSession(hit, ctx({ time: 10.1 }))).toEqual([]);
    expect(s.fromSession(hit, ctx({ time: 10.3 }))).toEqual(['wabounce']);
    expect(s.fromSession({ kind: 'playerHitPlayer', pid1: 0, pid2: 8 }, ctx({ time: 10.3 }))).toEqual(['plbounce']);
    expect(s.fromSession({ kind: 'playerHitPlayer', pid1: 0, pid2: 8 }, ctx({ time: 10.4 }))).toEqual([]);
  });
});

describe('cobertura dos SAMPLE_*', () => {
  it('todos os sons do original tocam por algum caminho', () => {
    const s = new SoundEvents(() => true, () => 0.2);
    const s2 = new SoundEvents(() => true, () => 0.9);
    const heard = new Set<string>();
    const add = (names: string[]) => names.forEach((n) => heard.add(n));
    const c = ctx();
    const kill = (cause: 'rocket' | 'deathbringer') => message('kill', { attacker: 0, target: 8, cause, carriedFlag: 'enemy', carrierDefended: false, flagDefended: false });
    add(s.fromMessage(kill('rocket'), c, { spreeStarted: 0 }));
    add(s2.fromMessage(kill('rocket'), c, {}));
    add(s.fromMessage(kill('deathbringer'), c, {}));
    for (const m of [
      message('playerLeft', { pid: 3 }),
      message('teamChange', { from: 1, to: 9, color: 0, swappedColor: 255 }),
      message('text', { kind: 'normal', from: 1, text: 'a' }),
      message('capture', { pid: 0, flagTeam: 'blue', assistant: 255 }),
      message('gameOver', { reason: 'captureLimit', seconds: 5 }),
      message('timeEvent', { kind: 'fiveMinutesLeft' }),
      message('timeEvent', { kind: 'oneMinuteLeft' }),
      message('flagReturn', { pid: 0 }),
      message('deathbringer', { team: 'red', frame: 1, roomX: 0, roomY: 0, x: 1, y: 1 }),
      message('powerCollision', { pid: 1 }),
    ])
      add(s.fromMessage(m, c, {}));
    add(s.fromMessage(message('playerJoined', { pid: 3, name: 'x', color: 0, bot: false }), c, { joined: true }));
    const p = new Position(1, 1, 10, 10);
    for (const ev of [
      { kind: 'rocketFired', pos: p, power: false, owner: 0 },
      { kind: 'rocketFired', pos: p, power: true, owner: 0 },
      { kind: 'rocketHitWall', pos: p, power: false, team: 0 },
      { kind: 'rocketHitWall', pos: p, power: true, team: 0 },
      { kind: 'rocketHitPlayer', pos: p, target: 8, team: 0 },
      { kind: 'flagCarried', team: 0 },
      { kind: 'playerHitWall', pid: 0 },
      { kind: 'playerHitPlayer', pid1: 0, pid2: 8 },
    ] as const)
      add(s.fromSession(ev, c));
    // sons de sala que o servidor manda (`broadcast_screen_sample`, hook `screenSample` da sim)
    for (const n of ['weaponup', 'megaheal', 'getdb', 'hitdb', 'shieldp', 'shieldd', 'shieldl', 'speedon', 'speedoff', 'quadon', 'quadoff', 'helmon', 'helmoff'] as const)
      add(s.fromMessage(message('sound', { sample: SAMPLES.indexOf(n) }), c, {}));
    expect(SAMPLES.filter((n) => !heard.has(n))).toEqual([]);
  });
});
