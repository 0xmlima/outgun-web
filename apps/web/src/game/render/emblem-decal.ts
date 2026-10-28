// SPDX-License-Identifier: GPL-2.0-or-later
// Emblema do clã no chão da base (OG-486, RN-EMB-04): o SVG do protocolo rasterizado uma vez por
// emblema e cores, e os pontos de bandeira de cada lado.
import { emblemSvg } from '@outgun/protocol';
import type { GameMap } from '@outgun/sim';
import type { TeamIdentityView } from '@outgun/netcode';
import { Texture } from 'pixi.js';
import type { DecalSpot } from './world-renderer.js';

const SIZE = 256;
const cache = new Map<string, Promise<Texture | null>>();

/** Textura do emblema do lado, ou null (sem clã, sem emblema ou falha ao desenhar). */
export function emblemTexture(id: TeamIdentityView | null): Promise<Texture | null> {
  if (!id?.emblem || !id.colors) return Promise.resolve(null);
  const svg = emblemSvg(id.emblem, id.tag, id.colors.primary, id.colors.secondary);
  let texture = cache.get(svg);
  if (!texture) {
    texture = (async () => {
      try {
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        canvas.getContext('2d')!.drawImage(img, 0, 0, SIZE, SIZE);
        return Texture.from(canvas);
      } catch {
        return null;
      }
    })();
    cache.set(svg, texture);
  }
  return texture;
}

/** Pontos de bandeira das bases de um lado. */
export const baseSpots = (map: GameMap, team: 0 | 1): readonly DecalSpot[] => map.teams[team].flags;
