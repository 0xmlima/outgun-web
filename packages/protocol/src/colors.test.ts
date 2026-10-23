// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { CLAN_COLORS, clanColoursProblem, colourDistance, DEFAULT_TEAM_COLOURS } from './colors.js';

describe('cores do clã (OG-407)', () => {
  it('CIEDE2000: igual é 0, valores de referência', () => {
    expect(colourDistance('#FF0000', '#FF0000')).toBe(0);
    // o mesmo valor do cálculo da paleta (CIEDE2000 em Python)
    expect(colourDistance('#7A2BC0', '#2050E0')).toBeCloseTo(14.8, 0);
  });
  it('par do clã: da paleta e bem diferentes entre si', () => {
    expect(clanColoursProblem(CLAN_COLORS.red!, CLAN_COLORS.white!)).toBeNull();
    expect(clanColoursProblem(CLAN_COLORS.blue!, CLAN_COLORS.purple!)).toBe('too_similar');
    expect(clanColoursProblem('#123456', CLAN_COLORS.white!)).toBe('unknown_color');
  });
  it('vermelho e azul do clã colidem com o lado padrão do mesmo tom', () => {
    expect(colourDistance(CLAN_COLORS.red!, DEFAULT_TEAM_COLOURS[0])).toBeLessThan(22);
    expect(colourDistance(CLAN_COLORS.navy!, DEFAULT_TEAM_COLOURS[1])).toBeLessThan(22);
    expect(colourDistance(CLAN_COLORS.green!, DEFAULT_TEAM_COLOURS[1])).toBeGreaterThan(22);
  });
});
