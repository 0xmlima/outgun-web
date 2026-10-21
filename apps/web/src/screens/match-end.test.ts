// SPDX-License-Identifier: GPL-2.0-or-later
import type { ClientSession } from '@outgun/netcode';
import { describe, expect, it } from 'vitest';
import { matchSummary } from './match-end.js';

const session = (over: Partial<ClientSession>): ClientSession =>
  ({
    gameOver: { reason: 'captureLimit', red: 8, blue: 5 },
    me: 0,
    maxPlayers: 4,
    present: new Set([0, 2]),
    names: new Map([
      [0, 'Ana'],
      [2, 'Bia'],
    ]),
    frags: new Map([
      [0, 12],
      [2, 3],
    ]),
    playerStats: new Map(),
    lobby: null,
    gameTime: () => 0,
    ...over,
  }) as unknown as ClientSession;

describe('fim de partida (OG-344)', () => {
  it('resultado do meu time, placar e jogadores na ordem do placar', () => {
    const m = matchSummary(session({}))!;
    expect([m.outcome, m.red, m.blue, m.reason]).toEqual(['win', 8, 5, 'captureLimit']);
    expect(m.players.map((p) => [p.name, p.team, p.frags])).toEqual([
      ['Ana', 0, 12],
      ['Bia', 1, 3],
    ]);
    expect(matchSummary(session({ me: 2 }))!.outcome).toBe('loss');
    expect(matchSummary(session({ gameOver: { reason: 'extraTimeOut', red: 2, blue: 2 } }))!.outcome).toBe('draw');
    expect(matchSummary(session({ gameOver: null }))).toBeNull();
  });

  it('série md3: placar da série e se acabou', () => {
    const lobby = { bestOf: 3, seriesRed: 2, seriesBlue: 0, phase: 'finished' } as ClientSession['lobby'];
    expect(matchSummary(session({ lobby }))!.series).toEqual({ bestOf: 3, red: 2, blue: 0, finished: true });
  });
});
