// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { adjustGunDirection, clearModifiersIfIdle, CONTROL, controlDirection, gunDirectionFromControls, gunDirectionTo8way } from './controls.js';

const { up, down, left, right, run, strafe } = CONTROL;

describe('controles (ClientControls)', () => {
  it('direção das 8 combinações e casos sem direção, como getDirection', () => {
    expect(controlDirection(right)).toBe(0);
    expect(controlDirection(right | down)).toBe(1);
    expect(controlDirection(down)).toBe(2);
    expect(controlDirection(left | down)).toBe(3);
    expect(controlDirection(left)).toBe(4);
    expect(controlDirection(left | up)).toBe(5);
    expect(controlDirection(up)).toBe(6);
    expect(controlDirection(right | up)).toBe(7);
    expect(controlDirection(0)).toBe(-1);
    expect(controlDirection(left | right)).toBe(-1);
    expect(controlDirection(up | down | right)).toBe(0);
  });

  it('correr e strafe são descartados sem direção', () => {
    expect(clearModifiersIfIdle(run | strafe)).toBe(0);
    expect(clearModifiersIfIdle(up | down | run)).toBe(up | down); // só correr e strafe são removidos
    expect(clearModifiersIfIdle(right | run)).toBe(right | run);
  });

  it('direção da arma (GunDirection)', () => {
    expect(gunDirectionFromControls(3, 0)).toBe(3);
    expect(gunDirectionFromControls(3, up)).toBe(6);
    expect(adjustGunDirection(7, 2)).toBe(1);
    expect(adjustGunDirection(0, -1)).toBe(7);
    expect(gunDirectionTo8way(7.6)).toBe(0);
  });
});
