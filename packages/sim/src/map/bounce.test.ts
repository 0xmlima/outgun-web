// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import maps from '../../../content/src/map/__fixtures__/maps.json' with { type: 'json' };
import { NO_HIT, timeTillPlayerPlayerCollision, timeTillPlayerRocketCollision } from '../geometry/bounce.js';
import { Vec } from '../geometry/vec.js';
import fixture from './__fixtures__/bounces.json' with { type: 'json' };
import { Room } from './map.js';
import { CircWall, RectWall, TriWall } from './walls.js';

// Fixture do oráculo: tools/parity/fixtures/bounces.cpp (Room::genGetTimeTillWall e
// WorldBase::getTimeTillCollision do código original).
type WallJson = Record<string, unknown> & { type: string; tex: number; alpha: number };
type MapJson = { ok: boolean; height?: number; rooms?: { walls: WallJson[] }[] };
const allMaps = maps as unknown as Record<string, MapJson>;

const n = (v: unknown, i = 0) => (Array.isArray(v) ? (v[i] as number) : (v as number));
function buildRoom(mapKey: string, rx: number, ry: number): Room {
  const map = allMaps[mapKey] as MapJson;
  const room = new Room();
  for (const w of map.rooms![rx * map.height! + ry]!.walls) {
    if (w.type === 'rect') room.walls.push(new RectWall(n(w.a), n(w.b), n(w.c), n(w.d), w.tex, w.alpha));
    else if (w.type === 'tri') {
      const p = w.p as number[];
      room.walls.push(new TriWall(n(p, 0), n(p, 1), n(p, 2), n(p, 3), n(p, 4), n(p, 5), w.tex, w.alpha));
    } else {
      room.walls.push(new CircWall(n(w.c, 0), n(w.c, 1), n(w.ro), n(w.ri), n(w.angle, 0), n(w.angle, 1), w.tex, w.alpha));
    }
  }
  return room;
}

describe('tempo até a parede x original (Room::genGetTimeTillWall)', () => {
  const rows = fixture.wall as unknown as [string, number, number, ...number[]][];
  const rooms = new Map<string, Room>();

  it(`${rows.length} consultas com o mesmo impacto`, () => {
    const mismatches: string[] = [];
    let hits = 0;
    for (const row of rows) {
      const [mapKey, rx, ry, cx, cy, vx, vy, r, f, t, sx, sy] = row as [string, number, number, ...number[]];
      const key = `${mapKey}|${rx}|${ry}`;
      let room = rooms.get(key);
      if (!room) rooms.set(key, (room = buildRoom(mapKey, rx, ry)));
      const bd = room.timeTillWall(new Vec(cx!, cy!), new Vec(vx!, vy!), r!, f!);
      if (t! >= 1e10) {
        if (bd.time < 1e10) mismatches.push(`esperado sem impacto: ${JSON.stringify(row)} → ${bd.time}`);
        continue;
      }
      hits++;
      // sqrt/divisões idênticos em IEEE 754; tolerância só para reordenação do -ffast-math.
      const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
      if (!close(bd.time, t!) || !close(bd.contact.x, sx!) || !close(bd.contact.y, sy!)) {
        mismatches.push(`${JSON.stringify(row)} → [${bd.time}, ${bd.contact.x}, ${bd.contact.y}]`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(hits).toBeGreaterThan(2000);
  });
});

describe('tempo até colisão x original (WorldBase::getTimeTillCollision)', () => {
  const check = (rows: number[][], fn: typeof timeTillPlayerRocketCollision) => {
    const mismatches: string[] = [];
    for (const row of rows) {
      const [ax, ay, avx, avy, bx, by, bvx, bvy, r, t] = row as number[];
      const actual = fn(new Vec(ax!, ay!), new Vec(avx!, avy!), new Vec(bx!, by!), new Vec(bvx!, bvy!), r!);
      const same = t! >= 1e10 ? actual === NO_HIT : Math.abs(actual - t!) <= 1e-9 * Math.max(1, t!);
      if (!same) mismatches.push(`${JSON.stringify(row)} → ${actual}`);
    }
    return mismatches;
  };

  it('jogador × foguete', () => {
    expect(check(fixture.rocket, timeTillPlayerRocketCollision)).toEqual([]);
  });

  it('jogador × jogador', () => {
    expect(check(fixture.player, timeTillPlayerPlayerCollision)).toEqual([]);
  });
});
