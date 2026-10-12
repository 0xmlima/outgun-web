// SPDX-License-Identifier: GPL-2.0-or-later
// Parser de mapas do Outgun: port fiel de `Map::parse_file` e `Map::parse_line`
// (src/world.cpp:397-775). Formato documentado em doc/maps.html. As mensagens de erro são as do
// original (em inglês; tradução no OG-014).
import {
  CircWall,
  FLAG_RADIUS,
  GameMap,
  PLAYER_RADIUS,
  RectWall,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  TriWall,
  type Wall,
  type WorldCoords,
  type WorldRect,
} from '@outgun/sim';
import { CppIStream } from './cpp-istream.js';
import { hawkCrc16 } from './crc16.js';

export type MapParseResult =
  | { readonly ok: true; readonly map: GameMap; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

type LabelBlock = { readonly name: string; readonly lines: string[] };

/** `trim` do original (src/utility.cpp:236): remove espaço, tab, \n, \r e 0xA0 das pontas. */
function trim(text: string): string {
  return text.replace(/^[ \t\n\r\u00a0]+|[ \t\n\r\u00a0]+$/g, '');
}

/** `getline_smart` + `getline_skip_comments`: quebra em \n ou \r e ignora linhas vazias e ";...". */
function significantLines(text: string): string[] {
  return text.split(/[\r\n]+/).filter((line) => line !== '' && line[0] !== ';');
}

/** Bytes ISO-8859-1 de uma string decodificada como latin1. */
function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

/** Decodifica o conteúdo de um arquivo de mapa (ISO-8859-1: cada byte é um caractere U+0000..U+00FF). */
export function decodeMapFile(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text;
}

class MapBuilder {
  width = 0;
  height = 0;
  title = '';
  author = '';
  readonly walls = new Map<string, { walls: Wall[]; ground: Wall[] }>();
  readonly teams: [
    { flags: WorldCoords[]; spawn: WorldCoords[]; respawn: WorldRect[] },
    { flags: WorldCoords[]; spawn: WorldCoords[]; respawn: WorldRect[] },
  ] = [
    { flags: [], spawn: [], respawn: [] },
    { flags: [], spawn: [], respawn: [] },
  ];
  readonly wildFlags: WorldCoords[] = [];

  room(x: number, y: number): { walls: Wall[]; ground: Wall[] } {
    const key = `${x},${y}`;
    let room = this.walls.get(key);
    if (!room) {
      room = { walls: [], ground: [] };
      this.walls.set(key, room);
    }
    return room;
  }

  build(crc: number): GameMap {
    const map = new GameMap(this.width, this.height, this.title, this.author, crc);
    for (const [key, room] of this.walls) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      const target = map.room({ x, y });
      target.walls.push(...room.walls);
      target.ground.push(...room.ground);
    }
    for (const t of [0, 1] as const) {
      map.teams[t].flags.push(...this.teams[t].flags);
      map.teams[t].spawn.push(...this.teams[t].spawn);
      map.teams[t].respawn.push(...this.teams[t].respawn);
    }
    map.wildFlags.push(...this.wildFlags);
    return map;
  }
}

interface Cursor {
  crx: number;
  cry: number;
  scalex: number;
  scaley: number;
}

class Parser {
  readonly errors: string[] = [];
  readonly map = new MapBuilder();

  constructor(private readonly labels: readonly LabelBlock[]) {}

  private error(message: string): false {
    this.errors.push(message);
    return false;
  }

  private invalid(line: string): false {
    return this.error(`Invalid map line: ${line}`);
  }

  private outsideRoom(c: Cursor): boolean {
    const { width: w, height: h } = this.map;
    return c.crx < 0 || c.cry < 0 || c.crx >= w || c.cry >= h;
  }

  /** Lê `[tex [alpha]]` opcionais, como o original (só se o stream ainda estiver `good()`). */
  private static readTexture(ist: CppIStream): { texid: number; alpha: number } {
    const texid = ist.good() ? ist.readInt() : 0;
    const alpha = ist.good() ? ist.readInt() : 255;
    return { texid, alpha };
  }

