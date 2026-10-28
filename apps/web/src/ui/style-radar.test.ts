// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { axisAngle, axisLeads, axisValueText, radarPoint, radarPolygon, STYLE_AXES } from './style-radar.js';

describe('geometria do radar de estilo (OG-470)', () => {
  it('ordem fixa: Abates no alto, duelo à direita, Bandeira embaixo, time à esquerda', () => {
    expect(STYLE_AXES).toEqual(['kills', 'accuracy', 'survival', 'flag', 'defense', 'team']);
    expect(STYLE_AXES.map((_, i) => axisAngle(i))).toEqual([-90, -30, 30, 90, 150, 210]);
  });

  it('o ponto do eixo i com valor v cai no raio v% e no ângulo do eixo', () => {
    const near = (p: { x: number; y: number }, x: number, y: number) => {
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
    };
    near(radarPoint(0, 100, 100, 0, 0), 0, -100);
    near(radarPoint(3, 50, 100, 10, 10), 10, 60);
    near(radarPoint(1, 100, 100, 0, 0), 100 * Math.cos(-Math.PI / 6), -50);
    near(radarPoint(4, 0, 100, 5, 5), 5, 5);
    for (let i = 0; i < 6; i++) {
      const p = radarPoint(i, 40, 200, 0, 0);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(80, 6);
      expect((Math.atan2(p.y, p.x) * 180) / Math.PI).toBeCloseTo(((axisAngle(i) + 540) % 360) - 180, 6);
    }
    near(radarPoint(0, 150, 100, 0, 0), 0, -100); // limitado a 100
  });

  it('polígono na ordem fixa, com eixo ausente no centro', () => {
    const pts = radarPolygon([{ axis: 'flag', percentile: 100, value: 0 }], 10, 0, 0).split(' ');
    expect(pts).toHaveLength(6);
    expect(pts[3]).toBe('0.00,10.00');
    expect(pts[0]).toBe('0.00,0.00');
  });

  it('valor bruto na unidade do eixo', () => {
    expect(axisValueText('accuracy', 0.274)).toBe('27%');
    expect(axisValueText('survival', 95)).toBe('1min 35s');
    expect(axisValueText('survival', 42)).toBe('42s');
    expect(axisValueText('kills', 6.27)).toBe('6,3 / 10 min');
  });

  it('eixos que cada lado leva na comparação (OG-472), sem contar empates', () => {
    const v = (p: number[]) => STYLE_AXES.map((axis, i) => ({ axis, percentile: p[i]!, value: 0 }));
    expect(axisLeads(v([90, 10, 50, 50, 70, 20]), v([10, 90, 50, 40, 60, 30]))).toEqual({ a: 3, b: 2 });
  });
});
