// SPDX-License-Identifier: GPL-2.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

afterEach(() => vi.unstubAllGlobals());

/** `document` mínimo: o `textarea` escondido e o `execCommand`. */
const fakeDocument = (exec: () => boolean) => {
  const area = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
  const doc = { createElement: vi.fn(() => area), body: { append: vi.fn() }, execCommand: vi.fn(exec) };
  vi.stubGlobal('document', doc);
  return doc;
};
const denied = () => vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('Write permission denied.'))) } });

describe('copiar link (OG-511)', () => {
  it('com permissão: usa a área de transferência', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('https://outgunweb.com.br/replay')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://outgunweb.com.br/replay');
  });

  it('sem permissão: cai no execCommand e não rejeita', async () => {
    denied();
    const doc = fakeDocument(() => true);
    await expect(copyText('https://outgunweb.com.br/replay')).resolves.toBe(true);
    expect(doc.execCommand).toHaveBeenCalledWith('copy');
  });

  it('nada funciona: devolve false', async () => {
    denied();
    fakeDocument(() => {
      throw new Error('sem suporte');
    });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
