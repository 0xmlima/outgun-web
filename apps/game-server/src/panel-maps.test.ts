// SPDX-License-Identifier: GPL-2.0-or-later
// Mapas da moderação no game server (OG-367): baixados da API, conferidos pelo CRC e usados na rotação.
import { fileURLToPath } from 'node:url';
import { parseMap } from '@outgun/content';
import { describe, expect, it } from 'vitest';
import { AdminPanelLink } from './panel.js';
import { PanelMaps } from './panel-maps.js';
import { RoomManager } from './rooms.js';
import { makeSpawner, mapLoader } from './spawn.js';

const mapsDir = fileURLToPath(new URL('../../../_legacy/maps', import.meta.url));
const TEXT = 'P width 1\nP height 1\nP title Teste\nP author Moderação\nS 16 12\nflag 0 0 0 1 1\nspawn 0 0 0 8 6\nflag 1 0 0 15 11\nspawn 1 0 0 8 3\n';
const parsed = parseMap(TEXT);
if (!parsed.ok) throw new Error(parsed.errors.join());
const CRC = parsed.map.crc;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mapas da moderação no game server (OG-367)', () => {
  it('baixa o que falta, confere o CRC e tira o que saiu', async () => {
    const asked: string[] = [];
    const store = new PanelMaps(async (name) => {
      asked.push(name);
      return name === 'teste' ? TEXT : undefined;
    });
    expect(store.needs([{ name: 'teste', crc: CRC }])).toBe(true);
    expect(await store.sync([{ name: 'teste', crc: CRC }, { name: 'sumiu', crc: 1 }])).toEqual(['sumiu']);
    expect([store.map('teste')?.title, store.text('teste')]).toEqual(['Teste', TEXT]);
    expect(store.needs([{ name: 'teste', crc: CRC }])).toBe(false);
    // CRC diferente do anunciado: recusado (o mapa antigo fica até chegar o certo)
    expect(await store.sync([{ name: 'teste', crc: CRC + 1 }])).toEqual(['teste']);
    expect(await store.sync([])).toEqual([]);
    expect(store.map('teste')).toBeUndefined();
    expect(asked).toEqual(['teste', 'sumiu', 'teste']);
  });

  it('a rotação do painel com um mapa da moderação vale depois do download, na sala nova e na aberta', async () => {
    const store = new PanelMaps(async () => TEXT);
    const folder = mapLoader(mapsDir);
    const map = (name: string) => folder(name) ?? store.map(name);
    const manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 4 });
    const rotations = { casual: ['outgun1'], ranked: ['outgun1'] };
    const spawn = makeSpawner(manager, { mapsDir, rotations, map });
    const open = spawn('p-1', { name: 'p1', mode: 'casual', preset: 'classic', maxPlayers: 8, persistent: false })!;
    const panel = new AdminPanelLink({ manager, rotations, map, panelMaps: store });
    panel.onReply({ commands: [], config: { version: 'v1', presets: [], rotations: { casual: ['teste', 'outgun1'] }, maps: [{ name: 'teste', crc: CRC }] } });
    expect(rotations.casual).toEqual(['outgun1']); // ainda baixando
    await flush();
    expect(rotations.casual).toEqual(['teste', 'outgun1']);
    expect((open as unknown as { pendingRotation: { file: string }[] }).pendingRotation.map((e) => e.file)).toEqual(['teste', 'outgun1']);
    expect(spawn('p-2', { name: 'p2', mode: 'casual', preset: 'classic', maxPlayers: 8, persistent: false })!.world.map.title).toBe('Teste');
  });
});
