// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MENU_THEMES } from '../app/prefs.js';
import { colorTokens, contrastRatio, textPairs } from './contrast.js';

const base = colorTokens(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8'));

describe.each(MENU_THEMES)('tema de menu %s (OG-291, OG-292)', (name) => {
  const theme = readFileSync(new URL(`./theme-${name}.css`, import.meta.url), 'utf8');
  const own = colorTokens(theme);
  /** Os tokens que o tema não redefine vêm de tokens.css, como no navegador. */
  const tokens = new Map([...base, ...own]);

  it('todo token de texto tem contraste AA (≥ 4,5:1) sobre as superfícies (RN-UI-03)', () => {
    for (const [text, background] of textPairs(tokens)) {
      expect(contrastRatio(tokens.get(text)!, tokens.get(background)!), `${text} sobre ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('redefine todas as cores de texto e de superfície (nada herdado do tema da partida por engano)', () => {
    for (const token of base.keys()) if (token.startsWith('--surface-') || token.startsWith('--text')) expect(own.has(token), token).toBe(true);
  });

  it('só vale sob o próprio data-menu-theme e não declara fonte (RN-UI-02)', () => {
    expect(theme).not.toContain('font-family');
    expect(theme).not.toMatch(/:root/);
    for (const rule of theme.match(/^[^\s/@}][^{]*\{/gm) ?? []) expect(rule, rule).toContain(`[data-menu-theme='${name}']`);
  });
});
