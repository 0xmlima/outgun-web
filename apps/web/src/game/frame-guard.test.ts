// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { guardFrame } from './frame-guard.js';

describe('guardFrame (OG-428)', () => {
  it('um quadro com erro não para os seguintes e cada erro é relatado uma vez', () => {
    const drawn: number[] = [];
    const reports: unknown[] = [];
    const frame = guardFrame((n: number) => {
      if (n % 2) throw new Error('quadro ruim');
      drawn.push(n);
    }, (e) => reports.push(e));
    for (let n = 0; n < 6; n++) frame(n);
    expect(drawn).toEqual([0, 2, 4]);
    expect(reports).toHaveLength(1);
  });
});
