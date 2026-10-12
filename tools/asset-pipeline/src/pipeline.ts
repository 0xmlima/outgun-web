// SPDX-License-Identifier: GPL-2.0-or-later
// Converte os temas gráficos e de som do Outgun original e escreve o manifesto de assets.
// Regras (skill outgun-asset-pipeline; src/graphics.cpp:2856-3072; src/sounds.cpp):
// - sprites: magenta (#FF00FF) é transparente (cor de máscara do Allegro);
// - mapas de alpha (`*_team`, `*_personal`, `*_alpha`): imagem de 8 bits lida sem conversão de cor,
//   o índice da paleta é o alpha usado para pintar a cor do time/pessoal;
// - texturas (`floor_*`, `wall_*`, `background`): opacas, repetidas em mosaico;
// - sons: `<nome>.wav`; se não existe, `<nome>.txt` aponta para outro sample (um único salto).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readOutgunFont, toBmFont } from './font.js';
import { decodePcx } from './pcx.js';
import { encodePng } from './png.js';

export type GraphicKind = 'sprite' | 'alpha' | 'texture';

/** Sprites que o renderer original procura em cada tema (src/graphics.cpp). */
export const SPRITES = [
  'player', 'player_shield', 'dead', 'flag', 'rocket', 'rocket_pow', 'shield', 'turbo', 'shadow',
  'power', 'weapon', 'health', 'deathbringer', 'ice_cream',
] as const;
export const ALPHA_MAPS = [
  'player_team', 'player_personal', 'player_shield_team', 'dead_team', 'dead_alpha', 'flag_team',
  'rocket_team', 'rocket_pow_team',
] as const;
/** Ordem = ID de textura do formato de mapa (doc/maps.html). */
export const FLOOR_TEXTURES = [
  'floor_normal1', 'floor_normal2', 'floor_normal3', 'floor_red', 'floor_blue', 'floor_ice', 'floor_sand', 'floor_mud',
] as const;
export const WALL_TEXTURES = [
  'wall_normal1', 'wall_normal2', 'wall_normal3', 'wall_red', 'wall_blue', 'wall_metal', 'wall_wood', 'wall_rubber',
] as const;

/** Samples na ordem do enum SAMPLE_* (src/sounds.cpp, Sounds::load_samples). */
export const SAMPLES = [
  'fire', 'hit', 'wallhit', 'qwallhit', 'colldam', 'getdb', 'usedb', 'hitdb', 'diedb', 'death1', 'death2',
  'entergam', 'leftgam', 'chanteam', 'talk', 'wabounce', 'plbounce', 'weaponup', 'megaheal', 'shieldp',
  'shieldd', 'shieldl', 'speedon', 'speedoff', 'quadon', 'quadfire', 'quadoff', 'helmon', 'helmoff', 'got',
  'lost', 'return', 'capture', 'gameover', '5_min', '1_min', 'spree',
] as const;

export function classify(name: string): GraphicKind {
  if (name === 'background' || name.startsWith('floor_') || name.startsWith('wall_')) return 'texture';
  if (/_(team|personal|alpha)$/.test(name)) return 'alpha';
  return 'sprite';
}

export interface GraphicEntry {
  file: string;
  kind: GraphicKind;
  width: number;
  height: number;
}

export interface GraphicsTheme {
  graphics: Record<string, GraphicEntry>;
  /** Cores da interface (`colours.txt`), `#RRGGBB`. */
  colours?: Record<string, string>;
}

export interface SoundTheme {
  /** Nome do tema (`theme.txt`). */
  name: string;
  /** Arquivo de cada sample, ou null quando o tema não tem som para ele. */
  samples: Record<string, string | null>;
}

export interface FontFiles {
  /** Descritor BMFont (`.fnt`) e atlas PNG, para `PIXI.BitmapFont`. */
  fnt: string;
  png: string;
  height: number;
}

export interface FontEntry {
  font: FontFiles;
  /** Contorno desenhado atrás do texto (`border` no datafile), quando existe. */
  border?: FontFiles;
}

export interface AssetManifest {
  version: 1;
  graphics: Record<string, GraphicsTheme>;
  sounds: Record<string, SoundTheme>;
  fonts: Record<string, FontEntry>;
  /**
   * Cores de fábrica do original (`src/colour_def.inc`), `#RRGGBB`. Valem sem tema de cores; o
   * `colours.txt` de um tema substitui só as cores que lista.
   */
  defaultColours: Record<string, string>;
  /**
   * Arquivos de mapa originais (`maps/` = rotação padrão, `cmaps/` = extras), copiados como estão
   * para o cliente desenhar o mapa que o servidor anunciar. A chave é o nome sem `.txt`.
   */
  maps: Record<string, { file: string; dir: 'maps' | 'cmaps' }>;
}

const contentHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex').slice(0, 10);

function writeHashed(outDir: string, dir: string, name: string, ext: string, bytes: Uint8Array): string {
  const file = `${dir}/${name}.${contentHash(bytes)}.${ext}`;
  mkdirSync(join(outDir, dir), { recursive: true });
  writeFileSync(join(outDir, file), bytes);
  return file;
}

/** Primeira linha não comentada (como `getline_skip_comments`), sem espaços nas pontas. */
function firstLine(path: string): string {
  const text = readFileSync(path, 'latin1');
  const line = text.split(/[\r\n]+/).find((l) => l !== '' && !l.startsWith(';'));
  return (line ?? '').trim();
}

/** Imagem em PNG pronta para a web, conforme o papel no tema. */
export function convertGraphic(name: string, pcx: Uint8Array): { png: Uint8Array; kind: GraphicKind; width: number; height: number } {
  const image = decodePcx(pcx);
  const kind = classify(name);
  if (kind === 'alpha') {
    if (!image.indices) throw new Error(`${name}: mapas de alpha precisam ser imagens de 8 bits`);
    return { png: encodePng(image.width, image.height, image.indices, 'gray'), kind, width: image.width, height: image.height };
  }
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let p = 0; p < image.width * image.height; p++) {
    const r = image.rgb[p * 3] as number;
    const g = image.rgb[p * 3 + 1] as number;
    const b = image.rgb[p * 3 + 2] as number;
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
    rgba[p * 4 + 3] = kind === 'sprite' && r === 255 && g === 0 && b === 255 ? 0 : 255;
  }
  return { png: encodePng(image.width, image.height, rgba, 'rgba'), kind, width: image.width, height: image.height };
}

function parseColours(path: string): Record<string, string> {
  const colours: Record<string, string> = {};
  for (const line of readFileSync(path, 'latin1').split(/\r?\n/)) {
    const match = /^\s*([a-z_0-9]+)\s+([0-9A-Fa-f]{6})\s*$/.exec(line);
    if (match) colours[match[1] as string] = `#${(match[2] as string).toUpperCase()}`;
  }
  return colours;
}

/** `COL(nome, 0xRR, 0xGG, 0xBB)` de src/colour_def.inc. */
export function parseColourDefs(text: string): Record<string, string> {
  const colours: Record<string, string> = {};
  const hex = (v: string) => Number(v).toString(16).toUpperCase().padStart(2, '0');
  for (const m of text.matchAll(/COL\(\s*(\w+)\s*,\s*(0x[0-9A-Fa-f]+)\s*,\s*(0x[0-9A-Fa-f]+)\s*,\s*(0x[0-9A-Fa-f]+)\s*\)/g))
    colours[m[1] as string] = `#${hex(m[2] as string)}${hex(m[3] as string)}${hex(m[4] as string)}`;
  return colours;
}

