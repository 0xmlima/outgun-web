// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { announce, initialRotation, mapVotes, nextMap, shouldExit, type Voter } from './map-vote.js';

const voter = (over: Partial<Voter> = {}): Voter => ({ bot: false, wantExit: false, mapVote: -1, negative: new Set(), ...over });
const maps = (...lastGames: number[]) => lastGames.map((lastGame) => ({ lastGame }));
const none = () => 0;
const first = { rand: () => 0 };

describe('RN-VOT-03: próximo mapa', () => {
  it('sem votos: o seguinte da lista', () => {
    expect(nextMap(maps(0, 0, 0), [0, 0, 0], 0, 1000, none, first)).toBe(1);
    expect(nextMap(maps(0, 0, 0), [0, 0, 0], 2, 1000, none, first)).toBe(0);
  });

  it('sem votos e com votos negativos: pula para o com menos negativos', () => {
    const neg = (m: number) => [0, 2, 1, 0][m] as number;
    expect(nextMap(maps(0, 0, 0, 0), [0, 0, 0, 0], 0, 1000, neg, first)).toBe(3);
    // todos com negativos: o menor, a partir do seguinte
    const all = (m: number) => [3, 2, 1, 2][m] as number;
    expect(nextMap(maps(0, 0, 0, 0), [0, 0, 0, 0], 0, 1000, all, first)).toBe(2);
  });

  it('o mais votado', () => {
    expect(nextMap(maps(0, 0, 0), [1, 3, 2], 0, 1000, none, first)).toBe(1);
  });

  it('empate nos votos: o jogado há mais tempo', () => {
    expect(nextMap(maps(500, 100, 300), [2, 2, 2], 0, 1000, none, first)).toBe(1);
  });

  it('empate também no tempo: sorteio sem o mapa atual', () => {
    const picks = new Set([0, 1, 2, 3].map((r) => nextMap(maps(0, 0, 0), [1, 1, 1], 1, 1000, none, { rand: () => r })));
    expect([...picks].sort()).toEqual([0, 2]);
  });

  it('votos por mapa contam todos os jogadores', () => {
    expect(mapVotes([voter({ mapVote: 1 }), voter({ mapVote: 1, bot: true }), voter({ mapVote: 9 })], 3)).toEqual([0, 2, 0]);
  });
});

describe('RN-VOT-02: sair do mapa', () => {
  it('maioria dos humanos querendo sair, depois do bloqueio', () => {
    const v = [voter({ wantExit: true }), voter({ wantExit: true }), voter()];
    expect(shouldExit(v, false, 100, 0)).toBe(true);
    expect(shouldExit(v, false, 100, 600)).toBe(false); // ainda bloqueado
  });
  it('bloqueado, mas todos querem sair: sai', () => {
    expect(shouldExit([voter({ wantExit: true }), voter({ wantExit: true })], false, 10, 600)).toBe(true);
  });
  it('bots não votam (nem contra)', () => {
    expect(shouldExit([voter({ wantExit: true }), voter({ bot: true }), voter({ bot: true })], false, 100, 0)).toBe(true);
    expect(shouldExit([voter({ bot: true, wantExit: true }), voter()], false, 100, 0)).toBe(false);
  });
  it('require_specific_map_vote: só conta quem votou num mapa', () => {
    expect(shouldExit([voter({ wantExit: true }), voter({ wantExit: true })], true, 100, 0)).toBe(false);
    expect(shouldExit([voter({ wantExit: true, mapVote: 2 })], true, 100, 0)).toBe(true);
  });
});

describe('anúncio dos votos', () => {
  it('anuncia na mudança e espera 5 s para o próximo', () => {
    const a = { votes: 0, needed: 0, nextFrame: 0 };
    const v = [voter({ wantExit: true }), voter(), voter()];
    expect(announce(a, v, false, 10, 100, 600)).toEqual({ votes: 1, needed: 2, voteBlockSeconds: 50 });
    expect(announce(a, [...v, voter({ wantExit: true })], false, 20, 110, 600)).toBeNull();
    expect(announce(a, [...v, voter({ wantExit: true })], false, 60, 150, 600)?.votes).toBe(2);
  });
});

describe('RN-VOT-04: ordem da rotação', () => {
  it('em ordem, embaralhada ou com o primeiro sorteado', () => {
    expect(initialRotation(3, 0, first)).toEqual({ order: [0, 1, 2], first: 0 });
    expect(initialRotation(3, 2, { rand: () => 5 }).first).toBe(2);
    expect(initialRotation(4, 1, { rand: () => 1 }).order.sort()).toEqual([0, 1, 2, 3]);
  });
});
