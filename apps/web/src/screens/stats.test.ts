// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { clock, duration, percent } from './stats.js';

describe('formatos das estatísticas (OG-085)', () => {
  it('m:ss como o save_stats do original', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(95.7)).toBe('1:35');
    expect(clock(840)).toBe('14:00');
  });
  it('duração e porcentagem', () => {
    expect(duration(60)).toBe('1 min');
    expect(duration(3900)).toBe('1 h 05 min');
    expect(percent(1, 3)).toBe('33%');
    expect(percent(0, 0)).toBe('-');
  });
});
