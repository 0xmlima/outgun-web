// SPDX-License-Identifier: GPL-2.0-or-later
// Loop de frames a taxa fixa (o original usa 10 frames/s, `Server::loop`, src/server.cpp:1868).
// Cada tick é agendado para `início + n × período`, não "agora + período": atrasos de um tick não
// se acumulam (compensação de drift). Atrasado demais (processo parado, depurador), descarta os
// ticks perdidos em vez de simular uma rajada.

export interface Clock {
  /** Milissegundos monotônicos. */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface LoopStats {
  ticks: number;
  /** Ticks descartados por atraso. */
  skipped: number;
  /** Atraso do último tick em relação ao horário ideal (ms). */
  lastLateness: number;
  /** Maior atraso visto (ms). */
  maxLateness: number;
  /** Atrasos dos últimos ticks (ms), para percentis. */
  recent: number[];
}

/** Percentil (0..100) de uma amostra. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
}

export class FixedRateLoop {
  private start = 0;
  private n = 0;
  private handle: unknown = null;
  private running = false;
  readonly stats: LoopStats = { ticks: 0, skipped: 0, lastLateness: 0, maxLateness: 0, recent: [] };

  constructor(
    private readonly periodMs: number,
    private readonly tick: () => void,
    private readonly clock: Clock = realClock,
    /** Atraso a partir do qual ticks são descartados, em períodos. */
    private readonly maxBehind = 5,
  ) {}

  startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.start = this.clock.now();
    this.n = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) this.clock.clearTimeout(this.handle);
    this.handle = null;
  }

  /** `early`: acordou antes da hora; espera exatamente o que falta. */
  private schedule(early = false): void {
    const target = this.start + (this.n + 1) * this.periodMs;
    // timers do Node acordam com ~1 ms de atraso: agenda um pouco antes da hora
    const delay = Math.max(early ? 1 : 0, target - this.clock.now() - (early ? 0 : 1));
    this.handle = this.clock.setTimeout(() => this.fire(), delay);
  }

  private fire(): void {
    if (!this.running) return;
    const now = this.clock.now();
    const target = this.start + (this.n + 1) * this.periodMs;
    if (now < target - 0.25) {
      this.schedule(true); // acordou cedo
      return;
    }
    this.n++;
    const lateness = now - target;
    if (lateness > this.maxBehind * this.periodMs) {
      const missed = Math.floor(lateness / this.periodMs);
      this.n += missed;
      this.stats.skipped += missed;
    }
    this.stats.ticks++;
    this.stats.lastLateness = lateness;
    this.stats.maxLateness = Math.max(this.stats.maxLateness, lateness);
    this.stats.recent.push(lateness);
    if (this.stats.recent.length > 600) this.stats.recent.shift();
    try {
      this.tick();
    } finally {
      if (this.running) this.schedule();
    }
  }
}
