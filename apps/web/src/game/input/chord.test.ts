// SPDX-License-Identifier: GPL-2.0-or-later
import { CONTROL } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { ChordFilter } from './chord.js';

const { up, down, right, left, strafe } = CONTROL;

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
  describe('Alt com diagonal (OG-462)', () => {
    it('diagonal e Alt dentro da janela: anda na diagonal e a arma fica (o Alt chegou junto)', () => {
      const f = new ChordFilter(30);
      f.filter(up, 0);
      f.filter(up, 40); // arma para cima
      expect(f.filter(down, 1000)).toBe(down | strafe);
      expect(f.filter(down | right, 1010)).toBe(down | right | strafe);
      expect(f.filter(down | right | strafe, 1020)).toBe(down | right | strafe);
      expect(f.filter(up, 2000)).toBe(up); // a arma não virou: ↑ já era a direção dela
    });

    it('com 1 ms de tolerância, a diagonal 10 ms antes do Alt já vira a arma', () => {
      const f = new ChordFilter(1);
      f.filter(down, 1000);
      expect(f.filter(down | right, 1010)).toBe(down | right);
      expect(f.filter(down | right | strafe, 1020)).toBe(down | right | strafe);
      expect(f.filter(up | right, 2000)).toBe(up | right | strafe); // a arma está na diagonal ↓→
    });

    it('Alt primeiro: troca de diagonal segurando o Alt não vira a arma nem abre janela', () => {
      const f = new ChordFilter(30);
      expect(f.filter(up | right | strafe, 0)).toBe(up | right | strafe);
      expect(f.filter(down | left | strafe, 15)).toBe(down | left | strafe);
      expect(f.deadline()).toBeNull();
    });

    it('Alt solto entre as setas: a diagonal que sobra vira a arma no fim da janela', () => {
      const f = new ChordFilter(30);
      f.filter(up | right | strafe, 0);
      expect(f.filter(up | right, 100)).toBe(up | right | strafe); // soltou o Alt: janela
      expect(f.filter(up, 110)).toBe(up | strafe); // soltou o → 10 ms depois
      expect(f.filter(up, 130)).toBe(up); // fim da janela: arma para cima
    });
  });
});
