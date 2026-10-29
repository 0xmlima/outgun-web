// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { foreignError } from './errors.js';

const ORIGIN = 'https://outgunweb.com.br';
const withStack = (stack: string) => Object.assign(new RangeError('Maximum call stack size exceeded.'), { stack });

describe('erros de script injetado (OG-510)', () => {
  it('pilha só na própria página (OUTGUN-WEB-5): não vai', () => {
    const e = withStack('RangeError: Maximum call stack size exceeded.\n    at Fk (https://outgunweb.com.br/:230:63)\n    at Hk (https://outgunweb.com.br/:230:409)');
    expect(foreignError(e, ORIGIN)).toBe(true);
  });

  it('script de extensão ou de outra origem: não vai', () => {
    const e = withStack('TypeError: x\n    at f (chrome-extension://abc/content.js:1:2)\n    at g (https://cdn.example/x.js:3:4)');
    expect(foreignError(e, ORIGIN)).toBe(true);
  });

  it('algum quadro nosso (build ou Vite em dev): vai', () => {
    expect(foreignError(withStack('Error\n    at f (chrome-extension://abc/c.js:1:2)\n    at g (https://outgunweb.com.br/assets/index-xmtEao49.js:1:2)'), ORIGIN)).toBe(false);
    expect(foreignError(withStack('Error\n    at g (http://localhost:5173/src/screens/MatchReport.tsx:10:2)'), 'http://localhost:5173')).toBe(false);
    expect(foreignError(withStack('g@https://outgunweb.com.br/assets/dist-Dv3o4Ukn.js:230:63'), ORIGIN)).toBe(false);
  });

  it('sem pilha ou sem Error: vai', () => {
    expect(foreignError(Object.assign(new Error('x'), { stack: '' }), ORIGIN)).toBe(false);
    expect(foreignError('mensagem', ORIGIN)).toBe(false);
  });
});
