// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { FixedRateLoop, percentile, type Clock } from './loop.js';

/** Relógio simulado: timers disparam com um atraso extra configurável (como o do sistema). */
class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private id = 0;
  constructor(private readonly jitter: () => number = () => 0) {}
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.id;
    this.timers.push({ at: this.t + ms + this.jitter(), fn, id });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== h);
  };
  /** Avança até `until`, disparando os timers em ordem; `cost` simula o tempo gasto em cada tick. */
  run(until: number, cost = 0): void {
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > until) break;
      this.timers.shift();
      this.t = Math.max(this.t, next.at);
      next.fn();
      this.t += cost;
    }
    this.t = until;
  }
}

describe('FixedRateLoop', () => {
  it('não acumula atraso: o n-ésimo tick acontece perto de início + n × período', () => {
    let k = 0;
    const clock = new FakeClock(() => [0.3, 1.7, 0.9, 2.5][k++ % 4] as number);
    const ticks: number[] = [];
    const loop = new FixedRateLoop(100, () => ticks.push(clock.t), clock);
    loop.startLoop();
    clock.run(100_000, 3); // cada tick gasta 3 ms
    expect(ticks.length).toBeGreaterThanOrEqual(999);
    // sem compensação, 1000 ticks com ~1,3 ms de atraso + 3 ms de custo atrasariam ~4 s
    // atraso de cada tick limitado ao jitter do timer (até 2,5 ms), sem acumular
    ticks.forEach((t, i) => expect(t - (i + 1) * 100).toBeLessThan(2.6));
    expect(loop.stats.skipped).toBe(0);
  });

  it('descarta ticks perdidos depois de uma parada longa, sem rajada', () => {
    const clock = new FakeClock();
    let count = 0;
    const loop = new FixedRateLoop(100, () => count++, clock);
    loop.startLoop();
    clock.run(1000);
    expect(count).toBe(10);
    clock.t += 5000; // processo parado 5 s
    clock.run(clock.t + 50);
    expect(loop.stats.skipped).toBeGreaterThanOrEqual(49);
    const before = count;
    clock.run(clock.t + 1000);
    expect(count - before).toBeLessThanOrEqual(11);
  });

  it('para de vez com stop()', () => {
    const clock = new FakeClock();
    let count = 0;
    const loop = new FixedRateLoop(100, () => count++, clock);
    loop.startLoop();
    clock.run(250);
    loop.stop();
    clock.run(1000);
    expect(count).toBe(2);
  });

  it('percentis', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5);
    expect(percentile([], 99)).toBe(0);
  });
});
