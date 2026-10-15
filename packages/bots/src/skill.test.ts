// SPDX-License-Identifier: GPL-2.0-or-later
// Níveis dos bots (OG-266): o de referência é o original e os parâmetros são monótonos.
import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, botSkill, REFERENCE_BOT_LEVEL } from './skill.js';

describe('níveis dos bots (OG-266)', () => {
  it('o padrão (Casual) é o de referência, sem mudança nenhuma', () => {
    expect(botSkill()).toEqual({ level: REFERENCE_BOT_LEVEL, aimSpread: 1, aimMiss: 0, reactionFrames: 0, decideEvery: 1 });
    expect([botSkill(0).level, botSkill(9).level, botSkill(Number.NaN).level, botSkill(2.4).level]).toEqual([1, 5, REFERENCE_BOT_LEVEL, 2]);
  });

  it('do 1 ao 5 a mira, a reação e a frequência de decisão só melhoram', () => {
    for (let i = 1; i < BOT_LEVELS.length; i++) {
      const [a, b] = [BOT_LEVELS[i - 1]!, BOT_LEVELS[i]!];
      expect(b.aimSpread).toBeLessThanOrEqual(a.aimSpread);
      expect(b.aimMiss).toBeLessThanOrEqual(a.aimMiss);
      expect(b.reactionFrames).toBeLessThanOrEqual(a.reactionFrames);
      expect(b.decideEvery).toBeLessThanOrEqual(a.decideEvery);
    }
  });
});
