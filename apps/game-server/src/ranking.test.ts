// SPDX-License-Identifier: GPL-2.0-or-later
// Rating de habilidade no game server (OG-350, D-65/D-66): força dos times pela soma dos μ, sem
// score/neg no resultado e o `playerInfo` com a posição e o valor do OpenSkill.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import type { MatchReport } from './match-report.js';
import { DEFAULT_MU, teamStrength, type PlayerSkill } from './ranking.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1', 'coliseu']);
class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (r.ok) this.received.push(...r.messages);
  }
  close(): void {}
  of<T extends AnyMessage['type']>(type: T): Extract<AnyMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<AnyMessage, { type: T }> => m.type === type);
  }
}

const account = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('força dos times (RN-TIM-01, OG-350)', () => {
  it('soma dos μ; sem rating vale o μ inicial', () => {
    expect(teamStrength([{ team: 0, mu: 30 }, { team: 0 }, { team: 1, mu: 20 }])).toEqual([30 + DEFAULT_MU, 20]);
    expect(teamStrength([])).toEqual([0, 0]);
  });
});

describe('rating de habilidade na sala (OG-350)', () => {
  function setup(preset = 'ranked') {
    const matches: MatchReport[] = [];
    const r = new Room({ id: preset, preset, maps, mapFiles: ['outgun1', 'coliseu'], maxPlayers: 16, seed: 3, reportMatch: (m) => matches.push(m) });
    const join = (n: number, skill?: Partial<PlayerSkill>, conn = new TestConnection()) => {
      const res = r.join(conn, { name: `J${n}`, accountId: account(n), ...(skill ? { skill: { mu: 25, value: 0, rank: 0, of: 0, ...skill } } : {}) });
      if (!res.ok) throw new Error(res.text);
      r.handle(res.pid, [message('clientReady', {})]);
      return res.pid;
    };
    return { r, join, matches };
  }

  it('time para quem entra (getLessScoredTeam): o de menor soma de μ', () => {
    const { r, join } = setup('classic');
    const strong = join(1, { mu: 40 });
    const weak = join(2);
    expect(r.world.teamOf(strong)).not.toBe(r.world.teamOf(weak));
    const third = join(3);
    expect(r.world.teamOf(third)).toBe(r.world.teamOf(weak));
  });

  it('ranqueada com os mínimos: resultado sem score/neg', () => {
    const { r, join, matches } = setup();
    const pids = [1, 2, 3, 4].map((n) => join(n));
    r.sim.scoreFrag(pids[0]!, 3);
    r.sim.scoreNeg(pids[1]!, 2);
    r.settings.world.timeLimit = 30;
    r.settings.world.extraTime = 0; // sem a prorrogação do Ranked (RN-RKL-25)
    for (let i = 0; i < 40; i++) r.tick();
    expect(matches).toHaveLength(1);
    expect(matches[0]!.ranked).toBe(true);
    expect(matches[0]!.players.every((p) => p.scoreDelta === 0 && p.negDelta === 0)).toBe(true);
  });

  it('playerInfo leva a posição e o valor do OpenSkill', () => {
    const { join } = setup('classic');
    const conn = new TestConnection();
    const pid = join(1, { mu: 30, value: 1729, rank: 2, of: 40 }, conn);
    expect(conn.of('playerInfo').find((m) => m.pid === pid)).toMatchObject({ loggedIn: true, rank: 2, score: 1729, negScore: 0, rankedPlayers: 40 });
  });
});
