// SPDX-License-Identifier: GPL-2.0-or-later
// Tamanho e posição das salas na tela e ponto de vista, como o cliente original
// (plan/specs/render-salas.md): `RoomLayoutManager` (src/graphics.cpp:3205-3301) e `viewTopLeft`
// (src/guiclient.cpp:3387-3425).
import {
  iround,
  PLAYER_RADIUS,
  positiveFmod,
  positiveModulo,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  Vec,
  type GameMap,
  type WorldCoords,
} from '@outgun/sim';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RoomLayout {
  readonly mapW: number;
  readonly mapH: number;
  readonly roomW: number;
  readonly roomH: number;
  /** Salas visíveis por eixo (fracionário). */
  readonly visibleX: number;
  readonly visibleY: number;
  /** Pixels por unidade do mundo. */
  readonly scale: number;
  /** Canto da área de salas, centralizada na área de jogo. */
  readonly x0: number;
  readonly y0: number;
  /** Largura e altura ocupadas pelas salas (o recorte). */
  readonly width: number;
  readonly height: number;
}

/** `RoomLayoutManager::set`. */
export function roomLayout(
  playfield: Rect,
  mapW: number,
  mapH: number,
  visibleRooms: number,
  repeatX = false,
  repeatY = false,
): RoomLayout {
  let vx = visibleRooms;
  let vy = visibleRooms;
  if (!repeatX) vx = Math.min(vx, mapW);
  if (!repeatY) vy = Math.min(vy, mapH);
  let roomW = Math.trunc(playfield.w / vx);
  let roomH = Math.trunc(playfield.h / vy);
  // pelo menos `visible_rooms` cabem em cada direção: corrige a proporção encolhendo um dos lados
  const reverseW = iround((roomH * ROOM_WIDTH) / ROOM_HEIGHT);
  const reverseH = iround((roomW * ROOM_HEIGHT) / ROOM_WIDTH);
  if (roomW > reverseW) roomW = reverseW;
  else if (roomH > reverseH) roomH = reverseH;
  roomW = Math.max(1, roomW);
  roomH = Math.max(1, roomH);
  vx = playfield.w / roomW;
  vy = playfield.h / roomH;
  if (!repeatX) vx = Math.min(vx, mapW);
  if (!repeatY) vy = Math.min(vy, mapH);
  const width = Math.trunc(roomW * vx);
  const height = Math.trunc(roomH * vy);
  return {
    mapW,
    mapH,
    roomW,
    roomH,
    visibleX: vx,
    visibleY: vy,
    scale: (roomW / ROOM_WIDTH + roomH / ROOM_HEIGHT) / 2,
    x0: playfield.x + Math.trunc((playfield.w - width) / 2),
    y0: playfield.y + Math.trunc((playfield.h - height) / 2),
    width,
    height,
  };
}

/** `pf_scale`: unidades do mundo para pixels inteiros. */
export function pfScale(layout: RoomLayout, value: number): number {
  return iround(layout.scale * value);
}

export interface RoomPlacement {
  readonly rx: number;
  readonly ry: number;
  /** Canto superior esquerdo da sala na tela. */
  readonly x: number;
  readonly y: number;
}

/** Salas desenhadas com o canto `topLeft` (`draw_playfield_background`). */
export function visibleRooms(layout: RoomLayout, topLeft: WorldCoords): RoomPlacement[] {
  const xRooms = Math.ceil(layout.visibleX + topLeft.x / ROOM_WIDTH - 0.0001);
  const yRooms = Math.ceil(layout.visibleY + topLeft.y / ROOM_HEIGHT - 0.0001);
  const out: RoomPlacement[] = [];
  for (let dx = 0; dx < xRooms; dx++) {
    const x = layout.x0 - pfScale(layout, topLeft.x) + dx * layout.roomW;
    for (let dy = 0; dy < yRooms; dy++) {
      out.push({
        rx: (topLeft.room.x + dx) % layout.mapW,
        ry: (topLeft.room.y + dy) % layout.mapH,
        x,
        y: layout.y0 - pfScale(layout, topLeft.y) + dy * layout.roomH,
      });
    }
  }
  return out;
}

function roomOffsets(room: number, topRoom: number, topLocal: number, mapSize: number, roomSize: number, visible: number, layout: RoomLayout, origin: number): number[] {
  const out: number[] = [];
  for (let p = ((room - topRoom + mapSize) % mapSize) * roomSize - pfScale(layout, topLocal); p < visible * roomSize; p += mapSize * roomSize)
    out.push(origin + p);
  return out;
}

