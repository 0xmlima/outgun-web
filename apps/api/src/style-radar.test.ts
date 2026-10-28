// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo (OG-469, RN-RAD): percentil, amostra e arquétipo, sem banco.
import { describe, expect, it } from 'vitest';
import { archetypeOf, percentileOf, styleProfiles, type AxisValues, type StyleRow } from './style-radar.js';

const flat = (v: number): AxisValues => ({ kills: v, accuracy: v, survival: v, flag: v, defense: v, team: v });
const row = (name: string, games: number, raw: Partial<AxisValues>): StyleRow => ({ userId: name, username: name, usernameKey: name.toLowerCase(), clanTag: null, games, raw: { ...flat(0), ...raw } });

describe('percentil (RN-RAD-02)', () => {
  it('fração abaixo, com metade dos empates; sozinho = 100', () => {
    expect(percentileOf(5, [])).toBe(100);
    expect(percentileOf(5, [1, 2, 3, 4])).toBe(100);
    expect(percentileOf(0, [1, 2, 3, 4])).toBe(0);
    expect(percentileOf(3, [1, 3, 5, 7])).toBe(38); // (1 + 0,5) / 4
    expect(percentileOf(2, [2, 2])).toBe(50);
  });

  it('a população é quem tem 5 ranqueadas; com 3 ou 4 há radar, mas fora da base', () => {
    const p = styleProfiles([row('Ana', 5, { kills: 10 }), row('Bia', 5, { kills: 2 }), row('Caio', 4, { kills: 100 }), row('Davi', 2, { kills: 50 })]);
    expect(p.get('Ana')!.percentiles.kills).toBe(100); // Caio (4 partidas) não conta contra ela
    expect(p.get('Bia')!.percentiles.kills).toBe(0);
    expect(p.get('Caio')!.percentiles.kills).toBe(100);
    expect(p.get('Caio')!.lowSample).toBe(true);
    expect(p.has('Davi')).toBe(false); // abaixo de 3 (RN-RAD-03)
  });

  it('10 ou mais partidas deixam de ser "poucos jogos"', () => {
    const p = styleProfiles([row('Ana', 10, {}), row('Bia', 9, {})]);
    expect(p.get('Ana')!.lowSample).toBe(false);
    expect(p.get('Bia')!.lowSample).toBe(true);
  });
});

describe('arquétipo (RN-RAD-04)', () => {
  it('o eixo mais alto decide', () => {
    expect(archetypeOf({ ...flat(10), kills: 90 })).toBe('shooter');
    expect(archetypeOf({ ...flat(10), accuracy: 90 })).toBe('shooter');
    expect(archetypeOf({ ...flat(10), flag: 90 })).toBe('runner');
    expect(archetypeOf({ ...flat(10), defense: 90 })).toBe('wall');
    expect(archetypeOf({ ...flat(10), team: 90 })).toBe('support');
    expect(archetypeOf({ ...flat(10), survival: 90 })).toBe('survivor');
  });

  it('amplitude abaixo de 20 é Coringa; 20 já tem estilo', () => {
    expect(archetypeOf({ ...flat(50), flag: 69 })).toBe('joker');
    expect(archetypeOf({ ...flat(50), flag: 70 })).toBe('runner');
  });

  it('empate no topo segue a ordem dos eixos', () => {
    expect(archetypeOf({ ...flat(10), defense: 80, team: 80 })).toBe('wall');
    expect(archetypeOf({ ...flat(10), flag: 80, kills: 80 })).toBe('shooter');
  });
});
