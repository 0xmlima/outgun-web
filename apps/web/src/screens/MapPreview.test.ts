// SPDX-License-Identifier: GPL-2.0-or-later
// Prévia dos mapas (OG-368): do jogo pelos assets; os da moderação pela API.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../assets.js', () => ({ ASSETS: '/assets/', loadManifest: async () => ({ maps: { outgun1: { file: 'maps/outgun1.txt', dir: 'maps' } } }) }));
vi.mock('../app/api.js', () => ({ API_URL: '/api' }));
const { previewMap } = await import('./MapPreview.js');

const TEXT = 'P width 1\nP height 1\nP title Teste\nP author Moderação\nS 16 12\nflag 0 0 0 1 1\nspawn 0 0 0 8 6\nflag 1 0 0 15 11\nspawn 1 0 0 8 3\n';
const bytes = () => new Response(Uint8Array.from(TEXT, (c) => c.charCodeAt(0)));

afterEach(() => vi.unstubAllGlobals());

describe('prévia dos mapas (OG-368)', () => {
  it('mapa do jogo vem dos assets; o da moderação, da API (uma vez só); gerados e random_map ficam sem', async () => {
    const fetch = vi.fn(async (_url: string) => bytes());
    vi.stubGlobal('fetch', fetch);
    expect((await previewMap('outgun1'))?.title).toBe('Teste');
    expect((await previewMap('mapa novo'))?.author).toBe('Moderação');
    await previewMap('mapa novo');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/assets/maps/outgun1.txt', '/api/maps/mapa%20novo']);
    expect([await previewMap('mapgen_3'), await previewMap('random_map 3 3')]).toEqual([null, null]);
  });

  it('mapa desativado (404): sem prévia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    expect(await previewMap('sumiu')).toBeNull();
  });
});
