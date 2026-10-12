// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORIGINAL_CREDITS } from './credits.js';

// README.txt do original está em ISO-8859-1; a comparação usa só ASCII para não depender disso.
const readme = readFileSync(join(import.meta.dirname, '../../../README.txt'), 'latin1');

describe('créditos do original', () => {
  it('cobre todas as seções de créditos do README.txt', () => {
    expect(ORIGINAL_CREDITS.map((group) => group.role)).toEqual([
      'Programming for 0.5.0',
      'Programming for 1.0',
      'Graphics themes',
      'Fonts',
      'Sound theme',
      'Translations',
      'Maps',
      '1.0.0 beta and later bug reports',
    ]);
  });

  it('lista todos os autores de mapas citados no README.txt', () => {
    const maps = ORIGINAL_CREDITS.find((group) => group.role === 'Maps');
    for (const author of maps?.people ?? []) expect(readme).toContain(author);
    expect(maps?.people).toHaveLength(18);
  });

  it('inclui os programadores principais', () => {
    for (const name of ['Fabiana Cecin', 'Niko Ritari', 'Jani Rivinoja', 'Peter Kosyh']) {
      expect(readme).toContain(name);
      expect(JSON.stringify(ORIGINAL_CREDITS)).toContain(name);
    }
  });
});
