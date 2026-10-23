// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { brandTeams } from '../hud/feed.js';
import { applyTeamColours, teamColourOverrides } from './team-palette.js';

describe('cor e nome do clã na tela (OG-409)', () => {
  it('tons do lado a partir da cor do clã', () => {
    const o = teamColourOverrides(0, '#1E9E3A');
    expect(o.team_red_basic).toBe('#1E9E3A');
    expect(o.team_red_dark).toBe('#0C3F17');
    expect(Object.keys(o).every((k) => k.includes('red'))).toBe(true);
  });
  it('aplica e devolve ao tema quando o lado deixa de ser o clã', () => {
    const base = { team_red_basic: '#FF0000', team_red_light: '#FF5544', team_blue_basic: '#0000FF' };
    const live: Record<string, string> = { ...base };
    expect(applyTeamColours(live, base, ['#1E9E3A', null])).toBe(true);
    expect(live.team_red_basic).toBe('#1E9E3A');
    expect(live.team_blue_basic).toBe('#0000FF');
    expect(applyTeamColours(live, base, ['#1E9E3A', null])).toBe(false);
    expect(applyTeamColours(live, base, [null, null])).toBe(true);
    expect(live).toMatchObject(base);
  });
  it('a palavra colorida do lado vira a tag; nomes e as outras cores ficam', () => {
    const tag = (team: 0 | 1) => (team === 0 ? 'DK' : null);
    expect(brandTeams('$1 DEVOLVEU A BANDEIRA $RVERMELHA$>!', tag)).toBe('$1 DEVOLVEU A BANDEIRA $RDK$>!');
    expect(brandTeams('$1 GOT THE $BBLUE FLAG$>!', tag)).toBe('$1 GOT THE $BBLUE FLAG$>!');
    expect(brandTeams('PLACAR: $RRED $1$> - $BBLUE $2$>', (t) => (t ? 'DT' : 'DK'))).toBe('PLACAR: $RDK $1$> - $BDT $2$>');
  });
});
