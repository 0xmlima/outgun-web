// SPDX-License-Identifier: GPL-2.0-or-later
// Imagem de uma sala: port de `Graphics::drawRoomBackground` com antialiasing (src/graphics.cpp:
// 489-588, plan/specs/render-salas.md). A sala é desenhada uma vez num canvas e vira textura.
import { ROOM_HEIGHT, ROOM_WIDTH, type GameMap, type Wall } from '@outgun/sim';
import { colour, type Fill, type RoomTheme } from './theme.js';

/** `Graphics::flagpos_radius` (src/graphics.h:518), em unidades do mundo. */
export const FLAGPOS_RADIUS = 30;

/** Alfa da marca de bandeira: `min(256, int((R − d)·300/R))/256` (`FlagmarkerPixelSource`). */
export const FLAGMARK_FULL_UNTIL = 1 - 256 / 300;

/** Contexto 2D de um canvas comum ou de um OffscreenCanvas (pintura no worker). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PaintOptions {
  /** Tamanho da sala em pixels do canvas. */
  readonly width: number;
  readonly height: number;
  /** Pixels do canvas por texel (= `devicePixelRatio`: 1 texel = 1 pixel CSS). */
  readonly texelSize: number;
  /** Sala usada para alinhar as texturas: a própria com texturas contínuas, senão (0, 0). */
  readonly texRoomX: number;
  readonly texRoomY: number;
}

/** Escala e deslocamento que fazem a sala 472×354 preencher o bitmap (cortando o excesso). */
export function roomTransform(width: number, height: number): { scale: number; x0: number; y0: number } {
  const scale = Math.max((width - 0.02) / ROOM_WIDTH, (height - 0.02) / ROOM_HEIGHT);
  return { scale, x0: (width - scale * ROOM_WIDTH) / 2, y0: (height - scale * ROOM_HEIGHT) / 2 };
}

/** Ângulo do original (0 = cima, horário, graus) para o do canvas (0 = direita, horário, rad). */
export function canvasAngle(degrees: number): number {
  return ((degrees - 90) * Math.PI) / 180;
}

/**
 * Acrescenta a forma da parede a `path`, sempre no sentido horário na tela (com a regra nonzero,
 * paredes sobrepostas no mesmo caminho se somam em vez de abrir buracos).
 */
export function addWallPath(path: Path2D, wall: Wall, x0: number, y0: number, scale: number): void {
  const X = (x: number) => x0 + x * scale;
  const Y = (y: number) => y0 + y * scale;
  switch (wall.kind) {
    case 'rect':
      path.rect(X(wall.a), Y(wall.b), (wall.c - wall.a) * scale, (wall.d - wall.b) * scale);
      return;
    case 'tri': {
      let pts = [wall.p1, wall.p2, wall.p3];
      const area = (pts[1]!.x - pts[0]!.x) * (pts[2]!.y - pts[0]!.y) - (pts[1]!.y - pts[0]!.y) * (pts[2]!.x - pts[0]!.x);
      if (area < 0) pts = [pts[0]!, pts[2]!, pts[1]!];
      path.moveTo(X(pts[0]!.x), Y(pts[0]!.y));
      path.lineTo(X(pts[1]!.x), Y(pts[1]!.y));
      path.lineTo(X(pts[2]!.x), Y(pts[2]!.y));
      path.closePath();
      return;
    }
    case 'circ': {
      const cx = X(wall.center.x);
      const cy = Y(wall.center.y);
      const ro = wall.ro * scale;
      const ri = wall.ri * scale;
      const [a1, a2] = wall.angles;
      if (a1 === a2) {
        path.moveTo(cx + ro, cy);
        path.arc(cx, cy, ro, 0, 2 * Math.PI, false);
        if (ri > 0) {
          path.moveTo(cx + ri, cy);
          path.arc(cx, cy, ri, 2 * Math.PI, 0, true);
        }
      } else {
        const t1 = canvasAngle(a1);
        const t2 = canvasAngle(a2);
        path.moveTo(cx + ro * Math.cos(t1), cy + ro * Math.sin(t1));
        path.arc(cx, cy, ro, t1, t2, false);
        if (ri > 0) path.arc(cx, cy, ri, t2, t1, true);
        else path.lineTo(cx, cy);
      }
      path.closePath();
      return;
    }
  }
}

