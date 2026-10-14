// SPDX-License-Identifier: GPL-2.0-or-later
// Grafo de áreas do mapa usado pelos bots (`AreaMap`, src/bot_support.cpp). Cada sala é dividida em
// áreas conexas por onde um jogador passa; as áreas se ligam pelas portas nas bordas da sala. Spec:
// plan/specs/bots-areamap.md.
import {
  PLAYER_RADIUS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  Vec,
  positiveModulo,
  type GameMap,
  type RoomCoords,
  type WorldCoords,
} from '@outgun/sim';

/** Direção da porta, na ordem do enum do original (`Area::Neighbor::Direction`). */
export enum Direction {
  Up = 0,
  Down = 1,
  Left = 2,
  Right = 3,
}

/** Porta: intervalo [min, max] na borda da sala (x para Up/Down, y para Left/Right). */
export type Door = readonly [number, number];

export class Neighbor {
  /** Preenchido na ligação das portas (`AreaMap::initialize`). */
  area!: Area;
  readonly doors: Door[];

  constructor(
    readonly direction: Direction,
    door0: number,
    door1: number,
  ) {
    this.doors = [[door0, door1]];
  }

  get dx(): number {
    return this.direction === Direction.Left ? -1 : this.direction === Direction.Right ? 1 : 0;
  }

  get dy(): number {
    return this.direction === Direction.Up ? -1 : this.direction === Direction.Down ? 1 : 0;
  }
}

export class Area {
  /** Posição em `AreaMap.areas` (ordem de criação do original); indexa as tabelas de distância. */
  index = -1;
  /** Soma 1 por time se o mapa define áreas de respawn; senão 0. */
  readonly respawnFrequency: [number, number] = [0, 0];
  /** Frequência de respawn suavizada com a dos vizinhos. */
  readonly respawnValue: [number, number] = [0, 0];
  /** Vizinhos; os da mesma direção ficam em sequência (Up, Left, Down, Right). */
  readonly neighbors: Neighbor[] = [];
  /** Áreas que têm esta como vizinha (com repetição se for vizinha em duas direções). */
  readonly reverseNeighbors: Area[] = [];

  constructor(readonly room: RoomCoords) {}
}

/** Nó da árvore que localiza a área de um ponto da sala (`AreaMapLevel`). */
export type AreaMapLevel =
  | { readonly kind: 'area'; readonly area: Area }
  | { readonly kind: 'x' | 'y'; readonly border: number; readonly before: AreaMapLevel; readonly after: AreaMapLevel };

function findInLevel(level: AreaMapLevel, x: number, y: number): Area {
  let l = level;
  while (l.kind !== 'area') l = (l.kind === 'x' ? x < l.border : y < l.border) ? l.before : l.after;
  return l.area;
}

// Grade de pontos de teste por sala (src/bot_support.cpp:63-67): 65 × 49, distância igual nos dois eixos.
const X_POINTS = 65;
const Y_POINTS = Math.trunc(((X_POINTS - 1) * ROOM_HEIGHT) / ROOM_WIDTH) + 1;
const POINT_DISTANCE = ROOM_WIDTH / (X_POINTS - 1);
/** Livre em volta de cada ponto para haver passagem da largura de um jogador até o vizinho. */
const POINT_RADIUS = Math.sqrt((0.5 * POINT_DISTANCE) ** 2 + (1.1 * PLAYER_RADIUS) ** 2);
const MAP_WALL = -1;
const MAP_UNREACHED = -2;

/** Grafo de áreas de um mapa. Imutável depois de construído: as distâncias ficam em `DistanceTables`. */
export class AreaMap {
  readonly areas: Area[] = [];
  /** Árvore de cada sala, indexada por [x][y]. */
  readonly rooms: AreaMapLevel[][] = [];

  constructor(readonly map: GameMap) {
    // Todas as áreas antes das ligações.
    for (let x = 0; x < map.width; ++x) {
      const column: AreaMapLevel[] = [];
      this.rooms.push(column);
      for (let y = 0; y < map.height; ++y) column.push(this.splitRoom({ x, y }));
    }
    this.areas.forEach((area, i) => (area.index = i));
    this.linkDoors();
    this.computeRespawnValues();
  }

