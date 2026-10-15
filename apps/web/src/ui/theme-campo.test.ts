// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colorTokens, contrastRatio, textPairs } from './contrast.js';

const base = colorTokens(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8'));
const theme = readFileSync(new URL('./theme-campo.css', import.meta.url), 'utf8');
/** Os tokens que o tema não redefine vêm de tokens.css, como no navegador. */
const tokens = new Map([...base, ...colorTokens(theme)]);

describe('tema de menu Campo (OG-291)', () => {
  it('todo token de texto tem contraste AA (≥ 4,5:1) sobre as superfícies (RN-UI-03)', () => {
    for (const [text, background] of textPairs(tokens)) {
      expect(contrastRatio(tokens.get(text)!, tokens.get(background)!), `${text} sobre ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('redefine todas as cores de texto e de superfície (nada herdado do tema da partida por engano)', () => {
    const own = colorTokens(theme);
    for (const name of base.keys()) if (name.startsWith('--surface-') || name.startsWith('--text')) expect(own.has(name), name).toBe(true);
  });

  it('não declara fonte (fonte única, RN-UI-02)', () => {
    expect(theme).not.toContain('font-family');
  });
});
