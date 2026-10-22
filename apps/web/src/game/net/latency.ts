// SPDX-License-Identifier: GPL-2.0-or-later
// Latência do input na tela (OG-369): janela dos últimos segundos de tecla→envio e tecla→tela,
// mostrada num quadro pequeno sobre o jogo quando o jogador liga a opção.
import { percentile } from './telemetry.js';

const WINDOW_MS = 10_000;

export class LatencyWindow {
  private samples: { at: number; send: readonly number[]; render: readonly number[] }[] = [];

  add(now: number, send: readonly number[], render: readonly number[]): void {
    this.samples.push({ at: now, send, render });
    while (this.samples.length && now - this.samples[0]!.at > WINDOW_MS) this.samples.shift();
  }

  /** "tecla→envio p50/p95 · tecla→tela p50/p95" dos últimos 10 s (traço sem amostras). */
  text(): string {
    const send = this.samples.flatMap((s) => s.send);
    const render = this.samples.flatMap((s) => s.render);
    const pair = (v: number[]) => (v.length ? `${percentile(v, 50).toFixed(1)}/${percentile(v, 95).toFixed(1)} ms` : '—');
    return `tecla→envio ${pair(send)} · tecla→tela ${pair(render)}`;
  }
}
