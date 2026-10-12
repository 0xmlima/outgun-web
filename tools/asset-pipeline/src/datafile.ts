// SPDX-License-Identifier: GPL-2.0-or-later
// Leitor de datafiles Allegro 4 (`.dat`), suficiente para as fontes do Outgun: arquivo não
// compactado (`slh.`) ou compactado (`slh!`), objetos com propriedades e blocos LZSS.

const MAGIC_UNPACKED = 0x736c682e; // "slh."
const MAGIC_PACKED = 0x736c6821; // "slh!"
const DAT_MAGIC = 0x414c4c2e; // "ALL."
const PROP = 0x70726f70; // "prop"

/** LZSS do Allegro (Okumura): janela de 4096, buffer inicial zerado, comprimento mínimo 3. */
export function lzssUnpack(src: Uint8Array, size: number): Uint8Array {
  const N = 4096;
  const F = 18;
  const THRESHOLD = 2;
  const ring = new Uint8Array(N);
  const out = new Uint8Array(size);
  let r = N - F;
  let flags = 0;
  let i = 0;
  let o = 0;
  while (o < size && i < src.length) {
    flags >>= 1;
    if ((flags & 256) === 0) flags = (src[i++] as number) | 0xff00;
    if (flags & 1) {
      const c = src[i++] as number;
      out[o++] = c;
      ring[r] = c;
      r = (r + 1) & (N - 1);
    } else {
      const lo = src[i++] as number;
      const hi = src[i++] as number;
      const pos = lo | ((hi & 0xf0) << 4);
      const len = (hi & 0x0f) + THRESHOLD;
      for (let k = 0; k <= len && o < size; k++) {
        const c = ring[(pos + k) & (N - 1)] as number;
        out[o++] = c;
        ring[r] = c;
        r = (r + 1) & (N - 1);
      }
    }
  }
  if (o !== size) throw new Error(`LZSS truncado: ${o} de ${size} bytes`);
  return out;
}

export interface DatafileObject {
  type: string;
  properties: Record<string, string>;
  data: Uint8Array;
}

const fourcc = (n: number) => String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);

export function readDatafile(file: Uint8Array): DatafileObject[] {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let p = 0;
  const magic = view.getUint32(p);
  p += 4;
  if (magic === MAGIC_PACKED) throw new Error('datafile compactado por inteiro (slh!) não é usado pelo Outgun');
  if (magic !== MAGIC_UNPACKED) throw new Error('não é um datafile Allegro');
  if (view.getUint32(p) !== DAT_MAGIC) throw new Error('datafile sem cabeçalho ALL.');
  p += 4;
  const count = view.getInt32(p);
  p += 4;
  const objects: DatafileObject[] = [];
  for (let n = 0; n < count; n++) {
    const properties: Record<string, string> = {};
    while (view.getUint32(p) === PROP) {
      const type = fourcc(view.getUint32(p + 4));
      const length = view.getInt32(p + 8);
      properties[type] = String.fromCharCode(...file.subarray(p + 12, p + 12 + length));
      p += 12 + length;
    }
    const type = fourcc(view.getUint32(p));
    // Bloco: tamanho gravado e tamanho real; real negativo = bloco compactado com LZSS.
    const stored = view.getInt32(p + 4);
    const real = view.getInt32(p + 8);
    p += 12;
    const chunk = file.subarray(p, p + stored);
    p += stored;
    objects.push({ type, properties, data: real < 0 ? lzssUnpack(chunk, -real) : chunk.slice() });
  }
  return objects;
}
