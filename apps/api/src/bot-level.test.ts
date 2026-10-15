// SPDX-License-Identifier: GPL-2.0-or-later
// Nível do bot substituto pelo histórico Ranked (OG-266).
import { describe, expect, it } from 'vitest';
import { botLevelFrom, DEFAULT_BOT_LEVEL } from './bot-level.js';

const base = { matches: 20, rank: 50, of: 100, kills: 40, deaths: 40, shots: 400, hits: 100 };

describe('nível do bot substituto (OG-266)', () => {
  it('sem histórico (menos de 5 partidas Ranked) = intermediário', () => {
    expect(botLevelFrom({ ...base, matches: 0, rank: 0, of: 0 })).toBe(DEFAULT_BOT_LEVEL);
    expect(botLevelFrom({ ...base, matches: 4, rank: 1, kills: 400, deaths: 1, hits: 400 })).toBe(DEFAULT_BOT_LEVEL);
  });

  it('extremos: o topo com K/D e precisão altos é 5; o último, sem acertos, é 1', () => {
    expect(botLevelFrom({ ...base, rank: 1, kills: 300, deaths: 50, hits: 300 })).toBe(5);
    expect(botLevelFrom({ ...base, rank: 100, kills: 0, deaths: 80, hits: 0 })).toBe(1);
    expect(botLevelFrom({ ...base, rank: 0, of: 0, kills: 0, deaths: 0, shots: 0, hits: 0 })).toBe(1); // fora do leaderboard, sem tiros
  });

  it('meio da tabela com K/D 1 e 25% de precisão = 3; melhora em qualquer eixo não baixa o nível', () => {
    expect(botLevelFrom(base)).toBe(3);
    const levels = [100, 75, 50, 25, 1].map((rank) => botLevelFrom({ ...base, rank }));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(botLevelFrom({ ...base, kills: 80 })).toBeGreaterThanOrEqual(botLevelFrom(base));
  });
});
