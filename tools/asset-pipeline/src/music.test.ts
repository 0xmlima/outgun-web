// SPDX-License-Identifier: GPL-2.0-or-later
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mp3Duration, trackId, trackTitle } from './music.js';

const songs = fileURLToPath(new URL('../../../songs', import.meta.url));

describe('trilha sonora (OG-220)', () => {
  it('id do nome do arquivo e título com iniciais maiúsculas', () => {
    expect(trackId('Outgun epic.mp3')).toBe('outgun-epic');
    expect(trackId('Outgun 2-2.mp3')).toBe('outgun-2-2');
    expect(trackTitle('Outgun epic.mp3')).toBe('Outgun Epic');
    expect(trackTitle('Outgun 2-2.mp3')).toBe('Outgun 2-2');
  });

  it('duração pelos quadros MP3 bate com o ffprobe (±0,1 s)', () => {
    // ffprobe -show_entries format=duration, 2026-10-14
    const expected: Record<string, number> = {
      'Outgun 1.mp3': 61.56,
      'Outgun 2-2.mp3': 104.4,
      'Outgun 2.mp3': 98.32,
      'Outgun 3-2.mp3': 127.96,
      'Outgun 3.mp3': 148.4,
      'Outgun 4-2.mp3': 57.44,
      'Outgun 4.mp3': 66.8,
      'Outgun 5-2.mp3': 103.6,
      'Outgun 5.mp3': 84.76,
      'Outgun epic.mp3': 182,
    };
    expect(readdirSync(songs).filter((f) => f.endsWith('.mp3')).sort()).toEqual(Object.keys(expected).sort());
    for (const [file, seconds] of Object.entries(expected)) {
      expect(Math.abs(mp3Duration(readFileSync(join(songs, file))) - seconds), file).toBeLessThan(0.1);
    }
  });

  it('ignora lixo e tag ID3 antes do primeiro quadro', () => {
    // 1 quadro MPEG-1 camada III, 128 kbps, 44,1 kHz: 417 bytes, 1152 amostras
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 2, 0, 0]);
    const bytes = new Uint8Array([...id3, 0x00, ...frame, ...frame]);
    expect(mp3Duration(bytes)).toBeCloseTo((2 * 1152) / 44100, 5);
  });
});
