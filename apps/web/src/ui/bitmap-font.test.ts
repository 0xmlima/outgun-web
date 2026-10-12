// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { measureText, parseFnt, wrapText } from './bitmap-font.js';

// Trecho no formato gerado pelo pipeline de assets (OG-013).
const FNT = `info face="Teste" size=16 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1
common lineHeight=16 base=16 scaleW=256 scaleH=128 pages=1 packed=0
page id=0 file="Teste.abc.png"
chars count=4
char id=32 x=0 y=0 width=8 height=16 xoffset=0 yoffset=0 xadvance=4 page=0 chnl=15
char id=63 x=8 y=0 width=6 height=16 xoffset=0 yoffset=0 xadvance=6 page=0 chnl=15
char id=97 x=16 y=0 width=7 height=16 xoffset=0 yoffset=0 xadvance=7 page=0 chnl=15
char id=98 x=24 y=0 width=8 height=16 xoffset=1 yoffset=2 xadvance=8 page=0 chnl=15
`;

describe('fontes bitmap', () => {
  const font = parseFnt(FNT);

  it('lê altura da linha, página e glifos', () => {
    expect(font.lineHeight).toBe(16);
    expect(font.page).toBe('Teste.abc.png');
    expect(font.glyphs.get(98)).toEqual({
      x: 24,
      y: 0,
      width: 8,
      height: 16,
      xoffset: 1,
      yoffset: 2,
      xadvance: 8,
    });
  });

  it('mede pelo avanço e troca caracteres ausentes por "?"', () => {
    expect(measureText(font, 'ab a')).toBe(7 + 8 + 4 + 7);
    expect(measureText(font, '—')).toBe(6);
  });

  it('quebra por palavras mantendo o recuo', () => {
    // "  ab ab ab": cada "ab" mede 15, espaço 4, recuo 8
    expect(wrapText(font, '  ab ab ab', 8 + 15 + 4 + 15)).toEqual(['  ab ab', '  ab']);
    expect(wrapText(font, 'abababab', 10)).toEqual(['abababab']);
    expect(wrapText(font, 'a  b', 100)).toEqual(['a  b']);
  });
});