function fillStyle(ctx: Ctx2D, fill: Fill, opts: PaintOptions): string | CanvasPattern {
  if (fill.kind === 'solid') return fill.colour;
  const pattern = ctx.createPattern(fill.image, 'repeat');
  if (!pattern) return '#000000';
  // Texturas na resolução nativa, ancoradas na origem da sala de textura (`texOffsetBase`).
  const t = opts.texelSize;
  pattern.setTransform(new DOMMatrix([t, 0, 0, t, -opts.texRoomX * opts.width, -opts.texRoomY * opts.height]));
  return pattern;
}

/**
 * Preenche as paredes agrupadas por textura (na ordem em que cada textura aparece): formas da mesma
 * textura num só caminho não deixam costura do chão entre elas, que o antialiasing por amostragem
 * do canvas criaria nas bordas comuns (o `SceneAntialiaser` do original calcula a cobertura exata).
 */
function fillWalls(ctx: Ctx2D, walls: readonly Wall[], fills: readonly Fill[], opts: PaintOptions, x0: number, y0: number, scale: number): void {
  const paths = new Map<number, Path2D>();
  for (const wall of walls) {
    let path = paths.get(wall.texture);
    if (!path) paths.set(wall.texture, (path = new Path2D()));
    addWallPath(path, wall, x0, y0, scale);
  }
  for (const [texture, path] of paths) {
    ctx.fillStyle = fillStyle(ctx, fills[texture] ?? fills[0]!, opts);
    ctx.fill(path, 'nonzero');
  }
}

/** Desenha a sala (rx, ry) de `map` em `ctx` (0,0)–(width,height). */
export function paintRoom(ctx: Ctx2D, map: GameMap, rx: number, ry: number, theme: RoomTheme, opts: PaintOptions): void {
  const room = map.rooms[rx]?.[ry];
  const { width, height } = opts;
  const { scale, x0, y0 } = roomTransform(width, height);
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(0.01, 0.01, width - 0.02, height - 0.02);
  ctx.clip();

  // 1. chão inteiro com a textura de chão 0
  ctx.fillStyle = fillStyle(ctx, theme.floor[0]!, opts);
  ctx.fillRect(x0, y0, ROOM_WIDTH * scale, ROOM_HEIGHT * scale);
  // 2. áreas de chão
  if (room) fillWalls(ctx, room.ground, theme.floor, opts, x0, y0, scale);

  // 3. marcas das bandeiras vermelhas, azuis e neutras (misturadas por cima)
  const markColours = [colour(theme, 'team_red_basic'), colour(theme, 'team_blue_basic'), colour(theme, 'wild_flag')];
  const flagLists = [map.teams[0].flags, map.teams[1].flags, map.wildFlags];
  const r = FLAGPOS_RADIUS * scale;
  flagLists.forEach((flags, team) => {
    for (const flag of flags) {
      if (flag.room.x !== rx || flag.room.y !== ry) continue;
      const cx = x0 + flag.x * scale;
      const cy = y0 + flag.y * scale;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const solid = markColours[team]!;
      gradient.addColorStop(0, solid);
      gradient.addColorStop(FLAGMARK_FULL_UNTIL, solid);
      gradient.addColorStop(1, `${solid}00`);
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  });

  // 4. borda da sala: faixas de meio pixel (da tela) nos quatro lados
  const bw = 0.5 * opts.texelSize;
  ctx.fillStyle = colour(theme, 'room_border');
  ctx.fillRect(0, 0, width, bw);
  ctx.fillRect(0, height - bw, width, bw);
  ctx.fillRect(0, 0, bw, height);
  ctx.fillRect(width - bw, 0, bw, height);

  // 5. paredes
  if (room) fillWalls(ctx, room.walls, theme.wall, opts, x0, y0, scale);
  ctx.restore();
}
