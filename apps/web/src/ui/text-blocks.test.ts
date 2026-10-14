// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { textBlocks } from './TextPage.js';

describe('textBlocks (OG-203)', () => {
  it('reestrutura o texto em colunas do original em título, parágrafo, pares e lista', () => {
    const lines = ['For more information:', '', 'Controls', ' ', ' Move               Arrow keys', ' Shoot              Control', ' ', 'Programming', '   Alice', '   Bob', ' A long paragraph that ends here.'];
    expect(textBlocks(lines)).toEqual([
      { kind: 'paragraph', text: 'For more information:' },
      { kind: 'heading', text: 'Controls' },
      { kind: 'pairs', rows: [['Move', 'Arrow keys'], ['Shoot', 'Control']] },
      { kind: 'heading', text: 'Programming' },
      { kind: 'list', items: ['Alice', 'Bob'] },
      { kind: 'paragraph', text: 'A long paragraph that ends here.' },
    ]);
  });
});
