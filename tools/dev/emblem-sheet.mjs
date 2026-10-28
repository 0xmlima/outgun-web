// SPDX-License-Identifier: GPL-2.0-or-later
// Prancha de revisão do catálogo do emblema (OG-481): cada símbolo em 16, 32 e 128 px, nas cores
// do clã e em tons de cinza, mais as molduras.
// Uso (depois de `pnpm --filter @outgun/protocol build`):
//   node tools/dev/emblem-sheet.mjs > emblemas.html
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const {
  CLAN_COLORS,
  EMBLEM_FRAMES,
  EMBLEM_FRAME_NAMES,
  EMBLEM_SYMBOLS,
  EMBLEM_SYMBOL_NAMES,
  emblemSvg,
} = await import(join(root, 'packages/protocol/dist/index.js'));

const C = CLAN_COLORS;
const pairs = Object.entries(C).map(([k, hex], i, all) => [k, hex, all[(i + 9) % all.length][1]]);
const cell = (svg, px) =>
  `<span style="display:inline-block;width:${px}px;height:${px}px">${svg}</span>`;
const em = (symbol, frame, pri, sec) =>
  emblemSvg({ frame, symbol, fillet: false, inverted: false }, 'LC', pri, sec);

let rows = '';
for (const s of EMBLEM_SYMBOLS) {
  const base = em(s, 'shield', C.navy, C.yellow);
  const sizes = [16, 32, 128].map((px) => cell(base, px)).join(' ');
  const colours = pairs.map(([, p, q]) => cell(em(s, 'shield', p, q), 32)).join(' ');
  const bare = cell(em(s, 'none', C.navy, C.yellow), 32);
  rows += `<tr><th>${EMBLEM_SYMBOL_NAMES[s]}<br><small>${s}</small></th><td>${sizes}</td><td>${bare}</td><td class="c">${colours}</td><td class="g">${sizes}</td></tr>\n`;
}
const frames = EMBLEM_FRAMES.map(
  (f) =>
    `<figure>${cell(em('star', f, C.wine, C.white), 64)}<figcaption>${EMBLEM_FRAME_NAMES[f]}</figcaption></figure>`,
).join('');

process.stdout.write(`<!doctype html><meta charset="utf-8"><title>Catálogo do emblema</title>
<style>body{font:14px Inter,sans-serif;background:#1b1f1b;color:#ddd;margin:16px}td,th{padding:6px;border-bottom:1px solid #333;vertical-align:middle;text-align:left}
td.c{max-width:620px}td.g{filter:grayscale(1)}figure{display:inline-block;margin:8px;text-align:center}svg{display:block;width:100%;height:100%}span{vertical-align:middle}</style>
<h1>Emblema do clã: catálogo (${EMBLEM_SYMBOLS.length} símbolos com a tag)</h1>
<h2>Molduras</h2>${frames}
<h2>Símbolos</h2><table><tr><th>Símbolo</th><th>16 · 32 · 128 px</th><th>Sem moldura</th><th>Nas cores do clã</th><th>Tons de cinza</th></tr>
${rows}</table>`);
