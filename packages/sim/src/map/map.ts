// SPDX-License-Identifier: GPL-2.0-or-later
// Modelo do mapa (src/world.h:53-242): grade de salas com paredes, áreas de chão, bandeiras,
// spawns e áreas de respawn. Construído pelo parser de @outgun/content.
import { Vec } from '../geometry/vec.js';
import type { Wall } from './walls.js';

export interface RoomCoords {
  readonly x: number;
  readonly y: number;
}

/** Posição no mundo: sala + coordenadas locais (0..472, 0..354). */
export interface WorldCoords {
  readonly room: RoomCoords;
  readonly x: number;
  readonly y: number;
}

/** Retângulo dentro de uma sala (áreas de respawn). */
export interface WorldRect {
  readonly room: RoomCoords;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export class Room {
  /** Paredes, na ordem do arquivo de mapa (a ordem importa para a física). */
  readonly walls: Wall[] = [];
  /** Áreas de chão com textura própria (só visual). */
  readonly ground: Wall[] = [];

  /** Checagem por retângulo; tão precisa quanto `intersectsRect` de cada parede. */
  fallOnWallRect(x1: number, y1: number, x2: number, y2: number): boolean {
    return this.walls.some((wall) => wall.intersectsRect(x1, y1, x2, y2));
  }

  /** Checagem por círculo; tão precisa quanto `intersectsCirc` de cada parede. */
  fallOnWallCirc(center: Vec, r: number): boolean {
    return this.walls.some((wall) => wall.intersectsCirc(center, r));
  }
}

export interface MapTeam {
  readonly flags: WorldCoords[];
  readonly spawn: WorldCoords[];
  readonly respawn: WorldRect[];
}

export class GameMap {
  /** Salas indexadas por [x][y], como no original. */
  readonly rooms: Room[][];
  /** Times 0 (vermelho) e 1 (azul). */
  readonly teams: readonly [MapTeam, MapTeam] = [
    { flags: [], spawn: [], respawn: [] },
    { flags: [], spawn: [], respawn: [] },
  ];
  /** Bandeiras selvagens (time 2). */
  readonly wildFlags: WorldCoords[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly title: string,
    readonly author: string,
    /** CRC-16 do conteúdo significativo do arquivo (`Map::crc`); identifica a versão do mapa. */
    readonly crc: number,
  ) {
    this.rooms = Array.from({ length: width }, () => Array.from({ length: height }, () => new Room()));
  }

  room(coords: RoomCoords): Room {
    const room = this.rooms[coords.x]?.[coords.y];
    if (!room) throw new RangeError(`sala fora do mapa: (${coords.x}, ${coords.y})`);
    return room;
  }

  fallOnWallCirc(center: WorldCoords, r: number): boolean {
    return this.room(center.room).fallOnWallCirc(new Vec(center.x, center.y), r);
  }

  fallOnWallRect(rect: WorldRect): boolean {
    return this.room(rect.room).fallOnWallRect(rect.x1, rect.y1, rect.x2, rect.y2);
  }
}
