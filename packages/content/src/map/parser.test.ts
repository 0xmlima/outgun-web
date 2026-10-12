// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CircWall, RectWall, TriWall, type GameMap, type Wall, type WorldCoords } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import crcVectors from './__fixtures__/crc16.json' with { type: 'json' };
import expectedMaps from './__fixtures__/maps.json' with { type: 'json' };
import { hawkCrc16 } from './crc16.js';
import { parseMapFile } from './parser.js';

// Fixtures do oráculo: tools/parity/fixtures/maps.cpp (parser original) e crc16.cpp.
const repoRoot = join(import.meta.dirname, '../../../..');

interface ExpectedMap {
  ok: boolean;
  errors: string[];
  width?: number;
  height?: number;
  title?: string;
  author?: string;
  crc?: number;
  team0?: { flags: number[][]; spawn: number[][]; respawn: number[][] };
  team1?: { flags: number[][]; spawn: number[][]; respawn: number[][] };
  wildFlags?: number[][];
  rooms?: { x: number; y: number; walls: unknown[]; ground: unknown[] }[];
}

function filePath(key: string): string {
  return key.startsWith('/fixtures/')
    ? join(repoRoot, 'tools/parity', key.slice(1))
    : join(repoRoot, key);
}

const coords = (c: WorldCoords) => [c.room.x, c.room.y, c.x, c.y];

/** Mesma forma do JSON do fixture; campos trigonométricos arredondados para comparar com tolerância. */
function wallJson(w: Wall): unknown {
  if (w instanceof RectWall) {
    return { type: 'rect', tex: w.texture, alpha: w.alpha, a: w.a, b: w.b, c: w.c, d: w.d };
  }
  if (w instanceof TriWall) {
    return {
      type: 'tri',
      tex: w.texture,
      alpha: w.alpha,
      p: [w.p1.x, w.p1.y, w.p2.x, w.p2.y, w.p3.x, w.p3.y],
      bound: [w.boundX1, w.boundY1, w.boundX2, w.boundY2],
    };
  }
  const c = w as CircWall;
  return {
    type: 'circ',
    tex: c.texture,
    alpha: c.alpha,
    c: [c.center.x, c.center.y],
    ro: c.ro,
    ri: c.ri,
    angle: [...c.angles],
    va1: [c.va1.x, c.va1.y],
    va2: [c.va2.x, c.va2.y],
    midvec: [c.midvec.x, c.midvec.y],
    anglecos: c.anglecos,
  };
}

/** sin/cos podem diferir no último bit entre V8 e glibc: arredonda esses campos para 12 casas. */
function roundTrig(value: unknown): unknown {
  const r = (n: number) => Math.round(n * 1e12) / 1e12;
  if (value && typeof value === 'object' && 'type' in value && value.type === 'circ') {
    const v = value as Record<string, number | number[]>;
    return {
      ...v,
      va1: (v.va1 as number[]).map(r),
      va2: (v.va2 as number[]).map(r),
      midvec: (v.midvec as number[]).map(r),
      anglecos: r(v.anglecos as number),
    };
  }
  return value;
}

function mapJson(map: GameMap) {
  const team = (t: 0 | 1) => ({
    flags: map.teams[t].flags.map(coords),
    spawn: map.teams[t].spawn.map(coords),
    respawn: map.teams[t].respawn.map((a) => [a.room.x, a.room.y, a.x1, a.y1, a.x2, a.y2]),
  });
  const rooms = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const room = map.room({ x, y });
      rooms.push({
        x,
        y,
        walls: room.walls.map(wallJson).map(roundTrig),
        ground: room.ground.map(wallJson).map(roundTrig),
      });
    }
  }
  return {
    width: map.width,
    height: map.height,
    title: map.title,
    author: map.author,
    crc: map.crc,
    team0: team(0),
    team1: team(1),
    wildFlags: map.wildFlags.map(coords),
    rooms,
  };
}

describe('hawkCrc16 x HawkNL do original', () => {
  for (const vector of crcVectors) {
    it(`[${vector.bytes.join(',')}] → ${vector.crc}`, () => {
      expect(hawkCrc16(Uint8Array.from(vector.bytes))).toBe(vector.crc);
    });
  }
});

describe('parser de mapas x parser original', () => {
  const entries = Object.entries(expectedMaps as unknown as Record<string, ExpectedMap>);

  it('o fixture cobre os 45 mapas distribuídos e os casos de borda', () => {
    expect(entries.filter(([key]) => !key.startsWith('/fixtures/'))).toHaveLength(45);
    expect(entries.length).toBeGreaterThanOrEqual(65);
  });

  for (const [key, expected] of entries) {
    it(key, () => {
      const result = parseMapFile(key, readFileSync(filePath(key)));
      expect(result.errors).toEqual(expected.errors);
      expect(result.ok).toBe(expected.ok);
      if (!result.ok) return;
      const { ok, errors, ...rest } = expected;
      const roomsExpected = rest.rooms?.map((room) => ({
        ...room,
        walls: room.walls.map(roundTrig),
        ground: room.ground.map(roundTrig),
      }));
      expect(mapJson(result.map)).toEqual({ ...rest, rooms: roomsExpected });
    });
  }
});