  /** Área que contém `pos`; para sala inválida devolve a primeira área (`AreaMap::identifyArea`). */
  identifyArea(pos: WorldCoords): Area {
    return this.identifyAreaAt(pos.room.x, pos.room.y, pos.x, pos.y);
  }

  /** `identifyArea` sem montar um `WorldCoords`. */
  identifyAreaAt(roomX: number, roomY: number, x: number, y: number): Area {
    const column = roomX >= 0 && roomY >= 0 ? this.rooms[roomX] : undefined;
    const level = roomY < this.map.height ? column?.[roomY] : undefined;
    return level ? findInLevel(level, x, y) : this.areas[0]!;
  }

  private splitRoom(roomPos: RoomCoords): AreaMapLevel {
    const room = this.map.room(roomPos);
    const roomMap: Int32Array[] = [];
    for (let ix = 0; ix < X_POINTS; ++ix) {
      const column = new Int32Array(Y_POINTS);
      const x = ix * POINT_DISTANCE;
      for (let iy = 0; iy < Y_POINTS; ++iy) {
        column[iy] = room.fallOnWallCirc(new Vec(x, iy * POINT_DISTANCE), POINT_RADIUS) ? MAP_WALL : MAP_UNREACHED;
      }
      roomMap.push(column);
    }
    const at = (x: number, y: number): number => roomMap[x]![y]!;
    const set = (x: number, y: number, v: number): void => {
      roomMap[x]![y] = v;
    };

    // Componentes conexas (vizinhança 4), numeradas na ordem de varredura x, y.
    let nAreas = 0;
    for (let sx = 0; sx < X_POINTS; ++sx) {
      for (let sy = 0; sy < Y_POINTS; ++sy) {
        if (at(sx, sy) !== MAP_UNREACHED) continue;
        set(sx, sy, nAreas);
        const queue: number[] = [sx, sy];
        for (let head = 0; head < queue.length; head += 2) {
          const px = queue[head]!;
          const py = queue[head + 1]!;
          const expand = (x: number, y: number): void => {
            if (at(x, y) === MAP_UNREACHED) {
              set(x, y, nAreas);
              queue.push(x, y);
            }
          };
          if (px > 0) expand(px - 1, py);
          if (px < X_POINTS - 1) expand(px + 1, py);
          if (py > 0) expand(px, py - 1);
          if (py < Y_POINTS - 1) expand(px, py + 1);
        }
        ++nAreas;
      }
    }

    // Uma Area por componente com porta; as sem porta são canceladas (null).
    let roomAreas: (Area | null)[] = [];
    let nCancelled = 0;
    for (let areaIndex = 0; areaIndex < nAreas; ++areaIndex) {
      const area = new Area(roomPos);
      for (let edge = 0; edge < 2; ++edge) {
        const xEdge = edge ? X_POINTS - 1 : 0;
        const yEdge = edge ? Y_POINTS - 1 : 0;
        const xDir = edge ? Direction.Right : Direction.Left;
        const yDir = edge ? Direction.Down : Direction.Up;
        let door0 = -1;
        const checkDoor = (point: number, isDoor: boolean, direction: Direction): void => {
          if (isDoor && door0 === -1) door0 = point;
          else if (!isDoor && door0 !== -1) {
            area.neighbors.push(
              new Neighbor(direction, door0 * POINT_DISTANCE - POINT_RADIUS, (point - 1) * POINT_DISTANCE + POINT_RADIUS),
            );
            door0 = -1;
          }
        };
        for (let x = 0; x < X_POINTS; ++x) checkDoor(x, at(x, yEdge) === areaIndex, yDir);
        checkDoor(X_POINTS, false, yDir);
        for (let y = 0; y < Y_POINTS; ++y) checkDoor(y, at(xEdge, y) === areaIndex, xDir);
        checkDoor(Y_POINTS, false, xDir);
      }
      if (area.neighbors.length === 0) {
        ++nCancelled;
        roomAreas.push(null);
      } else {
        roomAreas.push(area);
        this.areas.push(area);
      }
    }

    if (roomAreas.length === nCancelled) {
      // Toda sala precisa de uma área.
      const area = new Area(roomPos);
      this.areas.push(area);
      roomAreas = [area];
      nCancelled = 0;
    } else if (nCancelled) {
      for (const column of roomMap) {
        for (let y = 0; y < Y_POINTS; ++y) if (column[y]! >= 0 && !roomAreas[column[y]!]) column[y] = MAP_WALL;
      }
    }

    // Frequência de respawn: cada área de respawn do time pesa 1/n, repartido pelos pontos de cada área.
    for (const team of [0, 1] as const) {
      const respawns = this.map.teams[team].respawn;
      for (const r of respawns) {
        if (r.room.x !== roomPos.x || r.room.y !== roomPos.y) continue;
        if (roomAreas.length - nCancelled === 1) {
          for (const a of roomAreas) if (a) a.respawnFrequency[team] += 1 / respawns.length;
        } else {
          const ix1 = Math.trunc((r.x1 + POINT_DISTANCE / 2) / POINT_DISTANCE);
          const ix2 = Math.trunc((r.x2 + POINT_DISTANCE / 2) / POINT_DISTANCE);
          const iy1 = Math.trunc((r.y1 + POINT_DISTANCE / 2) / POINT_DISTANCE);
          const iy2 = Math.trunc((r.y2 + POINT_DISTANCE / 2) / POINT_DISTANCE);
          const areaPoints = new Array<number>(roomAreas.length).fill(0);
          for (let x = ix1; x <= ix2; ++x) {
            for (let y = iy1; y <= iy2; ++y) {
              const v = at(x, y);
              if (v !== MAP_WALL) ++areaPoints[v]!;
            }
          }
          const total = areaPoints.reduce((s, v) => s + v, 0);
          areaPoints.forEach((points, i) => {
            if (points) roomAreas[i]!.respawnFrequency[team] += points / total / respawns.length;
          });
        }
      }
    }

     
    if (roomAreas.length === 1) return { kind: 'area', area: roomAreas[0]! };
    return splitAreas(roomMap, roomAreas, 0, 0, X_POINTS - 1, Y_POINTS - 1);
  }

