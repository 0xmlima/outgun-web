// SPDX-License-Identifier: GPL-2.0-or-later
import { CONTROL } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { ChordFilter } from './chord.js';

const { up, right, left, strafe } = CONTROL;

describe('tolerância de diagonal (OG-372)', () => {
  it('soltar ↑→ com 25 ms de diferença mantém a arma na diagonal', () => {
    const f = new ChordFilter(30);
    f.filter(up, 0);
    expect(f.filter(up | right, 10)).toBe(up | right | strafe); // ainda na janela da primeira tecla
    expect(f.filter(up | right, 40)).toBe(up | right); // a arma vira para a diagonal
    expect(f.filter(up, 500)).toBe(up | strafe); // soltou o → primeiro: anda para cima sem virar
    expect(f.filter(0, 525)).toBe(0); // soltou o ↑ 25 ms depois
    expect(f.deadline()).toBeNull();
  });

  it('seta 15 ms antes do Alt: a arma não vira', () => {
    const f = new ChordFilter(30);
    f.filter(up, 0);
    f.filter(up, 40); // arma para cima
    expect(f.filter(left, 1000)).toBe(left | strafe);
    expect(f.filter(left | strafe, 1015)).toBe(left | strafe);
    expect(f.deadline()).toBeNull();
  });

  it('seta sozinha vira a arma no fim da janela; com 0 ms, na hora', () => {
    const f = new ChordFilter(30);
    expect(f.filter(right, 0)).toBe(right | strafe);
    expect(f.deadline()).toBe(30);
    expect(f.filter(right, 30)).toBe(right);
    expect(f.filter(right, 31)).toBe(right);
    const now = new ChordFilter(0);
    expect(now.filter(right, 0)).toBe(right);
  });

  it('tiro na janela vira a arma antes', () => {
    const f = new ChordFilter(30);
    expect(f.filter(left, 0)).toBe(left | strafe);
    expect(f.flush(left)).toBe(left);
    expect(f.filter(left, 5)).toBe(left);
  });
});
