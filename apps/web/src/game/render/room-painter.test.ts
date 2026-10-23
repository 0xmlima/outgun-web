// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { canvasAngle, FLAGMARK_FULL_UNTIL, roomTransform } from './room-painter.js';
import { resolveFills, themeColours } from './theme.js';

describe('drawRoomBackground: escala da sala no bitmap', () => {
  it('preenche o bitmap e corta o excesso igualmente dos dois lados', () => {
    const exact = roomTransform(756, 567);
    expect(exact.scale).toBeCloseTo((756 - 0.02) / 472, 10);
    // bitmap mais largo que 4:3: a escala segue a largura e sobra altura para cortar
    const wide = roomTransform(800, 567);
    expect(wide.scale).toBeCloseTo((800 - 0.02) / 472, 10);
    expect(wide.x0).toBeCloseTo(0.01, 10);
    expect(wide.y0).toBeLessThan(0);
    expect(wide.y0 * 2 + wide.scale * 354).toBeCloseTo(567, 10);
  });

  it('ângulos das paredes circulares: 0 = cima, sentido horário', () => {
    expect(canvasAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(canvasAngle(90)).toBeCloseTo(0);
    expect(canvasAngle(180)).toBeCloseTo(Math.PI / 2);
  });

  it('marca de bandeira opaca até 14,7% do raio (alfa 300/R por pixel, limitado a 256)', () => {
    expect(FLAGMARK_FULL_UNTIL).toBeCloseTo(0.1467, 4);
  });
});

describe('tema', () => {
  it('textura ausente usa a 0; sem a 0, a cor sólida', () => {
    const img = {} as CanvasImageSource;
    expect(resolveFills([img, null], '#104000')).toEqual([
      { kind: 'texture', image: img },
      { kind: 'texture', image: img },
    ]);
    expect(resolveFills([null, img], '#104000')).toEqual([
      { kind: 'solid', colour: '#104000' },
      { kind: 'texture', image: img },
    ]);
  });

  it('colours.txt do tema substitui só as cores que lista', () => {
    const colours = themeColours({ ground: '#104000', wall: '#30C000' }, { ground: '#CCCCFF' });
    expect(colours).toMatchObject({ ground: '#CCCCFF', wall: '#30C000' });
    // as cores novas (OG-411) entram por baixo, para os temas do original
    expect(colours.player17).toBe('#262626');
  });
});
