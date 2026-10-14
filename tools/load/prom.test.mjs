// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { fractionAtMost, histogram, parseMetrics, quantile, sum } from './prom.mjs';

const before = parseMetrics(`# HELP t x
t_bucket{le="0.001"} 10
t_bucket{le="0.005"} 10
t_bucket{le="+Inf"} 10
t_count 10
t_sum 0.005
`);
const after = parseMetrics(`t_bucket{le="0.001"} 60
t_bucket{le="0.005"} 105
t_bucket{le="+Inf"} 110
t_count 110
t_sum 0.3
c_total{kind="a"} 2
c_total{kind="b"} 3
`);

describe('prom', () => {
  it('lê séries com rótulos e soma', () => {
    expect(sum(after, 'c_total')).toBe(5);
    expect(sum(after, 'c_total', { kind: 'b' })).toBe(3);
  });

  it('desconta a coleta anterior e calcula quantis', () => {
    const h = histogram(after, 't', before);
    expect(h.count).toBe(100);
    expect(h.buckets).toEqual([
      [0.001, 50],
      [0.005, 95],
      [Infinity, 100],
    ]);
    expect(quantile(h, 0.5)).toBeCloseTo(0.001, 9);
    expect(quantile(h, 0.95)).toBeCloseTo(0.005, 9);
    expect(quantile(h, 0.99)).toBeCloseTo(0.005, 9);
    expect(fractionAtMost(h, 0.005)).toBe(0.95);
  });
});
