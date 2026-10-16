// SPDX-License-Identifier: GPL-2.0-or-later
// Layout do HUD Moderno (opção A do protótipo plan/specs/hud-moderno/) e do Personalizado (D-55,
// RN-UI-07): a sala mantém a proporção de uma sala e nenhum componente fica sobre ela.
import type { Rect } from '../render/layout.js';
import { CUSTOM_SCALE_MAX, CUSTOM_SCALE_MIN, HUD_COMPONENTS, HUD_SIZES, type CustomComponent, type HudComponent, type HudCustom, type HudRoom } from './hud-style.js';

/** Lugar de um componente; `s` = escala do texto e das barras dele. */
export interface Place extends Rect {
  readonly s: number;
}

export type Places = Partial<Record<HudComponent, Place>>;

export interface HudArrangement {
  readonly room: Rect;
  readonly places: Places;
}

/** Proporção da sala (ROOM_WIDTH × ROOM_HEIGHT = 472 × 354). */
const ROOM_ASPECT = 3 / 4;

const place = (id: HudComponent, x: number, y: number, s: number, w?: number, h?: number): Place => ({
  x: Math.round(x),
  y: Math.round(y),
  w: Math.round(w ?? HUD_SIZES[id][0] * s),
  h: Math.round(h ?? HUD_SIZES[id][1] * s),
  s,
});

/**
 * Moderno: sala com a altura toda à esquerda; coluna à direita com placar, minimapa, vida, energia,
 * power-ups, arma, chat e FPS. Se sobra uma faixa embaixo da sala (4:3), o chat vai para ela.
 * `minimap = false` (F12) tira o minimapa e a coluna sobe.
 */
export function modernArrangement(W: number, H: number, u: number, minimap = true): HudArrangement {
  const colW = Math.max(W - Math.round(H / ROOM_ASPECT), Math.round(W * 0.22));
  const rw = W - colW;
  const rh = Math.min(Math.round(rw * ROOM_ASPECT), H);
  const room = { x: 0, y: 0, w: rh < Math.round(rw * ROOM_ASPECT) ? Math.round(rh / ROOM_ASPECT) : rw, h: rh };
  const p = Math.round(10 * u);
  const cw = colW - 2 * p;
  const x = rw + p;
  const s = Math.min(u, cw / HUD_SIZES.health[0]);
  const places: Places = {};
  let y = p;
  const add = (id: HudComponent, pl: Place, gap = p) => {
    places[id] = pl;
    y = pl.y + pl.h + gap;
  };
  add('score', place('score', x, y, s, cw, HUD_SIZES.score[1] * s));
  if (minimap) add('minimap', place('minimap', x, y, s, cw, Math.round(cw * ROOM_ASPECT)), p + 2 * s);
  add('health', place('health', x, y, s, cw));
  add('energy', place('energy', x, y, s, cw));
  add('powerups', place('powerups', x, y, s, cw));
  add('weapon', place('weapon', x, y, s, cw));
  const fps = place('fps', W - p - HUD_SIZES.fps[0] * s, H - p - HUD_SIZES.fps[1] * s, s);
  if (H - rh >= 110 * u) places.chat = place('chat', p, rh + p, u, rw - 2 * p, H - rh - 2 * p);
  else places.chat = place('chat', x, y, s, cw, Math.max(0, fps.y - p - y));
  places.fps = fps;
  return { room, places };
}

/** Sala do Personalizado: à esquerda como no Moderno, ou centralizada deixando laterais para o HUD. */
export function customRoom(W: number, H: number, room: HudRoom): Rect {
  if (room === 'left') return modernArrangement(W, H, 1).room;
  const rw = Math.min(Math.round(H / ROOM_ASPECT), Math.round(W * 0.64));
  const rh = Math.round(rw * ROOM_ASPECT);
  return { x: Math.round((W - rw) / 2), y: Math.round((H - rh) / 2), w: rw, h: rh };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Posição pela âncora: coluna 0/1/2 = esquerda/centro/direita, linha 0/1/2 = topo/meio/base. */
function fromAnchor(c: CustomComponent, w: number, h: number, W: number, H: number): [number, number] {
  const col = c.anchor % 3;
  const row = Math.trunc(c.anchor / 3);
  const dx = c.dx * H;
  const dy = c.dy * H;
  const x = col === 0 ? dx : col === 2 ? W - w - dx : W / 2 - w / 2 + dx;
  const y = row === 0 ? dy : row === 2 ? H - h - dy : H / 2 - h / 2 + dy;
  return [clamp(Math.round(x), 0, Math.max(0, W - w)), clamp(Math.round(y), 0, Math.max(0, H - h))];
}

/** Âncora mais próxima do centro do componente e o deslocamento até ela (inverso de `fromAnchor`). */
export function toAnchor(r: Rect, W: number, H: number): { anchor: number; dx: number; dy: number } {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const col = cx < W / 3 ? 0 : cx > (2 * W) / 3 ? 2 : 1;
  const row = cy < H / 3 ? 0 : cy > (2 * H) / 3 ? 2 : 1;
  const dx = col === 0 ? r.x : col === 2 ? W - r.x - r.w : cx - W / 2;
  const dy = row === 0 ? r.y : row === 2 ? H - r.y - r.h : cy - H / 2;
  return { anchor: row * 3 + col, dx: dx / H, dy: dy / H };
}

/** Tira o retângulo de cima da sala pelo menor deslocamento (esquerda, direita, cima, baixo); `null` se não couber. */
export function outsideRoom(r: Rect, room: Rect, W: number, H: number): Rect | null {
  if (!overlaps(r, room)) return r;
  const options: Rect[] = [];
  if (room.x >= r.w) options.push({ ...r, x: room.x - r.w });
  if (W - (room.x + room.w) >= r.w) options.push({ ...r, x: room.x + room.w });
  if (room.y >= r.h) options.push({ ...r, y: room.y - r.h });
  if (H - (room.y + room.h) >= r.h) options.push({ ...r, y: room.y + room.h });
  let best: Rect | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = Math.abs(o.x - r.x) + Math.abs(o.y - r.y);
    if (d < bestD) [best, bestD] = [o, d];
  }
  return best;
}

