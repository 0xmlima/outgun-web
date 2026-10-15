// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { APP_VERSION, isOutdated } from './version.js';

describe('versão do jogo (OG-280)', () => {
  it('vem do package.json no build', async () => {
    const { default: pkg } = await import('../../package.json', { with: { type: 'json' } });
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('avisa só quando a API está numa versão mais nova', () => {
    expect(isOutdated('2.21.0', '2.22.0')).toBe(true);
    expect(isOutdated('2.21.0', '2.21.1')).toBe(true);
    expect(isOutdated('2.21.0', '2.21.0')).toBe(false);
    expect(isOutdated('2.22.0', '2.21.0')).toBe(false);
    expect(isOutdated('dev', '2.21.0')).toBe(false);
    expect(isOutdated('2.21.0', undefined)).toBe(false);
  });
});
