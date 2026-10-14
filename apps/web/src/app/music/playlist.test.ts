// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import type { MusicTrack } from '../../assets.js';
import { matchTracks, menuTrack, Playlist, shuffle } from './playlist.js';

const track = (id: string, role: 'menu' | 'match' = 'match'): MusicTrack => ({ id, title: id, role, file: `music/${id}.mp3`, duration: 60, credit: 'x', license: 'CC-BY-SA-4.0' });
const TRACKS = [track('outgun-epic', 'menu'), ...['1', '2', '2-2', '3', '3-2', '4', '4-2', '5', '5-2'].map((n) => track(`outgun-${n}`))];

/** Gerador congruencial simples, para os testes não dependerem de Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('playlist da trilha (OG-221)', () => {
  it('menu: só "Outgun Epic"; partidas: as outras nove', () => {
    expect(menuTrack(TRACKS)?.id).toBe('outgun-epic');
    expect(matchTracks(TRACKS).map((t) => t.id)).not.toContain('outgun-epic');
    expect(matchTracks(TRACKS)).toHaveLength(9);
  });

  it('embaralhamento é uma permutação e depende só do RNG injetado', () => {
    const a = shuffle([1, 2, 3, 4, 5], lcg(7));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(shuffle([1, 2, 3, 4, 5], lcg(7))).toEqual(a);
  });

  it('não repete até tocar todas; "Outgun Epic" nunca toca em partida; sem emenda repetida entre rodadas', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const playlist = new Playlist(matchTracks(TRACKS), lcg(seed));
      const played = Array.from({ length: 9 * 5 }, () => playlist.next()!.id);
      for (let round = 0; round < 5; round++) {
        const ids = played.slice(round * 9, round * 9 + 9);
        expect(new Set(ids).size).toBe(9);
        expect(ids).not.toContain('outgun-epic');
      }
      for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    }
  });

  it('sem faixas: nada toca', () => {
    expect(new Playlist([], lcg(1)).next()).toBeUndefined();
  });
});
