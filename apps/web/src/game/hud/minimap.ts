// SPDX-License-Identifier: GPL-2.0-or-later
// Minimapa: tamanho e coordenadas (`update_minimap_background`, `calculate_minimap_coordinates`) e o
// fundo com chão, paredes, bordas das salas e bases pintadas com a cor escura do time a partir de
// cada bandeira (src/graphics.cpp:877-1188, plan/specs/hud.md).
import { ROOM_HEIGHT, ROOM_WIDTH, type GameMap, type WorldCoords } from '@outgun/sim';
import { addWallPath } from '../render/room-painter.js';
import type { Rect } from '../render/layout.js';

/** Opacidade máxima da névoa (`fogOfWarMaxAlpha` = 0x38). */
export const FOG_MAX_ALPHA = 0x38 / 255;

/** Retângulo do minimapa na tela: proporção 4:3 por sala, centralizado no lugar reservado. */
export function minimapRect(place: Rect, mapW: number, mapH: number): Rect {
  let w: number;
  let h: number;
  if (mapW * 4 * place.h > mapH * 3 * place.w) {
    w = place.w;
    h = Math.trunc((w * mapH * 3) / (mapW * 4)) + 1;
  } else {
    h = place.h;
    w = Math.trunc((h * mapW * 4) / (mapH * 3));
  }
  return { x: place.x + Math.trunc((place.w - w) / 2), y: place.y + Math.trunc((place.h - h) / 2), w, h };
}

/** Ponto do mundo no minimapa (`calculate_minimap_coordinates`). */
export function minimapPoint(r: Rect, mapW: number, mapH: number, pos: WorldCoords): [number, number] {
  const px = (pos.room.x * ROOM_WIDTH + pos.x) / (ROOM_WIDTH * mapW);
  const py = (pos.room.y * ROOM_HEIGHT + pos.y) / (ROOM_HEIGHT * mapH);
  return [r.x + Math.trunc(px * r.w), r.y + Math.trunc(py * r.h)];
}

