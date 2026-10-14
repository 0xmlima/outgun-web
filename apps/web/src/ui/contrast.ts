// SPDX-License-Identifier: GPL-2.0-or-later
// Contraste WCAG 2.x entre duas cores (RN-UI-03: texto e fundo com pelo menos 4,5:1).

/** Luminância relativa de uma cor `#rrggbb`. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`cor inválida: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((part) => {
    const c = parseInt(part!, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Variáveis `--nome: #rrggbb;` de um CSS (os tokens de cor de tokens.css). */
export function colorTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) tokens.set(m[1]!, m[2]!.toLowerCase());
  return tokens;
}

/** Pares texto/fundo que a convenção de tokens.css promete legíveis. */
export function textPairs(tokens: ReadonlyMap<string, string>): [text: string, background: string][] {
  const names = [...tokens.keys()];
  const surfaces = names.filter((n) => n.startsWith('--surface-'));
  const pairs: [string, string][] = [];
  for (const name of names) {
    if (!name.startsWith('--text-') && name !== '--text') continue;
    const on = /^--text-on-(.+)$/.exec(name);
    if (on) pairs.push([name, `--${on[1]}`]);
    else for (const s of surfaces) pairs.push([name, s]);
  }
  return pairs;
}
