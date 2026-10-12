// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import {
  blink30,
  carrierCircleAlpha,
  deathbringerBrightness,
  explosionColour,
  flagFlash,
  gunAngle,
  healthVariation,
  hitColour,
  powerBlink,
  rgb,
  shadowItemAlpha,
  smoke,
} from './entity-frame.js';
import { overlayColour } from './sprites.js';

describe('regras de desenho do original (plan/specs/render-entidades.md)', () => {
  it('cor de acerto: player_hit + int(Δ·600), limitada a 255', () => {
    expect(hitColour('#464646', 0.4, 0.3)).toBe('#828282'); // Δ 0,1 → +60
    expect(hitColour('#464646', 0.3, 0)).toBe('#fafafa'); // Δ 0,3 → +180
    expect(hitColour('#464646', 1, 0)).toBe('#ffffff');
    expect(hitColour('#464646', 0.3, 0.3)).toBeNull();
  });

  it('pisca do power (décimos ímpares) e alternância de 1/30 s', () => {
    expect([0.05, 0.15, 0.25].map(powerBlink)).toEqual([false, true, false]);
    expect([0.01, 0.04, 0.07].map(blink30)).toEqual([false, true, false]);
  });

  it('bandeira devolvida pisca só nos 2 s seguintes, um terço do tempo', () => {
    expect(flagFlash(10.01, 10)).toBe(true);
    expect(flagFlash(10.1, 10)).toBe(false);
    expect(flagFlash(12.01, 10)).toBe(false);
  });

  it('item shadow varia entre 55 e 255; megahealth entre 0 e 5', () => {
    expect(shadowItemAlpha(0)).toBe(55);
    expect(shadowItemAlpha(200 / 600)).toBe(255);
    expect(shadowItemAlpha(300 / 600)).toBe(155);
    expect([0, 0.2, 0.4, 0.6].map(healthVariation)).toEqual([0, 3, 4, 1]);
  });

  it('fumaça do deathbringer: alfa e raio', () => {
    expect(smoke(0.3, 1)).toEqual({ alpha: 60, radius: 3 + 9 * 0.3, rise: 96 - (3 + 9 * 0.3) * 8 });
    expect(smoke(0.6, 1).alpha).toBe(0);
  });

  it('anel do deathbringer: sobe de 14 nos primeiros 30 px e desce depois', () => {
    expect(deathbringerBrightness(0, 1)).toBe(14);
    expect(deathbringerBrightness(29, 1)).toBe(14 + 8 * 29);
    expect(deathbringerBrightness(30, 1)).toBe(255);
    expect(deathbringerBrightness(40, 1)).toBe(255 - 140);
  });

  it('anel do portador: alfa 230 no centro até 0 na borda', () => {
    expect(carrierCircleAlpha(0, 60)).toBe(230);
    expect(carrierCircleAlpha(15, 60)).toBe(115);
    expect(carrierCircleAlpha(40, 60)).toBe(0);
  });

  it('direção da arma: oitavos no sentido horário a partir da direita', () => {
    expect(gunAngle(0)).toBe(0);
    expect(gunAngle(2)).toBeCloseTo(Math.PI / 2);
  });

  it('cor da explosão fica entre metade da cor do time e o branco', () => {
    expect(rgb(explosionColour('#FF0000', () => 0))).toEqual([127, 0, 0]);
    expect(rgb(explosionColour('#FF0000', () => 0.9999))).toEqual([255, 255, 255]);
  });
});

describe('sprites do tema (combine_sprite)', () => {
  it('mistura a cor pelo alfa do mapa com o blender da Allegro', () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    const alpha = new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 255]);
    overlayColour(px, alpha, '#FF0000');
    expect([...px.slice(0, 3)]).toEqual([100, 100, 100]); // alfa 0: intacto
    expect([...px.slice(4, 7)]).toEqual([(255 * 128 + 100 * 128) >> 8, (0 + 100 * 128) >> 8, (0 + 100 * 128) >> 8]);
  });
});