  /** Liga cada porta à área do outro lado; portas para a mesma área na mesma direção viram uma vizinha. */
  private linkDoors(): void {
    const { width, height } = this.map;
    for (const area of this.areas) {
      let seen = new Map<Area, number>();
      let prevDir = Direction.Up;
      for (let ni = 0; ni < area.neighbors.length; ) {
        const n = area.neighbors[ni]!;
        if (n.direction !== prevDir) {
          prevDir = n.direction;
          // A mesma área pode estar em duas direções (mapa de uma sala de altura ou largura).
          seen = new Map();
        }
        const { dx, dy } = n;
        const door = n.doors[0]!;
        n.area = this.identifyArea({
          room: { x: positiveModulo(area.room.x + dx, width), y: positiveModulo(area.room.y + dy, height) },
          x: dx ? (dx < 0 ? ROOM_WIDTH : 0) : (door[0] + door[1]) / 2,
          y: dy ? (dy < 0 ? ROOM_HEIGHT : 0) : (door[0] + door[1]) / 2,
        });
        const primary = seen.get(n.area);
        if (primary === undefined) {
          seen.set(n.area, ni++);
          n.area.reverseNeighbors.push(area);
        } else {
          area.neighbors[primary]!.doors.push(door);
          area.neighbors.splice(ni, 1);
        }
      }
    }
  }

  /** Metade da frequência de respawn de cada área escorre para as vizinhas. */
  private computeRespawnValues(): void {
    const bledPart = 0.5;
    for (const area of this.areas) {
      for (const team of [0, 1] as const) {
        area.respawnValue[team] = area.respawnFrequency[team] * (1 - bledPart);
        for (const rn of area.reverseNeighbors) {
          area.respawnValue[team] += (rn.respawnFrequency[team] * bledPart) / rn.neighbors.length;
        }
      }
    }
  }
}

/**
 * Árvore de cortes em x ou y que separa as áreas de uma caixa da grade (`AreaSplitter`,
 * src/bot_support.cpp:286-387). Prefere cortes que deixam áreas inteiras dos dois lados, depois
 * cortes perto do meio.
 */