  parseLine(line: string, c: Cursor, labelBlock = false): boolean {
    const ist = new CppIStream(line);
    const command = ist.readString();
    const sx = ROOM_WIDTH / c.scalex;
    const sy = ROOM_HEIGHT / c.scaley;

    if (command === 'W' || command === 'G') {
      const x1 = ist.readDouble();
      const y1 = ist.readDouble();
      const x2 = ist.readDouble();
      const y2 = ist.readDouble();
      const { texid, alpha } = Parser.readTexture(ist);
      if (ist.fail() || !ist.eof() || this.outsideRoom(c) || alpha < 0 || alpha > 255 || texid < 0 || texid > 7) {
        return this.invalid(line);
      }
      const wall = new RectWall(x1 * sx, y1 * sy, x2 * sx, y2 * sy, texid, alpha);
      const room = this.map.room(c.crx, c.cry);
      (command === 'W' ? room.walls : room.ground).push(wall);
      return true;
    }

    if (command === 'T') {
      const type = ist.readChar();
      const v = [0, 0, 0, 0, 0, 0].map(() => ist.readDouble()) as [number, number, number, number, number, number];
      const { texid, alpha } = Parser.readTexture(ist);
      if (
        ist.fail() ||
        !ist.eof() ||
        (type !== 'W' && type !== 'G') ||
        this.outsideRoom(c) ||
        alpha < 0 ||
        alpha > 255 ||
        texid < 0 ||
        texid > 7
      ) {
        return this.invalid(line);
      }
      const wall = new TriWall(v[0] * sx, v[1] * sy, v[2] * sx, v[3] * sy, v[4] * sx, v[5] * sy, texid, alpha);
      const room = this.map.room(c.crx, c.cry);
      (type === 'W' ? room.walls : room.ground).push(wall);
      return true;
    }

    if (command === 'C') {
      const type = ist.readChar();
      const x = ist.readDouble();
      const y = ist.readDouble();
      const ro = ist.readDouble();
      let ri = 0;
      let a1 = 0;
      let a2 = 0;
      if (ist.good()) ri = ist.readDouble();
      if (ist.good()) {
        a1 = ist.readDouble();
        a2 = ist.readDouble();
      }
      const { texid, alpha } = Parser.readTexture(ist);
      if (a1 < 0) a1 += 360;
      if (a2 < 0) a2 += 360;
      if (
        ist.fail() ||
        !ist.eof() ||
        (type !== 'W' && type !== 'G') ||
        ro <= 0 ||
        ri < 0 ||
        ri >= ro ||
        (a1 !== 0 && a1 === a2) ||
        a1 < 0 ||
        a2 < 0 ||
        a1 >= 360 ||
        a2 >= 360 ||
        alpha < 0 ||
        alpha > 255 ||
        texid < 0 ||
        texid > 7
      ) {
        return this.invalid(line);
      }
      // O raio é escalado pela escala vertical, como no original.
      const wall = new CircWall(x * sx, y * sy, ro * sy, ri * sy, a1, a2, texid, alpha);
      const room = this.map.room(c.crx, c.cry);
      (type === 'W' ? room.walls : room.ground).push(wall);
      return true;
    }

    if (command === 'R') {
      if (labelBlock) return this.error(`Room line not allowed in label block: ${line}`);
      c.crx = ist.readInt();
      c.cry = ist.readInt();
      if (ist.fail() || !ist.eof() || this.outsideRoom(c)) return this.invalid(line);
      return true;
    }

    if (command === 'X') {
      if (labelBlock) return this.error(`Label line not allowed in label block: ${line}`);
      const name = ist.readString();
      const rx1 = ist.readInt();
      const ry1 = ist.readInt();
      let rx2 = rx1;
      let ry2 = ry1;
      if (ist.good()) {
        rx2 = ist.readInt();
        ry2 = ist.readInt();
      }
      const { width: w, height: h } = this.map;
      if (ist.fail() || !ist.eof() || rx1 < 0 || rx2 >= w || rx2 < rx1 || ry1 < 0 || ry2 >= h || ry2 < ry1) {
        return this.invalid(line);
      }
      const label = this.labels.find((l) => l.name === name);
      if (!label) return this.error(`Label '${name}' not found: ${line}`);
      for (let ry = ry1; ry <= ry2; ry++) {
        for (let rx = rx1; rx <= rx2; rx++) {
          // A escala vale por sala: cada repetição começa da escala vigente no comando X.
          const blockCursor: Cursor = { crx: rx, cry: ry, scalex: c.scalex, scaley: c.scaley };
          for (const labelLine of label.lines) {
            if (!this.parseLine(labelLine, blockCursor, true)) return false;
          }
        }
      }
      return true;
    }

    if (command === 'P') {
      const name = ist.readString();
      if (name === 'width' || name === 'height') {
        const current = name === 'width' ? this.map.width : this.map.height;
        if (current !== 0) return this.error(`Redefined map ${name}.`);
        const value = ist.readInt();
        if (name === 'width') this.map.width = value;
        else this.map.height = value;
        if (ist.fail() || !ist.eof() || value < 1 || value > 255) return this.invalid(line);
        return true;
      }
      if (name === 'title' || name === 'author') {
        if ((name === 'title' ? this.map.title : this.map.author) !== '') {
          return this.error(`Redefined map ${name}.`);
        }
        const value = trim(ist.readRestOfLine());
        if (value === '') return this.invalid(line);
        if (name === 'title') this.map.title = value;
        else this.map.author = value;
        return true;
      }
      return this.error(`Unrecognized map line: ${line}`);
    }

    if (command === 'spawn' || command === 'flag') {
      const team = ist.readInt();
      const rx = ist.readInt();
      const ry = ist.readInt();
      const x = ist.readDouble();
      const y = ist.readDouble();
      const maxTeam = command === 'spawn' ? 1 : 2;
      const { width: w, height: h } = this.map;
      if (
        ist.fail() ||
        !ist.eof() ||
        team < 0 ||
        team > maxTeam ||
        rx < 0 ||
        rx >= w ||
        ry < 0 ||
        ry >= h ||
        x < 0 ||
        x >= c.scalex ||
        y < 0 ||
        y >= c.scaley
      ) {
        return this.invalid(line);
      }
      // Truncado para inteiro "para manter o comportamento de versões anteriores" (original).
      const spot: WorldCoords = {
        room: { x: rx, y: ry },
        x: Math.trunc((x * ROOM_WIDTH) / c.scalex),
        y: Math.trunc((y * ROOM_HEIGHT) / c.scaley),
      };
      if (command === 'spawn') this.map.teams[team as 0 | 1].spawn.push(spot);
      else if (team < 2) this.map.teams[team as 0 | 1].flags.push(spot);
      else this.map.wildFlags.push(spot);
      return true;
    }

    if (command === 'V') {
      const sub = ist.readString();
      if (sub !== 'respawn') return true; // extensões desconhecidas são aceitas sem efeito
      const team = ist.readInt();
      const rx = ist.readInt();
      const ry = ist.readInt();
      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      let point = false;
      if (ist.good()) {
        x1 = ist.readDouble();
        y1 = ist.readDouble();
        if (ist.good()) {
          x2 = ist.readDouble();
          y2 = ist.readDouble();
          if (x2 < x1) [x1, x2] = [x2, x1];
          if (y2 < y1) [y1, y2] = [y2, y1];
        } else {
          x2 = x1;
          y2 = y1;
          point = true;
        }
      } else {
        x1 = 0;
        y1 = 0;
        x2 = c.scalex;
        y2 = c.scaley;
      }
      let cx1 = (x1 * ROOM_WIDTH) / c.scalex;
      let cy1 = (y1 * ROOM_HEIGHT) / c.scaley;
      let cx2 = (x2 * ROOM_WIDTH) / c.scalex;
      let cy2 = (y2 * ROOM_HEIGHT) / c.scaley;
      if (!point) {
        // A área útil encolhe o raio do jogador em cada borda.
        cx1 += PLAYER_RADIUS;
        cy1 += PLAYER_RADIUS;
        cx2 -= PLAYER_RADIUS;
        cy2 -= PLAYER_RADIUS;
      }
      const { width: w, height: h } = this.map;
      if (
        ist.fail() ||
        !ist.eof() ||
        team < 0 ||
        team > 2 ||
        rx < 0 ||
        rx >= w ||
        ry < 0 ||
        ry >= h ||
        x1 < 0 ||
        y1 < 0 ||
        cx2 < cx1 ||
        x2 > c.scalex ||
        cy2 < cy1 ||
        y2 > c.scaley
      ) {
        return this.invalid(line);
      }
      const area: WorldRect = { room: { x: rx, y: ry }, x1: cx1, y1: cy1, x2: cx2, y2: cy2 };
      if (team < 2) this.map.teams[team as 0 | 1].respawn.push(area);
      else {
        this.map.teams[0].respawn.push(area);
        this.map.teams[1].respawn.push(area);
      }
      return true;
    }

    if (command === 'S') {
      c.scalex = ist.readDouble();
      c.scaley = ist.readDouble();
      if (ist.fail() || !ist.eof() || c.scalex <= 0 || c.scaley <= 0) return this.invalid(line);
      return true;
    }

    return this.error(`Unrecognized map line: ${line}`);
  }
}

