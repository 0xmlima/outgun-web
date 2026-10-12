// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/glibc-rand.json' with { type: 'json' };
import { GlibcRand, RAND_MAX, randomShuffle } from './rng.js';

// Fixture gerado pelo oráculo: `pnpm oracle fixture rng` (tools/parity/fixtures/rng.cpp).
describe('GlibcRand x rand() do build original', () => {
  for (const sequence of fixture.rand) {
    const label = sequence.srand ? `srand(${sequence.seed})` : 'sem srand';
    it(`${label}: ${sequence.values.length} valores idênticos`, () => {
      const rng = sequence.srand ? new GlibcRand(sequence.seed) : new GlibcRand();
      const actual = sequence.values.map(() => rng.rand());
      expect(actual).toEqual(sequence.values);
    });
  }

  it('produz valores em [0, RAND_MAX]', () => {
    const rng = new GlibcRand(99);
    for (let i = 0; i < 10000; i++) {
      const v = rng.rand();
      expect(Number.isInteger(v) && v >= 0 && v <= RAND_MAX).toBe(true);
    }
  });

  it('srand reinicia a sequência', () => {
    const rng = new GlibcRand(5);
    const first = [rng.rand(), rng.rand()];
    rng.srand(5);
    expect([rng.rand(), rng.rand()]).toEqual(first);
  });
});

describe('randomShuffle x std::random_shuffle do build original', () => {
  it('embaralha vetores de 1 a 32 elementos na mesma ordem, consumindo o mesmo rand()', () => {
    const rng = new GlibcRand(fixture.shuffleSeed);
    fixture.shuffle.forEach((expected, index) => {
      const items = Array.from({ length: index + 1 }, (_, i) => i);
      expect(randomShuffle(items, rng)).toEqual(expected);
    });
    expect(rng.rand()).toBe(fixture.randAfterShuffle);
  });
});
