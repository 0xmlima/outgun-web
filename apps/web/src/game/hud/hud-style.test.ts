// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import type { Rect } from '../render/layout.js';
import { DEFAULT_HUD_CUSTOM, HUD_COMPONENTS, parseHudCustom } from './hud-style.js';
import { customArrangement, customFromPlaces, modernArrangement, outsideRoom, startingPlaces, toAnchor } from './modern-layout.js';
import { autoHudScale, chatLines, screenLayout, type BarLabels, type FontMetrics } from './screen-layout.js';

const font16: FontMetrics = { height: 16, width: (t) => 8 * t.length };
const EN: BarLabels = { health: 'Health', energy: 'Energy', power: 'Power', turbo: 'Turbo', shadow: 'Shadow', weapon0: 'Weapon 0' };
const SCREENS = [
  [1920, 1080],
  [1680, 1050],
  [1280, 720],
  [1024, 768],
  [2560, 1440],
  [1366, 768],
] as const;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (a: Rect, W: number, H: number) => a.x >= 0 && a.y >= 0 && a.x + a.w <= W && a.y + a.h <= H;

describe('estilo Clássico (RN-UI-05)', () => {
  it('é o layout de antes, sem componentes', () => {
    for (const [W, H] of SCREENS) {
      const before = screenLayout(W, H, font16, EN);
      expect(screenLayout(W, H, font16, EN, true, autoHudScale(W, H), 'classic')).toEqual(before);
      expect(before.style).toBe('classic');
      expect(before.hud).toBeNull();
    }
  });
});

describe('HUD Moderno (D-55, opção A)', () => {
  for (const [W, H] of SCREENS)
    it(`${W}×${H}: sala na proporção, nada sobre ela, tudo dentro da tela`, () => {
      const u = autoHudScale(W, H);
      const { room, places } = modernArrangement(W, H, u);
      expect(room.x).toBe(0);
      expect(room.y).toBe(0);
      expect(Math.abs(room.w * 0.75 - room.h)).toBeLessThanOrEqual(1);
      for (const id of HUD_COMPONENTS) {
        const p = places[id];
        expect(p, id).toBeDefined();
        expect(overlaps(p!, room), id).toBe(false);
        expect(inside(p!, W, H), id).toBe(true);
      }
      // a coluna não se sobrepõe a si mesma
      const list = HUD_COMPONENTS.map((id) => places[id]!);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i]!, list[j]!), `${HUD_COMPONENTS[i]} × ${HUD_COMPONENTS[j]}`).toBe(false);
    });

  it('1920×1080: sala com a altura toda (1440×1080) e coluna de 480', () => {
    const { room, places } = modernArrangement(1920, 1080, 1.5);
    expect(room).toEqual({ x: 0, y: 0, w: 1440, h: 1080 });
    expect(places.score!.x).toBe(1455);
    expect(places.chat!.x).toBe(1455);
  });

  it('4:3: o chat vai para a faixa embaixo da sala', () => {
    const { room, places } = modernArrangement(1024, 768, 1);
    expect(places.chat!.y).toBeGreaterThanOrEqual(room.h);
    expect(places.chat!.x).toBeLessThan(room.w);
  });

  it('F12 tira só o minimapa', () => {
    const l = screenLayout(1920, 1080, font16, EN, false, 1.5, 'modern');
    expect(l.minimapPlace).toBeNull();
    expect(l.hud!.score).toBeDefined();
    expect(l.scoreboard).toBeNull();
  });

  it('screenLayout aponta chat, minimapa e área de jogo para os componentes', () => {
    const l = screenLayout(1920, 1080, font16, EN, true, 1.5, 'modern');
    expect(l.mode).toBe('componentes');
    expect(l.playfield).toEqual({ x: 0, y: 0, w: 1440, h: 1080 });
    expect(l.minimapPlace).toEqual(l.hud!.minimap);
    expect(l.chat).toEqual({ x: l.hud!.chat!.x, y: l.hud!.chat!.y, w: l.hud!.chat!.w, h: l.hud!.chat!.h });
    expect(chatLines(l, false)).toBeGreaterThan(5);
    expect(chatLines(l, true)).toBe(chatLines(l, false));
  });
});

