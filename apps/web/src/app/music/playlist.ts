// SPDX-License-Identifier: GPL-2.0-or-later
// Ordem das faixas nas partidas (RN-MUS-02, OG-221): aleatória, sem repetir até todas tocarem, e sem
// emendar a mesma faixa na virada de uma rodada para a outra. "Outgun Epic" (a do menu) nunca entra.
import type { MusicTrack } from '../../assets.js';

/** Faixas das partidas (papel `match`). */
export function matchTracks(tracks: readonly MusicTrack[]): MusicTrack[] {
  return tracks.filter((t) => t.role === 'match');
}

export function menuTrack(tracks: readonly MusicTrack[]): MusicTrack | undefined {
  return tracks.find((t) => t.role === 'menu');
}

/** Fisher–Yates com o `rng` dado (0 ≤ rng() < 1). */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export class Playlist {
  private queue: MusicTrack[] = [];
  private last: MusicTrack | undefined;

  constructor(
    private readonly tracks: readonly MusicTrack[],
    private readonly rng: () => number,
  ) {}

  next(): MusicTrack | undefined {
    if (this.tracks.length === 0) return undefined;
    if (this.queue.length === 0) {
      this.queue = shuffle(this.tracks, this.rng);
      // a primeira da rodada nova não repete a última da anterior
      if (this.queue.length > 1 && this.queue[0]?.id === this.last?.id) [this.queue[0], this.queue[1]] = [this.queue[1]!, this.queue[0]!];
    }
    this.last = this.queue.shift();
    return this.last;
  }
}
