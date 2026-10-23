// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { MILESTONE_ICON_SYMBOLS, milestoneIconSpec, milestoneIconSvg, milestoneTier } from './milestone-icons.js';
import { MILESTONES } from './milestones.js';
import { SECRET_ICON_SYMBOLS, SECRET_MILESTONES } from './secret-milestones.js';

describe('ícones dos marcos (OG-395)', () => {
  it('todo marco tem símbolo (públicos aqui, secretos no módulo deles) e nenhum secreto vaza', () => {
    for (const m of MILESTONES) expect(MILESTONE_ICON_SYMBOLS[m.id], m.id).toBeTruthy();
    for (const m of SECRET_MILESTONES) expect(SECRET_ICON_SYMBOLS[m.id], m.id).toBeTruthy();
    expect(Object.keys(MILESTONE_ICON_SYMBOLS).some((id) => id.startsWith('secret_'))).toBe(false);
  });

  it('nível pela ordem do alvo: partidas 1/10/100/1000 vão de bronze a ouro; feito único sem nível', () => {
    expect(['first_match', 'matches_10', 'matches_100', 'matches_1000'].map(milestoneTier)).toEqual([0, 1, 1, 2]);
    expect([milestoneTier('kills_100'), milestoneTier('kills_10000'), milestoneTier('hat_trick')]).toEqual([0, 2, null]);
  });

  it('SVG 256×256; o bloqueado é cinza', () => {
    const svg = milestoneIconSvg(milestoneIconSpec('hat_trick', 'flag'));
    expect(svg).toContain('viewBox="0 0 256 256"');
    expect(svg).toContain('#e8c14a');
    expect(milestoneIconSvg(milestoneIconSpec('hat_trick', 'flag'), { locked: true })).not.toContain('#e8c14a');
  });
});