/** Converte `graphics/` e `sound/` de `gameRoot` para `outDir` e devolve o manifesto. */
export function buildAssets(gameRoot: string, outDir: string): AssetManifest {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const manifest: AssetManifest = {
    version: 1,
    graphics: {},
    sounds: {},
    fonts: {},
    defaultColours: parseColourDefs(readFileSync(join(gameRoot, 'src/colour_def.inc'), 'latin1')),
    maps: {},
  };

  const graphicsRoot = join(gameRoot, 'graphics');
  for (const theme of readdirSync(graphicsRoot).sort()) {
    const themeDir = join(graphicsRoot, theme);
    if (!statSync(themeDir).isDirectory()) continue;
    const entry: GraphicsTheme = { graphics: {} };
    for (const file of readdirSync(themeDir).sort()) {
      if (file.endsWith('.pcx')) {
        const name = basename(file, '.pcx');
        const { png, kind, width, height } = convertGraphic(name, readFileSync(join(themeDir, file)));
        entry.graphics[name] = { file: writeHashed(outDir, `graphics/${theme}`, name, 'png', png), kind, width, height };
      } else if (file === 'colours.txt') {
        entry.colours = parseColours(join(themeDir, file));
      }
    }
    manifest.graphics[theme] = entry;
  }

  const soundRoot = join(gameRoot, 'sound');
  for (const theme of readdirSync(soundRoot).sort()) {
    const themeDir = join(soundRoot, theme);
    if (!statSync(themeDir).isDirectory()) continue;
    const themeFile = join(themeDir, 'theme.txt');
    const sound: SoundTheme = {
      name: existsSync(themeFile) ? firstLine(themeFile) : '(unnamed theme)',
      samples: {},
    };
    const written = new Map<string, string>();
    for (const sample of SAMPLES) {
      let source: string = sample;
      if (!existsSync(join(themeDir, `${source}.wav`)) && existsSync(join(themeDir, `${source}.txt`))) {
        source = firstLine(join(themeDir, `${source}.txt`)); // um único redirecionamento, como o original
      }
      const wav = join(themeDir, `${source}.wav`);
      if (!existsSync(wav)) {
        sound.samples[sample] = null;
        continue;
      }
      let file = written.get(source);
      if (!file) {
        file = writeHashed(outDir, `sound/${theme}`, source, 'wav', readFileSync(wav));
        written.set(source, file);
      }
      sound.samples[sample] = file;
    }
    manifest.sounds[theme] = sound;
  }

  const fontsRoot = join(gameRoot, 'fonts');
  for (const file of readdirSync(fontsRoot).sort()) {
    if (!file.endsWith('.dat')) continue;
    const face = basename(file, '.dat');
    const { font, border } = readOutgunFont(readFileSync(join(fontsRoot, file)));
    if (!font) continue;
    const write = (data: NonNullable<typeof font>, suffix: string): FontFiles => {
      const slug = `${face}${suffix}`;
      const pngName = `${slug}.png`;
      const bm = toBmFont(data, slug, pngName);
      const png = writeHashed(outDir, 'fonts', slug, 'png', bm.png);
      // O .fnt referencia o PNG pelo nome final (com hash), relativo à mesma pasta.
      const fnt = writeHashed(outDir, 'fonts', slug, 'fnt', new TextEncoder().encode(bm.fnt.replace(`file="${pngName}"`, `file="${basename(png)}"`)));
      return { fnt, png, height: data.height };
    };
    manifest.fonts[face] = border ? { font: write(font, ''), border: write(border, '-border') } : { font: write(font, '') };
  }

  for (const dir of ['maps', 'cmaps'] as const) {
    for (const file of readdirSync(join(gameRoot, dir)).sort()) {
      if (!file.endsWith('.txt')) continue;
      const name = basename(file, '.txt');
      const bytes = readFileSync(join(gameRoot, dir, file));
      manifest.maps[name] = { file: writeHashed(outDir, dir, name, 'txt', bytes), dir };
    }
  }

  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'preview.html'), previewPage(manifest));
  return manifest;
}

function previewPage(manifest: AssetManifest): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const themes = Object.entries(manifest.graphics)
    .map(([theme, t]) => {
      const cards = Object.entries(t.graphics)
        .map(
          ([name, g]) =>
            `<figure class="${g.kind}"><img src="${esc(g.file)}" alt="${esc(name)}"><figcaption>${esc(name)}<br><small>${g.kind} ${g.width}×${g.height}</small></figcaption></figure>`,
        )
        .join('\n');
      return `<h2>${esc(theme)}</h2><div class="grid">${cards}</div>`;
    })
    .join('\n');
  const sounds = Object.entries(manifest.sounds)
    .map(([theme, s]) => {
      const rows = Object.entries(s.samples)
        .map(([name, file]) => `<li><span>${esc(name)}</span>${file ? `<audio controls preload="none" src="${esc(file)}"></audio>` : '<em>sem som</em>'}</li>`)
        .join('\n');
      return `<h2>Sons: ${esc(theme)} — ${esc(s.name)}</h2><ul class="sounds">${rows}</ul>`;
    })
    .join('\n');
  const fonts = Object.entries(manifest.fonts)
    .map(([face, f]) => `<figure class="font"><img src="${esc(f.font.png)}" alt="${esc(face)}"><figcaption>${esc(face)}<br><small>${f.font.height} px${f.border ? ' + contorno' : ''}</small></figcaption></figure>`)
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Assets do Outgun</title>
<style>
body { font: 14px system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
.grid { display: flex; flex-wrap: wrap; gap: 12px; }
figure { margin: 0; width: 140px; text-align: center; }
img { width: 128px; height: 128px; object-fit: contain; image-rendering: pixelated;
  background: conic-gradient(#ccc 25%, #fff 0 50%, #ccc 0 75%, #fff 0) 0 0 / 16px 16px; }
figure.alpha img { background: #800; }
figure.font { width: 270px; }
figure.font img { width: 256px; height: auto; background: #224; }
.sounds { list-style: none; padding: 0; columns: 2; }
.sounds li { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
.sounds span { width: 80px; }
</style>
</head>
<body>
<h1>Assets convertidos do Outgun original</h1>
<p>Gerado por <code>pnpm assets</code> (card OG-012). Sprites sobre fundo xadrez (magenta virou transparente); mapas de alpha sobre vermelho.</p>
${themes}
<h2>Fontes (atlas BMFont)</h2><div class="grid">${fonts}</div>
${sounds}
</body>
</html>
`;
}