/**
 * Lugar livre mais próximo de `r`: na mesma coluna (deslizando na vertical) ou numa lateral da sala;
 * nada sobre a sala nem sobre outro componente. `null` se não houver.
 */
export function freeSpot(r: Rect, room: Rect, taken: readonly Rect[], W: number, H: number): Rect | null {
  const blocked = [room, ...taken];
  const xs = [...new Set([r.x, room.x - r.w, room.x + room.w].map((x) => clamp(x, 0, W - r.w)))].sort((a, b) => Math.abs(a - r.x) - Math.abs(b - r.x));
  const step = 4;
  for (const x of xs)
    for (let d = 0; d <= H; d += step)
      for (const y of d ? [r.y + d, r.y - d] : [r.y]) {
        if (y < 0 || y > H - r.h) continue;
        const c = { ...r, x, y };
        if (blocked.every((b) => !overlaps(c, b))) return c;
      }
  return null;
}

/**
 * Personalizado: cada componente pela âncora, no lugar livre mais próximo dela (D-55: nada sobre a sala,
 * nem um componente sobre outro); se não couber em lugar nenhum, encolhe.
 */
export function customArrangement(W: number, H: number, u: number, custom: HudCustom, minimap = true): HudArrangement {
  if (!custom.comps && custom.room === 'left') return modernArrangement(W, H, u, minimap);
  const room = customRoom(W, H, custom.room);
  const comps = custom.comps ?? customFromPlaces(W, H, custom.room, startingPlaces(W, H, u, custom.room)).comps;
  if (!comps) return modernArrangement(W, H, u, minimap);
  const places: Places = {};
  const taken: Rect[] = [];
  for (const id of HUD_COMPONENTS) {
    const c = comps[id];
    if (!c.visible || (id === 'minimap' && !minimap)) continue;
    // escala do texto dentro dos limites relativos à escala automática do HUD
    const s0 = clamp(c.s * H, CUSTOM_SCALE_MIN * u, CUSTOM_SCALE_MAX * u);
    const k0 = s0 / (c.s * H);
    for (let k = k0; k >= 0.3 * k0; k *= 0.85) {
      const w = Math.min(W, Math.round(c.w * H * k));
      const h = Math.min(H, Math.round(c.h * H * k));
      const [x, y] = fromAnchor(c, w, h, W, H);
      const spot = freeSpot({ x, y, w, h }, room, taken, W, H);
      if (spot) {
        places[id] = { ...spot, s: c.s * H * k };
        taken.push(spot);
        break;
      }
    }
  }
  return { room, places };
}

/** Ponto de partida do editor: o Moderno, levado para fora da sala se ela estiver centralizada. */
export function startingPlaces(W: number, H: number, u: number, room: HudRoom): Places {
  const from = modernArrangement(W, H, u).places;
  if (room === 'left') return from;
  const r = customRoom(W, H, room);
  const out: Places = {};
  const taken: Rect[] = [];
  for (const id of HUD_COMPONENTS) {
    const p = from[id];
    if (!p) continue;
    // na sala centralizada a coluna some: o componente vai para a lateral da direita com a largura dela
    const side = W - (r.x + r.w);
    const k = Math.min(1, (side - 2 * Math.round(10 * u)) / p.w);
    const w = Math.round(p.w * k);
    const h = Math.round(p.h * k);
    const res = freeSpot({ x: clamp(p.x, 0, W - w), y: clamp(p.y, 0, H - h), w, h }, r, taken, W, H);
    if (res) {
      out[id] = { ...res, s: p.s * k };
      taken.push(res);
    }
  }
  return out;
}

/** Converte lugares (do editor) para o formato salvo; componentes sem lugar ficam escondidos. */
export function customFromPlaces(W: number, H: number, room: HudRoom, places: Places, hidden: ReadonlySet<HudComponent> = new Set()): HudCustom {
  const comps = {} as Record<HudComponent, CustomComponent>;
  for (const id of HUD_COMPONENTS) {
    const p = places[id] ?? { ...place(id, 0, 0, 1) };
    comps[id] = { ...toAnchor(p, W, H), w: p.w / H, h: p.h / H, s: p.s / H, visible: !hidden.has(id) && places[id] !== undefined };
  }
  return { room, comps };
}
