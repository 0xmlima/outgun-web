// SPDX-License-Identifier: GPL-2.0-or-later
import { FRAG_POINTS, NEG_POINTS } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { ratingEvents } from './rating-help.js';

describe('explicação do rating (OG-342)', () => {
  it('a tabela tem todos os eventos da simulação, com os pontos dela', () => {
    const { score, neg } = ratingEvents((s) => s);
    expect(score.map(([, p]) => p)).toEqual(Object.values(FRAG_POINTS).map((n) => (n > 0 ? `+${n}` : String(n))));
    expect(neg.map(([, p]) => p)).toEqual(Object.values(NEG_POINTS).map((n) => `+${n}`));
    expect(score.find(([l]) => l === 'Capturing the flag')?.[1]).toBe('+3');
  });
});
