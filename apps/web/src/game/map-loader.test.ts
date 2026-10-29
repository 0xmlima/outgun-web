// SPDX-License-Identifier: GPL-2.0-or-later
// Mapa fora dos assets (moderação, OG-367): baixado do game server, em Latin-1.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../assets.js', () => ({ ASSETS: '/assets/', loadManifest: async () => ({ maps: {} }) }));
const { loadMap, sameMapOrLoaded, serverOnlyMap } = await import('./map-loader.js');

const TEXT = 'P width 1\nP height 1\nP title Teste\nP author Moderação\nS 16 12\nflag 0 0 0 1 1\nspawn 0 0 0 8 6\nflag 1 0 0 15 11\nspawn 1 0 0 8 3\n';

afterEach(() => vi.unstubAllGlobals());

describe('mapa da moderação no cliente (OG-367)', () => {
  it('fora do manifesto: baixa do game server e lê byte a byte', async () => {
    const fetch = vi.fn(async () => new Response(Uint8Array.from(TEXT, (c) => c.charCodeAt(0))));
    vi.stubGlobal('fetch', fetch);
    const { map } = await loadMap('mapa novo', { base: 'https://gs.example/gs' });
    expect(fetch).toHaveBeenCalledWith('https://gs.example/gs/maps/mapa%20novo.txt');
    expect([map.title, map.author]).toEqual(['Teste', 'Moderação']);
    expect(await serverOnlyMap('mapa novo')).toBe(true);
  });

  it('sem servidor e fora do manifesto: erro', async () => {
    await expect(loadMap('mapa novo')).rejects.toThrow('mapa não encontrado');
  });
});

describe('redesenho pelas cores do clã (OG-509)', () => {
  it('a carga do mesmo mapa segue com o objeto da sessão; outro mapa entra no lugar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from(TEXT, (c) => c.charCodeAt(0)))));
    const { map: playing } = await loadMap('mapa novo', { base: 'https://gs.example/gs' });
    const { map: again } = await loadMap('mapa novo', { base: 'https://gs.example/gs' });
    expect(again).not.toBe(playing);
    expect(sameMapOrLoaded(playing, again)).toBe(playing);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from(TEXT.replace('Teste', 'Outro'), (c) => c.charCodeAt(0)))));
    const { map: other } = await loadMap('outro', { base: 'https://gs.example/gs' });
    expect(sameMapOrLoaded(playing, other)).toBe(other);
    expect(sameMapOrLoaded(null, again)).toBe(again);
  });
});