/** Retângulo de uma sala no minimapa (`draw_minimap_room`). */
export function minimapRoom(r: Rect, mapW: number, mapH: number, rx: number, ry: number): Rect {
  const x1 = Math.trunc((rx * r.w) / mapW);
  const y1 = Math.trunc((ry * r.h) / mapH);
  const x2 = Math.trunc(((rx + 1) * r.w) / mapW) - 1;
  const y2 = Math.trunc(((ry + 1) * r.h) / mapH) - 1;
  return { x: r.x + x1, y: r.y + y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

export interface MinimapColours {
  readonly ground: string;
  readonly wall: string;
  readonly roomBorder: string;
  /** Cores escuras dos times (bases). */
  readonly teamDark: readonly [string, string];
  /** Cores dos times e da bandeira selvagem (círculos das bandeiras). */
  readonly team: readonly [string, string, string];
}

function rgba(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  // Uint32 little-endian: ABGR
  return ((0xff << 24) | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0;
}

/**
 * Fundo do minimapa num canvas de `w × h` px CSS com `resolution` px por px CSS. As bases são
 * pintadas com preenchimento a partir de cada bandeira dentro da sala (as bordas das salas fecham a
 * área); quando bandeiras dos dois times alcançam o mesmo pedaço, vence a mais próxima (empate:
 * fica o chão), como `MinimapHelper::paintByFlags`.
 */
export function paintMinimap(map: GameMap, w: number, h: number, placeW: number, colours: MinimapColours, resolution = 1): HTMLCanvasElement {
  const W = Math.max(1, Math.round(w * resolution));
  const H = Math.max(1, Math.round(h * resolution));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const startX = 0.005 * resolution;
  const startY = 0.005 * resolution * (map.height / map.width);
  const scale = ((w - 0.01) / (ROOM_WIDTH * map.width)) * resolution;
  const maxX = ROOM_WIDTH * map.width;
  const maxY = ROOM_HEIGHT * map.height;

  ctx.fillStyle = colours.ground;
  ctx.fillRect(0, 0, W, H);
  // paredes, sala por sala (recortadas na sala)
  ctx.fillStyle = colours.wall;
  for (let x = 0; x < map.width; x++)
    for (let y = 0; y < map.height; y++) {
      const bx = startX + x * ROOM_WIDTH * scale;
      const by = startY + y * ROOM_HEIGHT * scale;
      const path = new Path2D();
      for (const wall of map.rooms[x]![y]!.walls) addWallPath(path, wall, bx, by, scale);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, ROOM_WIDTH * scale, ROOM_HEIGHT * scale);
      ctx.clip();
      ctx.fill(path, 'nonzero');
      ctx.restore();
    }
  // bordas das salas: uma linha de 1 px (meia nas pontas)
  ctx.fillStyle = colours.roomBorder;
  const line = Math.max(1, Math.round(resolution));
  for (let i = 0; i <= map.width; i++) {
    const x = Math.min(W - line, Math.max(0, Math.round(startX + i * ROOM_WIDTH * scale - line / 2)));
    ctx.fillRect(x, 0, line, Math.ceil(startY + maxY * scale));
  }
  for (let i = 0; i <= map.height; i++) {
    const y = Math.min(H - line, Math.max(0, Math.round(startY + i * ROOM_HEIGHT * scale - line / 2)));
    ctx.fillRect(0, y, Math.ceil(startX + maxX * scale), line);
  }

  // bases
  const image = ctx.getImageData(0, 0, W, H);
  const px = new Uint32Array(image.data.buffer);
  const ground = rgba(colours.ground);
  const dark = [rgba(colours.teamDark[0]), rgba(colours.teamDark[1])];
  const at = (c: WorldCoords): number => {
    const x = Math.min(W - 1, Math.trunc(startX + (c.room.x * ROOM_WIDTH + c.x) * scale));
    const y = Math.min(H - 1, Math.trunc(startY + (c.room.y * ROOM_HEIGHT + c.y) * scale));
    return y * W + x;
  };
  for (let rx = 0; rx < map.width; rx++)
    for (let ry = 0; ry < map.height; ry++) {
      const flags = ([0, 1] as const).flatMap((t) => map.teams[t].flags.filter((f) => f.room.x === rx && f.room.y === ry).map((f) => ({ t, f })));
      if (!flags.length) continue;
      const xmin = Math.trunc(startX + rx * ROOM_WIDTH * scale);
      const xmax = Math.trunc(startX + (rx + 1) * ROOM_WIDTH * scale) - 1;
      const ymin = Math.trunc(startY + ry * ROOM_HEIGHT * scale);
      const ymax = Math.trunc(startY + (ry + 1) * ROOM_HEIGHT * scale) - 1;
      const inRoom = (i: number) => {
        const x = i % W;
        const y = (i - x) / W;
        return x >= xmin && x <= xmax && y >= ymin && y <= ymax;
      };
      // menor distância² (em unidades do mundo) até uma bandeira de cada time que alcança o pixel
      const best = [new Map<number, number>(), new Map<number, number>()];
      const onWall = flags.some(({ f }) => px[at(f)] !== ground);
      for (const { t, f } of flags) {
        const reach: number[] = [];
        if (onWall) {
          // bandeira "sobre a parede" no desenho: todo o chão da sala vai para a bandeira mais próxima
          for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) if (px[y * W + x] === ground) reach.push(y * W + x);
        } else {
          const seen = new Uint8Array(W * H);
          const stack = [at(f)];
          seen[at(f)] = 1;
          while (stack.length) {
            const i = stack.pop() as number;
            reach.push(i);
            const x = i % W;
            for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W])
              if (n >= 0 && n < W * H && !seen[n] && px[n] === ground && inRoom(n)) {
                seen[n] = 1;
                stack.push(n);
              }
          }
        }
        for (const i of reach) {
          const x = i % W;
          const y = (i - x) / W;
          const lx = (x + 1 - xmin) / scale;
          const ly = (y + 1 - ymin) / scale;
          const d = (f.x - lx) ** 2 + (f.y - ly) ** 2;
          const m = best[t] as Map<number, number>;
          if (d < (m.get(i) ?? Infinity)) m.set(i, d);
        }
      }
      for (const t of [0, 1] as const)
        for (const [i, d] of best[t] as Map<number, number>) {
          const other = (best[1 - t] as Map<number, number>).get(i);
          if (other === undefined) px[i] = dark[t] as number;
          else if (d - other < -2) px[i] = dark[t] as number;
        }
    }
  ctx.putImageData(image, 0, 0);

  // círculo em cada bandeira
  ctx.lineWidth = Math.max(1, resolution);
  for (const t of [0, 1, 2] as const) {
    const list = t === 2 ? map.wildFlags : map.teams[t].flags;
    ctx.strokeStyle = colours.team[t];
    for (const f of list) {
      const x = startX + (f.room.x * ROOM_WIDTH + f.x) * scale;
      const y = startY + (f.room.y * ROOM_HEIGHT + f.y) * scale;
      ctx.beginPath();
      ctx.arc(Math.trunc(x) + 0.5, Math.trunc(y) + 0.5, (placeW / 50) * resolution, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  return canvas;
}
