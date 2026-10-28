// SPDX-License-Identifier: GPL-2.0-or-later
import { CLAN_COLORS } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { sideClan, teamIdentities, type ClanOfPlayer, type SidePlayer } from './team-identity.js';

const clan = (id: string, primary: string, secondary: string): ClanOfPlayer => ({ id, tag: id, name: `Clã ${id}`, primary, secondary });
const DK = clan('DK', CLAN_COLORS.green!, CLAN_COLORS.white!);
const DT = clan('DT', CLAN_COLORS.orange!, CLAN_COLORS.black!);
const human = (team: number, c: ClanOfPlayer | null = null): SidePlayer => ({ team, bot: false, clan: c });
const bot = (team: number, c: ClanOfPlayer | null = null): SidePlayer => ({ team, bot: true, clan: c });

describe('identidade do clã na partida (OG-408, D-78)', () => {
  it('exemplo do PO: 2 do DK + 1 sem clã contra 2 do DT + 1 bot → DK x DT', () => {
    const [red, blue] = teamIdentities([human(0, DK), human(0, DK), human(0), human(1, DT), human(1, DT), bot(1)]);
    expect(red).toEqual({ clanId: 'DK', tag: 'DK', name: 'Clã DK', color: CLAN_COLORS.green });
    expect(blue).toEqual({ clanId: 'DT', tag: 'DT', name: 'Clã DT', color: CLAN_COLORS.orange });
  });
  it('humano de outro clã desfaz; sem clã e bot (mesmo com clã de substituto) não contam; precisa de 2', () => {
    expect(sideClan([human(0, DK), human(0, DK), human(0, DT)], 0)).toBeNull();
    expect(sideClan([human(0, DK), human(0), bot(0, DK)], 0)).toBeNull();
    expect(sideClan([human(0, DK), human(0, DK), bot(0, DT), human(0)], 0)).toBe(DK);
  });
  it('cor parecida com o azul padrão: secundária; as duas parecidas: cor padrão', () => {
    const blueish = clan('BL', CLAN_COLORS.blue!, CLAN_COLORS.yellow!);
    expect(teamIdentities([human(0, blueish), human(0, blueish)])[0]!.color).toBe(CLAN_COLORS.yellow);
    const allBlue = clan('AZ', CLAN_COLORS.blue!, CLAN_COLORS.navy!);
    expect(teamIdentities([human(0, allBlue), human(0, allBlue)])[0]).toMatchObject({ tag: 'AZ', color: null });
  });
  it('clã x clã com a mesma primária: o lado azul usa a secundária', () => {
    const A = clan('AA', CLAN_COLORS.green!, CLAN_COLORS.white!);
    const B = clan('BB', CLAN_COLORS.green!, CLAN_COLORS.pink!);
    const [red, blue] = teamIdentities([human(0, A), human(0, A), human(1, B), human(1, B)]);
    expect([red!.color, blue!.color]).toEqual([CLAN_COLORS.green, CLAN_COLORS.pink]);
  });
  it('clã no azul contra o vermelho padrão: vermelho do clã vira a secundária', () => {
    const R = clan('RR', CLAN_COLORS.red!, CLAN_COLORS.white!);
    expect(teamIdentities([human(1, R), human(1, R), human(0)])[1]!.color).toBe(CLAN_COLORS.white);
  });

  it('o emblema do ticket vai para a identidade com as cores do clã (OG-485); ticket antigo, sem emblema', () => {
    const wolf = { frame: 'shield', symbol: 'wolf', fillet: false, inverted: true };
    const W = { ...DK, emblem: wolf };
    expect(teamIdentities([human(0, W), human(0, W)])[0]).toMatchObject({ emblem: wolf, colors: { primary: DK.primary, secondary: DK.secondary } });
    expect(teamIdentities([human(0, DK), human(0, DK)])[0]).not.toHaveProperty('emblem');
    expect(teamIdentities([human(0, { ...DK, emblem: { frame: 'x' } }), human(0, DK)])[0]).not.toHaveProperty('emblem');
  });
});