/** Interpreta o texto de um mapa (já decodificado como latin1). */
export function parseMap(text: string): MapParseResult {
  const labels: LabelBlock[] = [];
  const fileLines: string[] = [];
  let crcData = '';
  const fail = (errors: string[]): MapParseResult => ({ ok: false, errors });

  for (const raw of significantLines(text)) {
    const line = trim(raw);
    if (line === '') continue;
    crcData += `${line}\n`;
    if (line[0] === ':') {
      const name = line.slice(1);
      if (name === '') return fail([`Label name missing: ${line}`]);
      if (/[ \t\n\v\f\r]/.test(name)) return fail([`Label contains whitespace: ${line}`]);
      if (labels.some((l) => l.name === name)) return fail([`Two identical label names not allowed: ${line}`]);
      labels.push({ name, lines: [] });
    } else if (labels.length === 0) {
      fileLines.push(line);
    } else {
      (labels[labels.length - 1] as LabelBlock).lines.push(line);
    }
  }

  const parser = new Parser(labels);
  const cursor: Cursor = { crx: 0, cry: 0, scalex: 1, scaley: 1 };
  for (const line of fileLines) {
    if (!parser.parseLine(line, cursor)) return fail(parser.errors);
  }
  const built = parser.map;
  if (built.width === 0 || built.height === 0 || built.title === '') {
    return fail(['Map is missing a width, height or title.']);
  }

  const map = built.build(hawkCrc16(latin1Bytes(crcData)));
  const errors = validatePlacement(map);
  return errors.length > 0 ? fail(errors) : { ok: true, map, errors: [] };
}

