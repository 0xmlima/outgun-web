// SPDX-License-Identifier: GPL-2.0-or-later
// Sprites de entidades do tema (src/graphics.cpp:2924-3072): imagem base com as cores do time e
// pessoal aplicadas pelos mapas de alpha (`combine_sprite`). Cada tipo falta ou existe de forma
// independente; o que faltar é desenhado de forma procedural.
import { Texture } from 'pixi.js';
import { ASSETS, loadImage, type Manifest } from '../../assets.js';
import { rgb } from './entity-frame.js';

export interface EntitySprites {
  /** [time][cor pessoal 0..15] */
  readonly player: readonly (readonly Texture[])[] | null;
  readonly playerPower: Texture | null;
  readonly shield: readonly Texture[] | null;
  readonly dead: readonly Texture[] | null;
  readonly iceCream: Texture | null;
  readonly rocket: readonly Texture[] | null;
  readonly powerRocket: readonly Texture[] | null;
  /** [time 0..2] */
  readonly flag: readonly Texture[] | null;
  readonly flagFlash: readonly Texture[] | null;
  /** Por `PowerupKind` 0..6. */
  readonly pup: readonly (Texture | null)[];
}

type Pixels = { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray };

function pixels(img: HTMLImageElement, width = img.width, height = img.height): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/**
 * `overlayColor`: em cada pixel com alfa `a` (canal vermelho do mapa em cinza), mistura a cor por
 * cima com o blender de transparência da Allegro (`(c·a + d·(256 − a)) >> 8`).
 */
export function overlayColour(target: Uint8ClampedArray, alpha: Uint8ClampedArray | null, colour: string): void {
  if (!alpha) return;
  const [r, g, b] = rgb(colour);
  for (let i = 0; i < target.length; i += 4) {
    const a = alpha[i]!;
    if (!a) continue;
    target[i] = (r * a + target[i]! * (256 - a)) >> 8;
    target[i + 1] = (g * a + target[i + 1]! * (256 - a)) >> 8;
    target[i + 2] = (b * a + target[i + 2]! * (256 - a)) >> 8;
  }
}

function toTexture(px: Pixels, data: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), px.width, px.height), 0, 0);
  return Texture.from(canvas);
}

/** `combine_sprite`: base, depois a cor pessoal, depois a cor do time. */
function combine(base: Pixels, team: Pixels | null, personal: Pixels | null, teamColour: string, personalColour: string | null): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base.data);
  if (personal && personalColour) overlayColour(out, personal.data, personalColour);
  if (team) overlayColour(out, team.data, teamColour);
  return out;
}

export async function loadEntitySprites(manifest: Manifest, theme: string, colours: Readonly<Record<string, string>>): Promise<EntitySprites> {
  const graphics = theme ? manifest.graphics[theme]?.graphics : undefined;
  const names = Object.keys(graphics ?? {});
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    names.map(async (name) => {
      const entry = graphics![name]!;
      if (entry.kind === 'texture') return;
      images.set(name, await loadImage(ASSETS + entry.file));
    }),
  );
  const get = (name: string, like?: Pixels): Pixels | null => {
    const img = images.get(name);
    return img ? pixels(img, like?.width, like?.height) : null;
  };
  const colour = (name: string) => colours[name] ?? '#000000';
  const teamColours = [colour('team_red_basic'), colour('team_blue_basic'), colour('wild_flag')];
  const flashColours = [colour('team_red_flash'), colour('team_blue_flash'), colour('wild_flag_flash')];
  const personalColours = Array.from({ length: 16 }, (_, i) => colour(`player${String(i + 1).padStart(2, '0')}`));

  // Jogador: só com a imagem e os dois mapas (como o original).
  let player: Texture[][] | null = null;
  let playerPower: Texture | null = null;
  const pBase = get('player');
  const pTeam = pBase && get('player_team', pBase);
  const pPersonal = pBase && get('player_personal', pBase);
  if (pBase && pTeam && pPersonal) {
    player = [0, 1].map((t) => personalColours.map((pc) => toTexture(pBase, combine(pBase, pTeam, pPersonal, teamColours[t]!, pc))));
    playerPower = toTexture(pBase, combine(pBase, pTeam, pPersonal, colour('player_power_team'), colour('player_power_personal')));
  }

  const teamed = (base: string, team: string, count: number, cols = teamColours): Texture[] | null => {
    const b = get(base);
    if (!b) return null;
    const t = get(team, b);
    return Array.from({ length: count }, (_, i) => toTexture(b, combine(b, t, null, cols[i]!, null)));
  };

  // Morto: cor do time + canal alfa vindo de `dead_alpha`.
  let dead: Texture[] | null = null;
  const dBase = get('dead');
  if (dBase) {
    const dTeam = get('dead_team', dBase);
    const dAlpha = get('dead_alpha', dBase);
    dead = [0, 1].map((t) => {
      const data = combine(dBase, dTeam, null, teamColours[t]!, null);
      if (dAlpha) for (let i = 0; i < data.length; i += 4) data[i + 3] = dAlpha.data[i]!;
      return toTexture(dBase, data);
    });
  }

  const single = (name: string): Texture | null => {
    const px = get(name);
    return px ? toTexture(px, px.data) : null;
  };

  return {
    player,
    playerPower,
    shield: teamed('player_shield', 'player_shield_team', 2),
    dead,
    iceCream: single('ice_cream'),
    rocket: teamed('rocket', 'rocket_team', 2),
    powerRocket: teamed('rocket_pow', 'rocket_pow_team', 2),
    flag: teamed('flag', 'flag_team', 3),
    flagFlash: teamed('flag', 'flag_team', 3, flashColours),
    pup: ['shield', 'turbo', 'shadow', 'power', 'weapon', 'health', 'deathbringer'].map(single),
  };
}
