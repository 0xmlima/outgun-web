// SPDX-License-Identifier: GPL-2.0-or-later
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import reference from './__fixtures__/pcx-reference.json' with { type: 'json' };
import { decodePcx } from './pcx.js';
import { buildAssets, classify, convertGraphic, SAMPLES } from './pipeline.js';
import { encodePng } from './png.js';

const repoRoot = join(import.meta.dirname, '../../..');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Leitor PNG mínimo (só o que encodePng produz): valida assinatura, CRCs e devolve os pixels. */
function readPng(png: Uint8Array): { width: number; height: number; channels: number; pixels: Uint8Array } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    expect(crc).toBe(crc32Ref(png.subarray(offset + 4, offset + 8 + length)));
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      channels = data[9] === 0 ? 1 : 4;
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(0);
    pixels.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, channels, pixels };
}

function crc32Ref(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

describe('decodificador PCX x ImageMagick', () => {
  const entries = Object.entries(reference as Record<string, { size: number[]; rgbSha256: string }>);
  it('cobre todos os 109 arquivos dos temas', () => {
    expect(entries).toHaveLength(109);
  });
  for (const [path, expected] of entries) {
    it(path, () => {
      const image = decodePcx(readFileSync(join(repoRoot, '_legacy/graphics', path)));
      expect([image.width, image.height]).toEqual(expected.size);
      expect(sha(image.rgb)).toBe(expected.rgbSha256);
    });
  }
});

describe('PNG', () => {
  it('lê de volta exatamente os pixels codificados (cinza e RGBA)', () => {
    const gray = Uint8Array.from({ length: 7 * 5 }, (_, i) => (i * 37) & 0xff);
    const rgba = Uint8Array.from({ length: 3 * 4 * 4 }, (_, i) => (i * 91) & 0xff);
    expect(readPng(encodePng(7, 5, gray, 'gray'))).toEqual({ width: 7, height: 5, channels: 1, pixels: gray });
    expect(readPng(encodePng(3, 4, rgba, 'rgba'))).toEqual({ width: 3, height: 4, channels: 4, pixels: rgba });
  });
});

describe('conversão dos gráficos', () => {
  it('classifica como o renderer original', () => {
    expect(classify('player')).toBe('sprite');
    expect(classify('player_team')).toBe('alpha');
    expect(classify('player_personal')).toBe('alpha');
    expect(classify('dead_alpha')).toBe('alpha');
    expect(classify('floor_ice')).toBe('texture');
    expect(classify('wall_rubber')).toBe('texture');
    expect(classify('background')).toBe('texture');
  });

  it('sprites: magenta vira transparente e o resto é opaco', () => {
    const source = readFileSync(join(repoRoot, '_legacy/graphics/Metal/player.pcx'));
    const image = decodePcx(source);
    const { png } = convertGraphic('player', source);
    const { pixels } = readPng(png);
    let transparent = 0;
    for (let p = 0; p < image.width * image.height; p++) {
      const magenta = image.rgb[p * 3] === 255 && image.rgb[p * 3 + 1] === 0 && image.rgb[p * 3 + 2] === 255;
      expect(pixels[p * 4 + 3]).toBe(magenta ? 0 : 255);
      if (magenta) transparent++;
    }
    expect(transparent).toBeGreaterThan(0);
  });

  it('mapas de alpha: o índice da paleta vira o valor de cinza (sem conversão de cor)', () => {
    const source = readFileSync(join(repoRoot, '_legacy/graphics/Metal/player_team.pcx'));
    const image = decodePcx(source);
    const { png, kind } = convertGraphic('player_team', source);
    expect(kind).toBe('alpha');
    expect(readPng(png).pixels).toEqual(image.indices);
  });

  it('texturas são opacas mesmo se contiverem magenta', () => {
    const { png } = convertGraphic('floor_normal1', readFileSync(join(repoRoot, '_legacy/graphics/Metal/floor_normal1.pcx')));
    const { pixels } = readPng(png);
    for (let p = 3; p < pixels.length; p += 4) expect(pixels[p]).toBe(255);
  });
});

describe('build completo', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const build = () => {
    const dir = mkdtempSync(join(tmpdir(), 'outgun-assets-'));
    dirs.push(dir);
    return { dir, manifest: buildAssets(join(repoRoot, '_legacy'), dir) };
  };

  it('converte os 6 temas gráficos e o tema de som com as regras do original', { timeout: 30_000 }, () => {
    const { dir, manifest } = build();
    expect(Object.keys(manifest.graphics)).toEqual(['Colors', 'Grass', 'Grid', 'Grid 2', 'Ice', 'Metal']);
    expect(Object.values(manifest.graphics).reduce((n, t) => n + Object.keys(t.graphics).length, 0)).toBe(109);
    expect(manifest.graphics.Ice?.colours?.menu_background).toBe('#000040');
    // Cores de fábrica (src/colour_def.inc): chão e paredes verdes do Outgun clássico.
    expect(manifest.defaultColours.ground).toBe('#104000');
    expect(manifest.defaultColours.wall).toBe('#30C000');
    expect(manifest.defaultColours.team_red_basic).toBe('#FF0000');
    expect(Object.keys(manifest.defaultColours).length).toBeGreaterThan(100);
    // Mapas copiados sem alteração (o cliente os interpreta com @outgun/content).
    expect(manifest.maps.coliseu?.dir).toBe('maps');
    expect(manifest.maps.arena?.dir).toBe('cmaps');
    expect(readFileSync(join(dir, manifest.maps.coliseu!.file))).toEqual(readFileSync(join(repoRoot, '_legacy/maps/coliseu.txt')));
    const visa = manifest.sounds.Visa!;
    expect(visa.name).toBe('Outgun sounds, by Visa-Valtteri Pimia');
    expect(Object.keys(visa.samples)).toEqual([...SAMPLES]);
    // Redirecionamentos .txt (um único salto) e samples sem som no tema original.
    expect(visa.samples.diedb).toBe(visa.samples.death2);
    expect(visa.samples.spree).toBe(visa.samples.got);
    for (const silent of ['wallhit', 'qwallhit', 'colldam', '5_min']) expect(visa.samples[silent]).toBeNull();
    // Arquivos com hash de conteúdo, presentes no disco.
    const player = manifest.graphics.Metal!.graphics.player!;
    expect(player.file).toMatch(/^graphics\/Metal\/player\.[0-9a-f]{10}\.png$/);
    expect(readPng(readFileSync(join(dir, player.file))).width).toBe(256);
  });

  // Dois builds completos (temas, sons, fontes e mapas): mais lento que o limite padrão de 5 s.
  it('é determinístico', { timeout: 30_000 }, () => {
    expect(build().manifest).toEqual(build().manifest);
  });
});
