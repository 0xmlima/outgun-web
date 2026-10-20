// SPDX-License-Identifier: GPL-2.0-or-later
// Ícones PNG do app instalável (OG-323) e do cliente desktop (OG-324), a partir da arte de 16×16 do
// favicon.svg (fundo, mastro e bandeira), ampliada sem suavizar. `maskable` deixa uma margem para o
// recorte redondo do sistema. Uso: node apps/web/scripts/app-icons.mjs (grava em public/icons).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x00, 0x00, 0x40];
const POLE = [0xff, 0xff, 0x00];
const FLAG = [0xff, 0x00, 0x00];
// mesmo desenho do favicon.svg: mastro x=4, y 2..13; bandeira M5 2h7l-2 3 2 3H5z
const FLAG_POLY = [
  [5, 2],
  [12, 2],
  [10, 5],
  [12, 8],
  [5, 8],
];

function inside([x, y], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Cor do texel (x, y) da arte de 16×16, pelo centro do texel. */
function texel(x, y) {
  if (x === 4 && y >= 2 && y < 14) return POLE;
  if (inside([x + 0.5, y + 0.5], FLAG_POLY)) return FLAG;
  return BG;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** PNG RGB de `size`×`size`; `pad` é a fração de margem (no fundo) de cada lado. */
function icon(size, pad = 0) {
  const inner = size * (1 - 2 * pad);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(((x - size * pad) / inner) * 16);
      const ty = Math.floor(((y - size * pad) / inner) * 16);
      const rgb = tx >= 0 && tx < 16 && ty >= 0 && ty < 16 ? texel(tx, ty) : BG;
      raw.set(rgb, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), icon(192));
writeFileSync(new URL('icon-512.png', dir), icon(512));
writeFileSync(new URL('icon-maskable-512.png', dir), icon(512, 0.1));
writeFileSync(new URL('apple-touch-icon.png', dir), icon(180));
