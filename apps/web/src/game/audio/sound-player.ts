// SPDX-License-Identifier: GPL-2.0-or-later
// Toca os samples do tema de som (Web Audio): `Sounds::play` do original (src/sounds.cpp:207) para o
// sample que já está tocando antes de tocar de novo; volume 0..255 linear, como a Allegro.
import type { SampleName } from '@outgun/sim';
import { ASSETS, type Manifest } from '../../assets.js';

export class SoundPlayer {
  private readonly ctx: AudioContext | null;
  private readonly gain: GainNode | null;
  private readonly buffers = new Map<SampleName, AudioBuffer>();
  private readonly playing = new Map<SampleName, AudioBufferSourceNode>();
  private enabled = true;

  constructor() {
    const Ctor = typeof AudioContext === 'undefined' ? null : AudioContext;
    this.ctx = Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
    this.gain = this.ctx?.createGain() ?? null;
    if (this.ctx && this.gain) this.gain.connect(this.ctx.destination);
    // o navegador só libera o áudio depois de um gesto (a página pode ter sido aberta sem clique)
    addEventListener('keydown', this.unlock, true);
    addEventListener('pointerdown', this.unlock, true);
  }

  private readonly unlock = () => {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  };

  /** Carrega os samples do tema (os que o tema não tem ficam mudos, como no original). */
  async load(manifest: Manifest, theme = 'Visa'): Promise<void> {
    const ctx = this.ctx;
    const samples = manifest.sounds[theme]?.samples;
    if (!ctx || !samples) return;
    const files = new Map<string, Promise<AudioBuffer | null>>();
    await Promise.all(
      Object.entries(samples).map(async ([name, file]) => {
        if (!file) return;
        // samples redirecionados apontam para o mesmo arquivo: decodifica uma vez
        let buffer = files.get(file);
        if (!buffer) {
          buffer = fetch(ASSETS + file)
            .then((r) => r.arrayBuffer())
            .then((data) => ctx.decodeAudioData(data))
            .catch(() => null);
          files.set(file, buffer);
        }
        const decoded = await buffer;
        if (decoded) this.buffers.set(name as SampleName, decoded);
      }),
    );
  }

  has(name: SampleName): boolean {
    return this.buffers.has(name);
  }

  /** Liga/desliga e volume 0..255 (`Sounds enabled`, `Volume`). */
  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    if (this.gain) this.gain.gain.value = Math.min(255, Math.max(0, volume)) / 255;
    if (!enabled) for (const name of [...this.playing.keys()]) this.stop(name);
  }

  private stop(name: SampleName): void {
    const old = this.playing.get(name);
    if (!old) return;
    try {
      old.stop();
    } catch {
      // já tinha acabado
    }
    this.playing.delete(name);
  }

  play(name: SampleName, rate = 1): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!this.enabled || !ctx || !this.gain || !buffer) return;
    this.stop(name);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(this.gain);
    source.onended = () => {
      if (this.playing.get(name) === source) this.playing.delete(name);
    };
    source.start();
    this.playing.set(name, source);
  }

  /** Atrasos do áudio (ms): processamento do Web Audio e saída do dispositivo (fones Bluetooth somam muito). */
  latencyMs(): { base: number; output: number } {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return { base: (ctx?.baseLatency ?? 0) * 1000, output: (ctx?.outputLatency ?? 0) * 1000 };
  }

  get state(): string {
    return this.ctx?.state ?? 'unavailable';
  }

  destroy(): void {
    removeEventListener('keydown', this.unlock, true);
    removeEventListener('pointerdown', this.unlock, true);
    void this.ctx?.close().catch(() => undefined);
  }
}
