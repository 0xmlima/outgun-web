// SPDX-License-Identifier: GPL-2.0-or-later
// Fontes bitmap do Allegro 4 (objeto FONT de um datafile) e exportação para BMFont (AngelCode),
// formato lido pelo PixiJS (`BitmapFont`).
import { readDatafile } from './datafile.js';
import { encodePng } from './png.js';

export interface Glyph {
  code: number;
  width: number;
  height: number;
  /** 1 byte por pixel (0/1), linha a linha. */
  bits: Uint8Array;
}

export interface BitmapFontData {
  height: number;
  glyphs: Glyph[];
}

/** Formato "novo" do Allegro: altura 0, faixas de glifos monocromáticos (1 bit por pixel). */
export function parseFont(data: Uint8Array): BitmapFontData {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  const legacyHeight = view.getInt16(p);
  p += 2;
  if (legacyHeight !== 0) throw new Error('formato antigo de fonte Allegro não suportado');
  const ranges = view.getInt16(p);
  p += 2;
  const glyphs: Glyph[] = [];
  let height = 0;
  for (let r = 0; r < ranges; r++) {
    const depth = data[p++] as number;
    if (depth !== 1 && depth !== 255) throw new Error(`fonte colorida (profundidade ${depth}) não suportada`);
    const begin = view.getInt32(p);
    const end = view.getInt32(p + 4); // inclusivo
    p += 8;
    for (let code = begin; code <= end; code++) {
      const width = view.getInt16(p);
      const h = view.getInt16(p + 2);
      p += 4;
      const stride = (width + 7) >> 3;
      const bits = new Uint8Array(width * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < width; x++) {
          const byte = data[p + y * stride + (x >> 3)] as number;
          bits[y * width + x] = (byte >> (7 - (x & 7))) & 1; // bit mais significativo primeiro
        }
      }
      p += stride * h;
      glyphs.push({ code, width, height: h, bits });
      height = Math.max(height, h);
    }
  }
  if (p !== data.length) throw new Error(`fonte com ${data.length - p} bytes sobrando`);
  return { height, glyphs };
}

/** Objetos `font` e `border` (contorno) de um `.dat` de fonte do Outgun (`Graphics::load_font`). */
export function readOutgunFont(file: Uint8Array): { font?: BitmapFontData; border?: BitmapFontData } {
  const result: { font?: BitmapFontData; border?: BitmapFontData } = {};
  for (const object of readDatafile(file)) {
    if (object.type !== 'FONT') continue;
    if (object.properties.NAME === 'font') result.font = parseFont(object.data);
    if (object.properties.NAME === 'border') result.border = parseFont(object.data);
  }
  return result;
}

export interface BmFont {
  /** Descritor BMFont em texto. */
  fnt: string;
  /** Atlas RGBA: glifo branco opaco, resto transparente (o cliente aplica a cor). */
  png: Uint8Array;
  width: number;
  height: number;
}

/** Monta o atlas (prateleiras de 256 px de largura, altura em potência de 2) e o descritor. */
export function toBmFont(font: BitmapFontData, face: string, pngFile: string): BmFont {
  const atlasWidth = 256;
  const spacing = 1;
  const placed: { glyph: Glyph; x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const glyph of font.glyphs) {
    if (x + glyph.width > atlasWidth) {
      x = 0;
      y += rowHeight + spacing;
      rowHeight = 0;
    }
    placed.push({ glyph, x, y });
    x += glyph.width + spacing;
    rowHeight = Math.max(rowHeight, glyph.height);
  }
  let atlasHeight = 1;
  while (atlasHeight < y + rowHeight) atlasHeight *= 2;
  const rgba = new Uint8Array(atlasWidth * atlasHeight * 4);
  for (const { glyph, x: gx, y: gy } of placed) {
    for (let py = 0; py < glyph.height; py++) {
      for (let px = 0; px < glyph.width; px++) {
        if (!glyph.bits[py * glyph.width + px]) continue;
        const o = ((gy + py) * atlasWidth + gx + px) * 4;
        rgba[o] = rgba[o + 1] = rgba[o + 2] = rgba[o + 3] = 255;
      }
    }
  }
  const lines = [
    `info face="${face}" size=${font.height} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=${spacing},${spacing}`,
    `common lineHeight=${font.height} base=${font.height} scaleW=${atlasWidth} scaleH=${atlasHeight} pages=1 packed=0`,
    `page id=0 file="${pngFile}"`,
    `chars count=${placed.length}`,
    // Allegro desenha cada glifo encostado no anterior: o avanço é a própria largura.
    ...placed.map(
      ({ glyph, x: gx, y: gy }) =>
        `char id=${glyph.code} x=${gx} y=${gy} width=${glyph.width} height=${glyph.height} xoffset=0 yoffset=0 xadvance=${glyph.width} page=0 chnl=15`,
    ),
  ];
  return { fnt: `${lines.join('\n')}\n`, png: encodePng(atlasWidth, atlasHeight, rgba, 'rgba'), width: atlasWidth, height: atlasHeight };
}