describe('HUD Personalizado (D-55, OG-300)', () => {
  it('sem layout salvo, com a sala à esquerda, é o Moderno', () => {
    for (const [W, H] of SCREENS) expect(customArrangement(W, H, autoHudScale(W, H), DEFAULT_HUD_CUSTOM)).toEqual(modernArrangement(W, H, autoHudScale(W, H)));
  });

  it('salvar e reabrir na mesma tela devolve os mesmos lugares', () => {
    const places = startingPlaces(1920, 1080, 1.5, 'left');
    const saved = customFromPlaces(1920, 1080, 'left', places);
    const again = customArrangement(1920, 1080, 1.5, saved).places;
    for (const id of HUD_COMPONENTS) {
      expect(Math.abs(again[id]!.x - places[id]!.x), id).toBeLessThanOrEqual(1);
      expect(Math.abs(again[id]!.y - places[id]!.y), id).toBeLessThanOrEqual(1);
      expect(Math.abs(again[id]!.w - places[id]!.w), id).toBeLessThanOrEqual(1);
    }
  });

  it('nunca deixa componente sobre a sala, em nenhuma tela', () => {
    for (const room of ['left', 'centre'] as const) {
      const saved = customFromPlaces(1920, 1080, room, startingPlaces(1920, 1080, 1.5, room));
      for (const [W, H] of SCREENS) {
        const a = customArrangement(W, H, autoHudScale(W, H), saved);
        for (const id of HUD_COMPONENTS) {
          const p = a.places[id];
          if (!p) continue;
          expect(overlaps(p, a.room), `${room} ${W}×${H} ${id}`).toBe(false);
          expect(inside(p, W, H), `${room} ${W}×${H} ${id}`).toBe(true);
        }
      }
    }
  });

  it('um componente nunca fica sobre outro, mesmo em outra resolução', () => {
    for (const room of ['left', 'centre'] as const) {
      const saved = customFromPlaces(1920, 1080, room, startingPlaces(1920, 1080, 1.5, room));
      for (const [W, H] of SCREENS) {
        const list = Object.entries(customArrangement(W, H, autoHudScale(W, H), saved).places);
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i]![1], list[j]![1]), `${room} ${W}×${H} ${list[i]![0]} × ${list[j]![0]}`).toBe(false);
      }
    }
  });

  it('componente salvo no meio da sala é empurrado para fora', () => {
    const base = customFromPlaces(1920, 1080, 'left', startingPlaces(1920, 1080, 1.5, 'left'));
    const comps = { ...base.comps!, score: { ...base.comps!.score, anchor: 4, dx: 0, dy: 0 } };
    const a = customArrangement(1920, 1080, 1.5, { room: 'left', comps });
    expect(a.places.score).toBeDefined();
    expect(overlaps(a.places.score!, a.room)).toBe(false);
  });

  it('esconder tira o componente', () => {
    const base = customFromPlaces(1920, 1080, 'left', startingPlaces(1920, 1080, 1.5, 'left'), new Set(['fps']));
    expect(customArrangement(1920, 1080, 1.5, base).places.fps).toBeUndefined();
  });

  it('âncoras: canto, centro e lado direito', () => {
    expect(toAnchor({ x: 10, y: 20, w: 100, h: 50 }, 1920, 1080)).toEqual({ anchor: 0, dx: 10 / 1080, dy: 20 / 1080 });
    expect(toAnchor({ x: 910, y: 515, w: 100, h: 50 }, 1920, 1080).anchor).toBe(4);
    expect(toAnchor({ x: 1800, y: 1000, w: 100, h: 50 }, 1920, 1080)).toEqual({ anchor: 8, dx: 20 / 1080, dy: 30 / 1080 });
  });

  it('outsideRoom escolhe o menor deslocamento e devolve null se não couber', () => {
    const room = { x: 240, y: 0, w: 1440, h: 1080 };
    expect(outsideRoom({ x: 250, y: 100, w: 200, h: 50 }, room, 1920, 1080)).toEqual({ x: 40, y: 100, w: 200, h: 50 });
    expect(outsideRoom({ x: 250, y: 100, w: 300, h: 50 }, room, 1920, 1080)).toBeNull();
  });

  it('parseHudCustom: valores errados voltam ao Moderno', () => {
    const good = customFromPlaces(1920, 1080, 'centre', startingPlaces(1920, 1080, 1.5, 'centre'));
    expect(parseHudCustom(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseHudCustom(null)).toEqual(DEFAULT_HUD_CUSTOM);
    expect(parseHudCustom({ room: 'centre' })).toEqual({ room: 'centre', comps: null });
    const bad = JSON.parse(JSON.stringify(good)) as { comps: Record<string, Record<string, unknown>> };
    bad.comps.chat!.anchor = 9;
    expect(parseHudCustom(bad).comps).toBeNull();
    const missing = JSON.parse(JSON.stringify(good)) as { comps: Record<string, unknown> };
    delete missing.comps.fps;
    expect(parseHudCustom(missing).comps).toBeNull();
  });
});