function splitAreas(
  roomMap: Int32Array[],
  roomAreas: (Area | null)[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): AreaMapLevel {
  const n = roomAreas.length;
  const count = new Array<number>(n).fill(0);
  const minX = new Array<number>(n).fill(x1);
  const minY = new Array<number>(n).fill(y1);
  const maxX = new Array<number>(n).fill(x0);
  const maxY = new Array<number>(n).fill(y0);
  for (let y = y0; y <= y1; ++y) {
    for (let x = x0; x <= x1; ++x) {
      const idx = roomMap[x]![y]!;
      if (idx < 0) continue;
      if (x < minX[idx]!) minX[idx] = x;
      if (x > maxX[idx]!) maxX[idx] = x;
      if (y < minY[idx]!) minY[idx] = y;
      if (y > maxY[idx]!) maxY[idx] = y;
      ++count[idx]!;
    }
  }
  let last = 0;
  let nActual = 0;
  count.forEach((c, i) => {
    if (c) {
      ++nActual;
      last = i;
    }
  });
  if (nActual === 0) throw new Error('AreaSplitter: caixa sem áreas');
   
  if (nActual === 1) return { kind: 'area', area: roomAreas[last]! };

  let bestValue = 0;
  let bestIsX = false;
  let bestPoint = 0;
  const testPoint = (isX: boolean, point: number, value: number): void => {
    if (value > bestValue) {
      bestValue = value;
      bestIsX = isX;
      bestPoint = point;
    }
  };

  const testAxisPoints = (minimums: number[], maximums: number[], isX: boolean): [number, number] => {
    let minValue = minimums[0]!;
    let maxValue = maximums[0]!;
    for (let i = 1; i < n; ++i) {
      if (minimums[i]! < minValue) minValue = minimums[i]!;
      if (maximums[i]! > maxValue) maxValue = maximums[i]!;
    }
    const points: number[] = [];
    for (let i = 0; i < n; ++i) {
      if (!count[i]) continue;
      if (minimums[i] !== minValue) points.push(minimums[i]!);
      if (maximums[i] !== maxValue) points.push(maximums[i]! + 1);
    }
    if (minValue !== maxValue) {
      testPoint(isX, minValue + Math.trunc((maxValue - minValue + 1) / 2), (maxValue - minValue) * 10);
    }
    if (points.length === 0) return [minValue, maxValue];
    points.sort((a, b) => a - b);
    let before = 0;
    let after = nActual;
    for (let i = 0; i < n; ++i) if (count[i] && minimums[i] === minValue) --after;
    let prev = -1;
    for (let pi = 0; pi < points.length; ++pi) {
      const p = points[pi]!;
      if (p === prev) continue;
      prev = p;
      for (let i = 0; i < n; ++i) if (count[i] && maximums[i] === p - 1) ++before;
      const sizeBefore = p - minValue;
      const sizeAfter = maxValue + 1 - p;
      testPoint(
        isX,
        p,
        before * after * 100000 + ((before ? sizeAfter : 0) + (after ? sizeBefore : 0)) * 40 + Math.min(sizeBefore, sizeAfter),
      );
      for (let i = 0; i < n; ++i) if (count[i] && minimums[i] === p) --after;
      if (before + after === nActual) {
        // Faixa sem área quebrada: corta no meio da terra de ninguém.
        testPoint(isX, Math.trunc((p + points[pi + 1]!) / 2), before * after * 100000 + 90000 + Math.min(sizeBefore, sizeAfter));
      }
    }
    return [minValue, maxValue];
  };

  const [minXInUse, maxXInUse] = testAxisPoints(minX, maxX, true);
  const [minYInUse, maxYInUse] = testAxisPoints(minY, maxY, false);
  if (bestValue === 0) throw new Error('AreaSplitter: nenhum corte');
  if (bestIsX) {
    return {
      kind: 'x',
      border: ((bestPoint - 0.5) / (roomMap.length - 1)) * ROOM_WIDTH,
      before: splitAreas(roomMap, roomAreas, minXInUse, minYInUse, bestPoint - 1, maxYInUse),
      after: splitAreas(roomMap, roomAreas, bestPoint, minYInUse, maxXInUse, maxYInUse),
    };
  }
  return {
    kind: 'y',
    border: ((bestPoint - 0.5) / (Y_POINTS - 1)) * ROOM_HEIGHT,
    before: splitAreas(roomMap, roomAreas, minXInUse, minYInUse, maxXInUse, bestPoint - 1),
    after: splitAreas(roomMap, roomAreas, minXInUse, bestPoint, maxXInUse, maxYInUse),
  };
}
