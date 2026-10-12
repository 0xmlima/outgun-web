// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import {
  framesToSeconds,
  iround,
  iroundBound,
  positiveFmod,
  positiveModulo,
  secondsToFrames,
  truncToInt,
} from './math.js';

describe('conversões com semântica do C++', () => {
  it('truncToInt trunca em direção a zero como static_cast<int>', () => {
    expect([2.9, -2.9, 0.5, -0.5].map(truncToInt)).toEqual([2, -2, 0, -0]);
  });

  it('iround arredonda metade para longe de zero', () => {
    expect([0.5, 1.49, 2.5, -0.5, -1.5, -1.49].map(iround)).toEqual([1, 1, 3, -1, -2, -1]);
  });

  it('iroundBound satura nos limites de int', () => {
    expect(iroundBound(1e12)).toBe(2147483647);
    expect(iroundBound(-1e12)).toBe(-2147483648);
    expect(iroundBound(3.6)).toBe(4);
  });
});

describe('módulos positivos (mundo toroidal)', () => {
  it('positiveModulo mantém o resultado em [0, m)', () => {
    expect([-7, -6, -1, 0, 5, 6, 13].map((v) => positiveModulo(v, 6))).toEqual([
      5, 0, 5, 0, 5, 0, 1,
    ]);
  });

  it('positiveFmod segue fmod(m + fmod(v, m), m)', () => {
    expect(positiveFmod(-1, 8)).toBe(7);
    expect(positiveFmod(8.5, 8)).toBe(0.5);
    expect(positiveFmod(-0.25, 8)).toBe(7.75);
  });

  it('rejeita módulo não positivo', () => {
    expect(() => positiveModulo(1, 0)).toThrow(RangeError);
    expect(() => positiveFmod(1, -2)).toThrow(RangeError);
  });
});

describe('tempo em frames', () => {
  it('converte como o original (×10 com iround)', () => {
    expect(secondsToFrames(2)).toBe(20);
    expect(secondsToFrames(0.25)).toBe(3);
    expect(secondsToFrames(1e10)).toBe(2147483647);
    expect(framesToSeconds(25)).toBe(2.5);
  });
});

describe('constantes de π', () => {
  it('são o double mais próximo dos literais do original', async () => {
    const { N_PI, N_PI_2, N_PI_4 } = await import('./constants.js');
    expect(N_PI).toBe(Math.PI);
    expect(N_PI_2).toBe(Math.PI / 2);
    expect(N_PI_4).toBe(Math.PI / 4);
  });
});