/** `room_offset_x/y`: onde a sala começa na tela (mais de um lugar se o mapa se repete). */
export function roomOffsetsX(layout: RoomLayout, topLeft: WorldCoords, rx: number): number[] {
  return roomOffsets(rx, topLeft.room.x, topLeft.x, layout.mapW, layout.roomW, layout.visibleX, layout, layout.x0);
}

export function roomOffsetsY(layout: RoomLayout, topLeft: WorldCoords, ry: number): number[] {
  return roomOffsets(ry, topLeft.room.y, topLeft.y, layout.mapH, layout.roomH, layout.visibleY, layout, layout.y0);
}

/** Opção "Let view follow over map border" do original. */
export type ViewOverBorder = 'never' | 'mapDoesntFit' | 'mapWraps' | 'always';

/** `getViewStartCoord`: início da vista num eixo, em salas (fracionário). */
export function viewStartCoord(
  myRoom: number,
  myLocal: number,
  roomSize: number,
  mapSize: number,
  mapWraps: boolean,
  visibleRooms: number,
  view: ViewOverBorder,
  scroll: boolean,
): number {
  let coordBase = 0;
  let visible = visibleRooms;
  if (visible >= mapSize) {
    // a região do tamanho do mapa fica centralizada na tela
    coordBase = -(visible - mapSize) * 0.5;
    visible = mapSize;
    if (view !== 'always' && (view !== 'mapWraps' || !mapWraps)) return coordBase;
  }
  const center = myRoom + (scroll ? myLocal / roomSize : 0.5);
  const half = visible * 0.5;
  if (view === 'never' || (view !== 'always' && !mapWraps)) {
    if (center - half < 0) return coordBase;
    if (center + half >= mapSize) return coordBase + mapSize - visible;
  }
  return coordBase + center - half;
}

/** `splitCompositeCoord`: coordenada em salas para (sala, coordenada local). */
export function splitCompositeCoord(comp: number, roomSize: number, mapSize: number): [number, number] {
  const local = positiveFmod(comp, 1);
  return [positiveModulo(iround(comp - local), mapSize), local * roomSize];
}

export interface ViewOptions {
  readonly scroll: boolean;
  readonly view: ViewOverBorder;
  readonly repeatX: boolean;
  readonly repeatY: boolean;
  /** O mapa tem passagens na borda (dá a volta) em cada eixo. */
  readonly wrapsX: boolean;
  readonly wrapsY: boolean;
}

/** `viewTopLeft` para o jogador em `me`. */
export function viewTopLeft(layout: RoomLayout, me: WorldCoords, opts: ViewOptions): WorldCoords {
  const visX = opts.repeatX ? layout.visibleX : Math.min(layout.mapW, layout.visibleX);
  const visY = opts.repeatY ? layout.visibleY : Math.min(layout.mapH, layout.visibleY);
  const x = viewStartCoord(me.room.x, me.x, ROOM_WIDTH, layout.mapW, opts.wrapsX, visX, opts.view, opts.scroll);
  const y = viewStartCoord(me.room.y, me.y, ROOM_HEIGHT, layout.mapH, opts.wrapsY, visY, opts.view, opts.scroll);
  const [rx, lx] = splitCompositeCoord(x, ROOM_WIDTH, layout.mapW);
  const [ry, ly] = splitCompositeCoord(y, ROOM_HEIGHT, layout.mapH);
  return { room: { x: rx, y: ry }, x: lx, y: ly };
}

/**
 * O mapa "dá a volta" num eixo se um jogador cabe em algum ponto da borda externa
 * (src/guiclient.cpp:2924-2945, testado a cada `PLAYER_RADIUS / 2` unidades).
 */
export function mapWraps(map: GameMap): { x: boolean; y: boolean } {
  const step = Math.trunc(PLAYER_RADIUS / 2);
  const w = map.rooms.length;
  const h = map.rooms[0]?.length ?? 0;
  const free = (rx: number, ry: number, x: number, y: number) =>
    !map.rooms[rx]?.[ry]?.fallOnWallCirc(new Vec(x, y), PLAYER_RADIUS);
  let x = false;
  let y = false;
  for (let side = 0; side < 2; side++) {
    for (let rx = 0; rx < w && !y; rx++)
      for (let lx = 0; lx < ROOM_WIDTH; lx += step)
        if (free(rx, side ? h - 1 : 0, lx, side ? ROOM_HEIGHT : 0)) {
          y = true;
          break;
        }
    for (let ry = 0; ry < h && !x; ry++)
      for (let ly = 0; ly < ROOM_HEIGHT; ly += step)
        if (free(side ? w - 1 : 0, ry, side ? ROOM_WIDTH : 0, ly)) {
          x = true;
          break;
        }
  }
  return { x, y };
}
