// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colorTokens, contrastRatio, textPairs } from './contrast.js';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const tokens = colorTokens(css);

describe('tokens do design system v2 (OG-200)', () => {
  it('contraste WCAG conhecido', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('todo token de texto tem contraste AA (≥ 4,5:1) sobre as superfícies (RN-UI-03)', () => {
    const pairs = textPairs(tokens);
    expect(pairs.length).toBeGreaterThan(30);
    for (const [text, background] of pairs) {
      const fg = tokens.get(text);
      const bg = tokens.get(background);
      expect(fg, text).toBeDefined();
      expect(bg, `${text} sobre ${background}`).toBeDefined();
      expect(contrastRatio(fg!, bg!), `${text} sobre ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uma única fonte: Inter (D-35, RN-UI-02)', () => {
    expect(css.match(/font-family:/g)).toHaveLength(1);
    expect(css).toContain("font-family: 'Inter'");
  });
});
