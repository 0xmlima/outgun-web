// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import queries from './__fixtures__/wall-intersections.json' with { type: 'json' };
import maps from '../../../content/src/map/__fixtures__/maps.json' with { type: 'json' };
import { Vec } from '../geometry/vec.js';
import { CircWall, RectWall, TriWall, type Wall } from './walls.js';

// Fixtures gerados pelo oráculo (tools/parity/fixtures/maps.cpp e walls.cpp): paredes construídas
// pelo parser original e consultas de interseção respondidas pelo código original.
type WallJson =
  | { type: 'rect'; tex: number; alpha: number; a: number; b: number; c: number; d: number }
  | { type: 'tri'; tex: number; alpha: number; p: number[]; bound: number[] }
  | {
      type: 'circ';
      tex: number;
      alpha: number;
      c: number[];
      ro: number;
      ri: number;
      angle: number[];
      va1: number[];
      va2: number[];
      midvec: number[];
      anglecos: number;
    };

interface MapJson {
  ok: boolean;
  height?: number;
  rooms?: { walls: WallJson[] }[];
}

const allMaps = maps as unknown as Record<string, MapJson>;

/** Reconstrói a parede a partir dos valores finais do original (já ordenados/normalizados). */
function build(w: WallJson): Wall {
  const n = (v: number | undefined) => v as number;
  if (w.type === 'rect') return new RectWall(w.a, w.b, w.c, w.d, w.tex, w.alpha);
  if (w.type === 'tri') {
    return new TriWall(n(w.p[0]), n(w.p[1]), n(w.p[2]), n(w.p[3]), n(w.p[4]), n(w.p[5]), w.tex, w.alpha);
  }
  return new CircWall(n(w.c[0]), n(w.c[1]), w.ro, w.ri, n(w.angle[0]), n(w.angle[1]), w.tex, w.alpha);
}

function wallAt(mapKey: string, rx: number, ry: number, index: number): WallJson {
  const map = allMaps[mapKey] as MapJson;
  return (map.rooms as { walls: WallJson[] }[])[rx * (map.height as number) + ry]!.walls[index]!;
}

describe('construção das paredes x original', () => {
  it('triângulos e círculos derivam os mesmos campos', () => {
    let checked = 0;
    for (const map of Object.values(allMaps)) {
      for (const room of map.rooms ?? []) {
        for (const json of room.walls) {
          const wall = build(json);
          if (json.type === 'tri' && wall instanceof TriWall) {
            expect([wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y, wall.p3.x, wall.p3.y]).toEqual(json.p);
            expect([wall.boundX1, wall.boundY1, wall.boundX2, wall.boundY2]).toEqual(json.bound);
            checked++;
          }
          if (json.type === 'circ' && wall instanceof CircWall) {
            // sin/cos do V8 e da glibc podem diferir no último bit: tolerância de 1e-15.
            for (const [actual, expected] of [
              [wall.va1, json.va1],
              [wall.va2, json.va2],
              [wall.midvec, json.midvec],
            ] as const) {
              expect(actual.x).toBeCloseTo(expected[0] as number, 15);
              expect(actual.y).toBeCloseTo(expected[1] as number, 15);
            }
            expect(wall.anglecos).toBeCloseTo(json.anglecos, 15);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('interseções x original', () => {
  const rows = queries as (string | number)[][];

  it(`${rows.length} consultas com o mesmo resultado`, () => {
    const mismatches: string[] = [];
    for (const row of rows) {
      const [mapKey, rx, ry, index, kind, ...rest] = row as [string, number, number, number, number, ...number[]];
      const wall = build(wallAt(mapKey, rx, ry, index));
      const expected = rest[rest.length - 1] === 1;
      const actual =
        kind === 0
          ? wall.intersectsCirc(new Vec(rest[0] as number, rest[1] as number), rest[2] as number)
          : wall.intersectsRect(rest[0] as number, rest[1] as number, rest[2] as number, rest[3] as number);
      if (actual !== expected) mismatches.push(`${wall.kind} ${JSON.stringify(row)}`);
    }
    expect(mismatches).toEqual([]);
  });
});
