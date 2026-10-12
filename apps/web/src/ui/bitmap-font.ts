// SPDX-License-Identifier: GPL-2.0-or-later
// Leitura das fontes BMFont geradas pelo pipeline de assets (OG-013) a partir das fontes Allegro.

export interface Glyph {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly xoffset: number;
  readonly yoffset: number;
  readonly xadvance: number;
}

export interface BitmapFontData {
  readonly lineHeight: number;
  readonly page: string;
  readonly glyphs: ReadonlyMap<number, Glyph>;
}

/** Caractere desenhado no lugar dos que a fonte não tem (as fontes só cobrem Latin-1). */
export const FALLBACK_CHAR = '?'.charCodeAt(0);

function fields(line: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of line.matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
    const value = match[2] as string;
    out.set(match[1] as string, value.startsWith('"') ? value.slice(1, -1) : value);
  }
  return out;
}

/** Formato texto do BMFont (`info`, `common`, `page`, `char`). */
export function parseFnt(text: string): BitmapFontData {
  let lineHeight = 0;
  let page = '';
  const glyphs = new Map<number, Glyph>();
  for (const line of text.split(/\r?\n/)) {
    const tag = line.split(' ', 1)[0];
    const f = fields(line);
    const num = (key: string) => Number(f.get(key) ?? 0);
    if (tag === 'common') lineHeight = num('lineHeight');
    else if (tag === 'page' && num('id') === 0) page = f.get('file') ?? '';
    else if (tag === 'char')
      glyphs.set(num('id'), {
        x: num('x'),
        y: num('y'),
        width: num('width'),
        height: num('height'),
        xoffset: num('xoffset'),
        yoffset: num('yoffset'),
        xadvance: num('xadvance'),
      });
  }
  return { lineHeight, page, glyphs };
}

export function glyphFor(font: BitmapFontData, code: number): Glyph | undefined {
  return font.glyphs.get(code) ?? font.glyphs.get(FALLBACK_CHAR);
}

/** Largura em pixels da fonte (sem escala), como `text_length` da Allegro. */
export function measureText(font: BitmapFontData, text: string): number {
  let width = 0;
  for (const ch of text) width += glyphFor(font, ch.codePointAt(0) ?? FALLBACK_CHAR)?.xadvance ?? 0;
  return width;
}

/**
 * Quebra `text` em linhas de no máximo `maxWidth` pixels, por palavras, preservando o recuo inicial
 * (os textos de ajuda do original alinham colunas com espaços). Uma palavra maior que a linha fica
 * sozinha nela.
 */
export function wrapText(font: BitmapFontData, text: string, maxWidth: number): string[] {
  const indent = /^ */.exec(text)?.[0] ?? '';
  const words = text.slice(indent.length).split(' ');
  const lines: string[] = [];
  let line = indent;
  for (const word of words) {
    const candidate = line === indent ? line + word : `${line} ${word}`;
    if (line !== indent && measureText(font, candidate) > maxWidth) {
      lines.push(line);
      line = indent + word;
    } else line = candidate;
  }
  lines.push(line);
  return lines;
}
