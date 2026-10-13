// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { chatLines, screenLayout, type BarLabels, type FontMetrics } from './screen-layout.js';

/** Fonte padrão da Allegro: 8×8. */
const font8: FontMetrics = { height: 8, width: (t) => 8 * t.length };
const font16: FontMetrics = { height: 16, width: (t) => 8 * t.length };
const EN: BarLabels = { health: 'Health', energy: 'Energy', power: 'Power', turbo: 'Turbo', shadow: 'Shadow', weapon0: 'Weapon 0' };

describe('screenLayout (make_layout)', () => {
  it('640×480 com a fonte 8×8: o layout do original', () => {
    const l = screenLayout(640, 480, font8, EN);
    expect(l.mul).toBe(1);
    expect(l.playfield).toEqual({ x: 0, y: 91, w: 472, h: 354 });
    // à direita das mensagens não cabe (474 < 640): minimapa na altura da área de jogo
    expect(l.minimapPlace).toEqual({ x: 474, y: 91, w: 164, h: 100 });
    expect(l.scoreboard).toEqual({ x1: 472, y1: 191, x2: 639, y2: 479 });
    expect(l.indicatorsY).toBe(450);
    expect(l.healthX).toBe(10);
  });

  it('1024×768 com fonte de 16: escala 1,6', () => {
    const l = screenLayout(1024, 768, font16, EN);
    expect(l.mul).toBeCloseTo(1.6);
    expect(l.playfield).toEqual({ x: 0, y: 768 - 566 - 59, w: 756, h: 567 });
    expect(l.minimapPlace?.w).toBe(1024 - 756 - 4);
  });

  it('tela larga e baixa: encolhe para caber a barra e uma linha de mensagem', () => {
    const l = screenLayout(1920, 900, font16, EN);
    expect(l.mul).toBeCloseTo((900 - 59 - 16) / 354);
    expect(l.playfield.y).toBe(16);
    // sobra lugar à direita das mensagens: minimapa começa no alto
    expect(l.minimapPlace?.y).toBe(4);
  });

  it('sem minimapa e placar: área de jogo centralizada na largura toda', () => {
    const l = screenLayout(944, 900, font16, EN, false);
    expect(l.mul).toBe(2);
    expect(l.playfield.x).toBe(0);
    expect(l.minimapPlace).toBeNull();
  });

  it('relógio vai para a segunda linha quando não cabe', () => {
    const wide: FontMetrics = { height: 16, width: (t) => 12 * t.length };
    expect(screenLayout(640, 480, font16, EN).timeY).toBe(screenLayout(640, 480, font16, EN).indicatorsY);
    const l = screenLayout(640, 480, wide, EN);
    expect(l.timeY).toBe(l.indicatorsY + 18);
    expect(l.timeX).toBe(l.weaponX + 72);
  });

  it('linhas de chat acima das salas e com Insert', () => {
    const l = screenLayout(640, 480, font8, EN);
    expect(chatLines(l, 91, 8, false)).toBe(8);
    expect(chatLines(l, 91, 8, true)).toBe(40);
  });
});
