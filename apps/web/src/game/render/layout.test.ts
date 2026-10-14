// SPDX-License-Identifier: GPL-2.0-or-later
import { parseMapFile } from '@outgun/content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mapWraps,
  roomLayout,
  roomOffsetsX,
  splitCompositeCoord,
  viewStartCoord,
  viewTopLeft,
  visibleRooms,
} from './layout.js';

const repo = join(import.meta.dirname, '../../../../..');
const loadMap = (dir: string, name: string) => {
  const result = parseMapFile(name, readFileSync(join(repo, '_legacy', dir, `${name}.txt`)));
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.map;
};

// Tela 1024x768 do original: playfield 756x567 (plan/specs/render-salas.md, vetores de teste).
const PLAYFIELD = { x: 0, y: 167, w: 756, h: 567 };
const at = (rx: number, ry: number, x = 0, y = 0) => ({ room: { x: rx, y: ry }, x, y });

describe('RoomLayoutManager::set', () => {
  it('1 sala ocupa a área toda', () => {
    const l = roomLayout(PLAYFIELD, 3, 3, 1);
    expect([l.roomW, l.roomH, l.x0, l.y0, l.width, l.height]).toEqual([756, 567, 0, 167, 756, 567]);
    expect(l.scale).toBeCloseTo(1.6017, 4);
  });

  it('3 salas: 252x189 cada', () => {
    const l = roomLayout(PLAYFIELD, 3, 3, 3);
    expect([l.roomW, l.roomH, l.visibleX, l.visibleY]).toEqual([252, 189, 3, 3]);
  });

  it('corrige a proporção encolhendo um lado e centraliza', () => {
    const l = roomLayout({ x: 0, y: 0, w: 1000, h: 500 }, 4, 4, 1);
    expect([l.roomW, l.roomH]).toEqual([667, 500]);
    expect(l.x0).toBe(Math.trunc((1000 - Math.trunc(667 * (1000 / 667))) / 2));
  });

  it('mapa menor que as salas pedidas: limita ao mapa sem repetição', () => {
    const l = roomLayout(PLAYFIELD, 2, 1, 4);
    expect(l.visibleX).toBe(2);
    expect(l.visibleY).toBe(1);
    expect([l.roomW, l.roomH]).toEqual([378, 284]);
    // sobra faixa vertical: área centralizada
    expect(l.y0).toBe(167 + Math.trunc((567 - 284) / 2));
  });
});

describe('salas visíveis e posições', () => {
  it('sem rolagem, cada sala numa posição inteira', () => {
    const l = roomLayout(PLAYFIELD, 3, 3, 3);
    const rooms = visibleRooms(l, at(0, 0));
    expect(rooms).toHaveLength(9);
    expect(rooms[4]).toEqual({ rx: 1, ry: 1, x: 252, y: 167 + 189 });
  });

  it('com deslocamento local desenha uma coluna/linha a mais e dá a volta no mapa', () => {
    const l = roomLayout(PLAYFIELD, 3, 3, 1);
    const rooms = visibleRooms(l, at(2, 2, 236, 0));
    expect(rooms.map((r) => [r.rx, r.ry])).toEqual([
      [2, 2],
      [0, 2],
    ]);
    expect(rooms[0]!.x).toBe(-Math.round(236 * l.scale));
  });

  it('room_offset_x repete a sala se o mapa cabe mais de uma vez', () => {
    const l = roomLayout(PLAYFIELD, 2, 2, 4, true, true);
    // 756 / 188 = 4,02 salas: a sala 0 aparece inteira duas vezes e uma fatia na borda direita
    expect(l.roomW).toBe(188);
    expect(roomOffsetsX(l, at(0, 0), 0)).toEqual([0, 376, 752]);
  });
});

describe('ponto de vista (getViewStartCoord)', () => {
  it('sem rolagem, a vista centraliza a sala do jogador', () => {
    expect(viewStartCoord(1, 300, 472, 3, false, 1, 'mapWraps', false)).toBe(1);
  });

  it('com rolagem, acompanha o jogador e para na borda de mapas fechados', () => {
    expect(viewStartCoord(1, 236, 472, 3, false, 2, 'mapWraps', true)).toBe(0.5);
    expect(viewStartCoord(0, 100, 472, 3, false, 2, 'mapWraps', true)).toBe(0);
    expect(viewStartCoord(2, 400, 472, 3, false, 2, 'mapWraps', true)).toBe(1);
  });

  it('mapa que dá a volta: a vista passa da borda', () => {
    expect(viewStartCoord(0, 100, 472, 3, true, 2, 'mapWraps', true)).toBeCloseTo(100 / 472 - 1);
  });

  it('mapa menor que a vista fica centralizado', () => {
    expect(viewStartCoord(0, 0, 472, 2, false, 4, 'mapWraps', false)).toBe(-1);
  });

  it('splitCompositeCoord e viewTopLeft', () => {
    expect(splitCompositeCoord(-0.5, 472, 3)).toEqual([2, 236]);
    const l = roomLayout(PLAYFIELD, 3, 3, 1);
    const view = { scroll: false, view: 'mapWraps', repeatX: false, repeatY: false, wrapsX: false, wrapsY: false } as const;
    expect(viewTopLeft(l, at(2, 1, 50, 60), view)).toEqual(at(2, 1, 0, 0));
  });
});

describe('mapa que dá a volta (guiclient.cpp:2924)', () => {
  it('detecta passagens na borda externa por eixo', () => {
    expect(mapWraps(loadMap('maps', 'coliseu'))).toEqual({ x: false, y: false });
    expect(mapWraps(loadMap('maps', 'outgun1'))).toEqual({ x: true, y: false });
    expect(mapWraps(loadMap('cmaps', 'redxblue'))).toEqual({ x: false, y: true });
  });
});
