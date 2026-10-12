// SPDX-License-Identifier: GPL-2.0-or-later
// Decodificador PCX (ZSoft) para os formatos usados pelos temas do Outgun: 8 bits com paleta de
// 256 cores (1 plano) e 24 bits (3 planos RGB), ambos com compressão RLE.

export interface PcxImage {
  width: number;
  height: number;
  /** 8 = indexado (com `palette` e `indices`), 24 = RGB direto. */
  depth: 8 | 24;
  /** RGB por pixel (sempre preenchido; imagens indexadas são expandidas pela paleta). */
  rgb: Uint8Array;
  /** Índices de paleta por pixel (só em imagens de 8 bits). */
  indices?: Uint8Array;
  /** 256 cores RGB (só em imagens de 8 bits). */
  palette?: Uint8Array;
}

export function decodePcx(data: Uint8Array): PcxImage {
  if (data.length < 128 || data[0] !== 0x0a) throw new Error('não é um arquivo PCX');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const encoding = data[2];
  const bitsPerPlane = data[3];
  const xMin = view.getUint16(4, true);
  const yMin = view.getUint16(6, true);
  const xMax = view.getUint16(8, true);
  const yMax = view.getUint16(10, true);
  const planes = data[65] as number;
  const bytesPerLine = view.getUint16(66, true);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (encoding !== 1) throw new Error(`codificação PCX ${encoding} não suportada`);
  if (bitsPerPlane !== 8 || (planes !== 1 && planes !== 3)) {
    throw new Error(`formato PCX ${bitsPerPlane} bits × ${planes} planos não suportado`);
  }

  // RLE: byte com os dois bits altos ligados = contagem (6 bits baixos) do byte seguinte.
  // A contagem pode atravessar o fim de uma linha de varredura; por isso decodifica tudo de uma vez.
  const scanline = bytesPerLine * planes;
  const raw = new Uint8Array(scanline * height);
  let src = 128;
  let dst = 0;
  while (dst < raw.length) {
    if (src >= data.length) throw new Error('PCX truncado');
    let byte = data[src++] as number;
    let count = 1;
    if ((byte & 0xc0) === 0xc0) {
      count = byte & 0x3f;
      byte = data[src++] as number;
    }
    for (let i = 0; i < count && dst < raw.length; i++) raw[dst++] = byte;
  }

  const rgb = new Uint8Array(width * height * 3);
  if (planes === 3) {
    for (let y = 0; y < height; y++) {
      const line = y * scanline;
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 3;
        rgb[o] = raw[line + x] as number;
        rgb[o + 1] = raw[line + bytesPerLine + x] as number;
        rgb[o + 2] = raw[line + 2 * bytesPerLine + x] as number;
      }
    }
    return { width, height, depth: 24, rgb };
  }

  // Paleta de 256 cores no fim do arquivo, precedida do byte 0x0C.
  const paletteStart = data.length - 768;
  if (data[paletteStart - 1] !== 0x0c) throw new Error('PCX de 8 bits sem paleta de 256 cores');
  const palette = data.slice(paletteStart);
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = raw[y * scanline + x] as number;
      const p = y * width + x;
      indices[p] = index;
      rgb[p * 3] = palette[index * 3] as number;
      rgb[p * 3 + 1] = palette[index * 3 + 1] as number;
      rgb[p * 3 + 2] = palette[index * 3 + 2] as number;
    }
  }
  return { width, height, depth: 8, rgb, indices, palette };
}
