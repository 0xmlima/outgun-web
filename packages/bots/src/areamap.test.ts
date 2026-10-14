// SPDX-License-Identifier: GPL-2.0-or-later
// Compara o AreaMap e as tabelas de distância com o original. Referência gerada pela fixture
// tools/parity/fixtures/areamap.cpp (ver o cabeçalho dela para regenerar).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseMapFile } from '@outgun/content';
import { describe, expect, it } from 'vitest';
import { AreaMap, type AreaMapLevel } from './areamap.js';
import { buildDistanceTable, DistanceTables, DistanceTableId } from './distance.js';
import { acquireAreaMap, cachedAreaMaps, releaseAreaMap } from './shared.js';

type Tree = number | ['x' | 'y', number, Tree, Tree];

interface Expected {
  width: number;
  height: number;
  areas: {
    room: [number, number];
    rf: [number, number];
    rv: [number, number];
    n: { dir: number; area: number; doors: [number, number][] }[];
    rn: number[];
  }[];
  rooms: Tree[];
  samples?: [number, number, number, number, number][];
  distances?: { start: number; weight: number; team: 0 | 1; d: number[] }[];
}

const repoRoot = join(import.meta.dirname, '../../..');
const expected = JSON.parse(
  gunzipSync(readFileSync(join(import.meta.dirname, '__fixtures__/areamap.json.gz'))).toString('utf8'),
) as Record<string, Expected>;

function loadMap(name: string): AreaMap {
  const path = name.startsWith('/fixtures/') ? join(repoRoot, 'tools/parity/fixtures', name.slice(10)) : join(repoRoot, '_legacy', name);
  const result = parseMapFile(name, readFileSync(path));
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return new AreaMap(result.map);
}

/** O original roda com -ffast-math: somas de respawn podem diferir na última casa (1 ulp). */
const approx = (values: readonly number[]): number[] => values.map((v) => Number(v.toPrecision(12)));

function tree(level: AreaMapLevel): Tree {
  return level.kind === 'area' ? level.area.index : [level.kind, level.border, tree(level.before), tree(level.after)];
}

const detailed = Object.entries(expected).filter(([, e]) => e.distances);

describe('AreaMap (bot_support.cpp)', () => {
  it('cobre os mapas distribuídos e um mapa sintético com salas divididas', () => {
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(46);
    expect(detailed.map(([name]) => name)).toEqual([
      'maps/outgun1.txt',
      'cmaps/ksii.txt',
      '/fixtures/areamap-maps/split-rooms.txt',
    ]);
  });

  it.each(Object.entries(expected))('%s: áreas, portas, respawn e árvore das salas iguais ao original', (name, exp) => {
    const am = loadMap(name);
    const areas = am.areas.map((a) => ({
      room: [a.room.x, a.room.y],
      rf: approx(a.respawnFrequency),
      rv: approx(a.respawnValue),
      n: a.neighbors.map((n) => ({ dir: n.direction, area: n.area.index, doors: n.doors.map((d) => [...d]) })),
      rn: a.reverseNeighbors.map((r) => r.index),
    }));
    expect(areas).toEqual(exp.areas.map((a) => ({ ...a, rf: approx(a.rf), rv: approx(a.rv) })));
    const rooms: Tree[] = [];
    for (let x = 0; x < exp.width; ++x) for (let y = 0; y < exp.height; ++y) rooms.push(tree(am.rooms[x]![y]!));
    expect(rooms).toEqual(exp.rooms);
  });

  it.each(detailed)('%s: identifyArea devolve a mesma área do original', (name, exp) => {
    const am = loadMap(name);
    const got = exp.samples!.map(([rx, ry, x, y]) => [rx, ry, x, y, am.identifyArea({ room: { x: rx, y: ry }, x, y }).index]);
    expect(got).toEqual(exp.samples);
  });

  it.each(detailed)('%s: tabelas de distância iguais ao original (peso de respawn 0 e 1, os dois times)', (name, exp) => {
    const am = loadMap(name);
    const distance = new Int32Array(am.areas.length);
    for (const t of exp.distances!) {
      buildDistanceTable(distance, am.areas[t.start]!, t.weight, t.team);
      expect([...distance], `início ${t.start}, peso ${t.weight}, time ${t.team}`).toEqual(t.d);
    }
  });

  it('identifyArea de sala inválida devolve a primeira área', () => {
    const am = loadMap('maps/outgun1.txt');
    expect(am.identifyArea({ room: { x: -1, y: 0 }, x: 10, y: 10 })).toBe(am.areas[0]);
    expect(am.identifyArea({ room: { x: 0, y: 99 }, x: 10, y: 10 })).toBe(am.areas[0]);
  });
});

describe('DistanceTables', () => {
  it('só recalcula quando o centro ou o peso mudam', () => {
    const am = loadMap('cmaps/ksii.txt');
    const tables = new DistanceTables(am);
    const start = am.areas[3]!;
    tables.build(DistanceTableId.Main, start, 1, 0);
    expect(tables.distance(DistanceTableId.Main, start)).toBe(0);
    expect(tables.distance(DistanceTableId.Def, start)).toBe(-1);
    const other = am.areas[5]!;
    const before = tables.distance(DistanceTableId.Main, other);
    tables.build(DistanceTableId.Main, start, 1, 1); // mesmo centro e peso: mantém (como o original)
    expect(tables.distance(DistanceTableId.Main, other)).toBe(before);
    tables.build(DistanceTableId.Main, other, 1, 0);
    expect(tables.distance(DistanceTableId.Main, other)).toBe(0);
  });
});

describe('cache compartilhado', () => {
  it('reaproveita o AreaMap do mesmo mapa e libera com o último usuário', () => {
    const map = parseMapFile('outgun1', readFileSync(join(repoRoot, '_legacy/maps/outgun1.txt')));
    if (!map.ok) throw new Error('mapa');
    const a = acquireAreaMap(map.map);
    const b = acquireAreaMap(map.map);
    expect(b).toBe(a);
    expect(cachedAreaMaps()).toBe(1);
    releaseAreaMap(a);
    expect(cachedAreaMaps()).toBe(1);
    releaseAreaMap(b);
    expect(cachedAreaMaps()).toBe(0);
    expect(() => releaseAreaMap(a)).toThrow();
  });
});
