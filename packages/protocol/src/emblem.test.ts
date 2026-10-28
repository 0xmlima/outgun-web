// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { CLAN_COLORS } from './colors.js';
import { DEFAULT_EMBLEM, emblemFrameAllowed, EMBLEM_FRAMES, EMBLEM_SYMBOL_NAMES, EMBLEM_SYMBOLS, emblemKey, emblemSvg, parseEmblem, type ClanEmblem } from './emblem.js';

const navy = CLAN_COLORS.navy!;
const yellow = CLAN_COLORS.yellow!;
const wolf: ClanEmblem = { frame: 'shield', symbol: 'wolf', fillet: true, inverted: false };

describe('emblema do clã (OG-480)', () => {
  it('valida só listas fechadas', () => {
    expect(parseEmblem(wolf)).toEqual(wolf);
    expect(parseEmblem({ ...wolf, frame: 'triangulo' })).toBeNull();
    expect(parseEmblem({ ...wolf, symbol: 'mickey' })).toBeNull();
    expect(parseEmblem({ ...wolf, fillet: 'sim' })).toBeNull();
    expect(parseEmblem(null)).toBeNull();
    expect(parseEmblem({ ...wolf, extra: 1 })).toEqual(wolf);
  });

  it('a chave trata invertido como as cores trocadas', () => {
    const inv = { ...wolf, inverted: true };
    expect(emblemKey(inv, 'LC', navy, yellow)).toBe(emblemKey(wolf, 'XY', yellow, navy));
    expect(emblemKey(inv, 'LC', navy, yellow)).not.toBe(emblemKey(wolf, 'LC', navy, yellow));
    expect(emblemKey({ ...wolf, fillet: false }, 'LC', navy, yellow)).not.toBe(emblemKey(wolf, 'LC', navy, yellow));
  });

  it('com a tag como símbolo, tags diferentes são emblemas diferentes', () => {
    expect(emblemKey(DEFAULT_EMBLEM, 'lc', navy, yellow)).toBe(emblemKey(DEFAULT_EMBLEM, 'LC', navy, yellow));
    expect(emblemKey(DEFAULT_EMBLEM, 'LC', navy, yellow)).not.toBe(emblemKey(DEFAULT_EMBLEM, 'MV', navy, yellow));
  });

  it('padrão: escudo + tag; sem cores, neutras', () => {
    expect(DEFAULT_EMBLEM).toMatchObject({ frame: 'shield', symbol: 'tag' });
    const svg = emblemSvg(DEFAULT_EMBLEM, 'LC', null, null);
    expect(svg).toContain('fill="#8E98A6"');
    expect(svg).toContain('>LC</text>');
  });

  it('tag de 1, 2 e 3 caracteres muda o tamanho da letra', () => {
    const size = (tag: string) => /font-size="(\d+)"/.exec(emblemSvg(DEFAULT_EMBLEM, tag, navy, yellow))![1];
    expect(size('Z')).toBe('60');
    expect(size('LC')).toBe('46');
    expect(size('BDL')).toBe('34');
    expect(emblemSvg(DEFAULT_EMBLEM, '<&>', navy, yellow)).toContain('&#60;&#38;&#62;');
  });

  it('desenha toda moldura e todo símbolo', () => {
    for (const frame of EMBLEM_FRAMES)
      for (const symbol of EMBLEM_SYMBOLS) {
        const svg = emblemSvg({ frame, symbol, fillet: true, inverted: false }, 'AB', navy, yellow);
        expect(svg.startsWith('<svg viewBox="0 0 100 100"')).toBe(true);
        expect(svg).toContain(yellow);
      }
    // 28 desenhos do catálogo + a tag.
    expect(EMBLEM_SYMBOLS).toHaveLength(29);
    for (const symbol of EMBLEM_SYMBOLS) expect(EMBLEM_SYMBOL_NAMES[symbol]).toBeTruthy();
  });

  it('molduras do hall (OG-488): campeão usa as três; 3º só a bronze; sem pódio nenhuma', () => {
    expect(['hallGold', 'hallSilver', 'hallBronze'].map((f) => emblemFrameAllowed(f as ClanEmblem['frame'], 1))).toEqual([true, true, true]);
    expect(['hallGold', 'hallSilver', 'hallBronze'].map((f) => emblemFrameAllowed(f as ClanEmblem['frame'], 3))).toEqual([false, false, true]);
    expect(emblemFrameAllowed('hallBronze', null)).toBe(false);
    expect(emblemFrameAllowed('shield', null)).toBe(true);
  });
});
