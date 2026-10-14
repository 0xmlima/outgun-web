// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readOutgunFont, toBmFont, type BitmapFontData } from './font.js';

const repoRoot = join(import.meta.dirname, '../../..');
// Referência: glifos desenhados pela própria Allegro (textout_ex) a partir dos .dat originais
// (`pnpm oracle allegro fontdump ...`, tools/parity/fixtures/fontdump.cpp).
type RefFont = { height: number; glyphs: [number, number, number, string][] } | null;
const reference = JSON.parse(gunzipSync(readFileSync(join(import.meta.dirname, '__fixtures__/fonts-reference.json.gz'))).toString('utf8')) as Record<
  string,
  { font: RefFont; border: RefFont }
>;

/** Glifo como a Allegro o desenha: largura do glifo × altura da fonte, com linhas vazias embaixo. */
function rendered(font: BitmapFontData, code: number): string {
  const g = font.glyphs.find((x) => x.code === code)!;
  let s = '';
  for (let y = 0; y < font.height; y++) for (let x = 0; x < g.width; x++) s += y < g.height ? String(g.bits[y * g.width + x]) : '0';
  return s;
}

describe('fontes Allegro x a própria Allegro', () => {
  const files = Object.keys(reference);
  it('cobre as 25 fontes do jogo', () => expect(files).toHaveLength(25));

  for (const file of files) {
    it(file, () => {
      const decoded = readOutgunFont(readFileSync(join(repoRoot, '_legacy/fonts', file)));
      for (const kind of ['font', 'border'] as const) {
        const ref = reference[file]![kind];
        const ours = decoded[kind];
        if (!ref) {
          expect(ours).toBeUndefined();
          continue;
        }
        expect(ours!.height).toBe(ref.height);
        expect(ours!.glyphs.map((g) => g.code)).toEqual(ref.glyphs.map((g) => g[0]));
        for (const [code, width, , bits] of ref.glyphs) {
          expect(ours!.glyphs.find((g) => g.code === code)!.width, `${kind} ${code}`).toBe(width);
          expect(rendered(ours!, code), `${file} ${kind} glifo ${code}`).toBe(bits);
        }
      }
    });
  }
});

describe('BMFont', () => {
  const { font } = readOutgunFont(readFileSync(join(repoRoot, '_legacy/fonts/Kauno.dat')));
  const bm = toBmFont(font!, 'Kauno', 'Kauno.png');

  it('descreve os 192 glifos (ASCII e Latin-1, com acentos do pt-BR)', () => {
    expect(bm.fnt).toContain('chars count=192');
    for (const code of [65, 97, 0xe7, 0xe3, 0xe9, 0xf5]) expect(bm.fnt).toMatch(new RegExp(`char id=${code} `));
    expect(bm.fnt).toContain('page id=0 file="Kauno.png"');
  });

  it('atlas com 256 px de largura e altura em potência de 2', () => {
    expect(bm.width).toBe(256);
    expect(Math.log2(bm.height) % 1).toBe(0);
  });
});