/** Bandeiras e spawns não podem tocar paredes; áreas de respawn precisam de espaço livre. */
function validatePlacement(map: GameMap): string[] {
  const errors: string[] = [];
  for (let t = 0; t < 3; t++) {
    const flags = t === 2 ? map.wildFlags : map.teams[t as 0 | 1].flags;
    flags.forEach((flag, i) => {
      if (map.fallOnWallCirc(flag, FLAG_RADIUS)) errors.push(`Team ${t}, flag ${i} on the wall.`);
    });
    if (t === 2) continue;
    const team = map.teams[t as 0 | 1];
    team.spawn.forEach((spot, i) => {
      if (map.fallOnWallCirc(spot, PLAYER_RADIUS)) errors.push(`Team ${t}, spawn point ${i} on the wall.`);
    });
    for (let i = 0; i < team.respawn.length; i++) {
      if (!respawnAreaHasSpace(map, team.respawn[i] as WorldRect)) {
        errors.push(`Team ${t}, respawn area ${i} does not have enough free space.`);
        return errors;
      }
    }
  }
  return errors;
}

/** Amostra a área numa grade de 15 px: precisa de 1/20 dos pontos livres (mínimo 1). */
function respawnAreaHasSpace(map: GameMap, area: WorldRect): boolean {
  const step = PLAYER_RADIUS;
  const xSteps = Math.trunc(Math.trunc(area.x2 - area.x1) / step) + 1;
  const ySteps = Math.trunc(Math.trunc(area.y2 - area.y1) / step) + 1;
  const minFreeSpace = Math.max(1, Math.trunc((xSteps * ySteps) / 20));
  const clearance = Math.trunc((PLAYER_RADIUS * 5) / 4); // aritmética inteira: 18
  let freeSpace = 0;
  for (let y = area.y1; y <= area.y2; y += step) {
    for (let x = area.x1; x <= area.x2; x += step) {
      if (!map.fallOnWallCirc({ room: area.room, x, y }, clearance) && ++freeSpace >= minFreeSpace) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Equivalente a `Map::load_file`: interpreta e, em caso de erro, acrescenta a mensagem final do
 * original com o nome do arquivo.
 */
export function parseMapFile(fileName: string, bytes: Uint8Array): MapParseResult {
  const result = parseMap(decodeMapFile(bytes));
  if (result.ok) return result;
  return { ok: false, errors: [...result.errors, `Can't load: error in map '${fileName}'.`] };
}
