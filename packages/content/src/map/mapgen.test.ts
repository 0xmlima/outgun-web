// SPDX-License-Identifier: GPL-2.0-or-later
// Gerador de mapas (OG-011) × original: referência de tools/parity/fixtures/mapgen.cpp.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlibcRand } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import expected from './__fixtures__/mapgen.json' with { type: 'json' };
import { generateRandomMap, MapGenerator, type MapgenBlock } from './mapgen.js';
import { parseMap } from './parser.js';

const repoRoot = join(import.meta.dirname, '../../../..');
/** Os blocos na ordem em que o original os listou (o `readdir` do container). */
const blocks: MapgenBlock[] = expected.blocks.map((name) => ({ name, text: readFileSync(join(repoRoot, 'mapgen', name), 'latin1') }));

/** Sem as linhas de comentário (versão e data). */
const significant = (text: string) =>
  text
    .split('\n')
    .filter((l) => !l.startsWith(';'))
    .join('\n');

describe('gerador de mapas × original', () => {
  it.each(expected.maps.map((m) => [m.params, m] as const))('seed e parâmetros "%s"', (_, m) => {
    const [seed, w, h, overEdge, respawn, repetitive, wild, asym] = m.params.split(' ').map(Number) as number[];
    const text = generateRandomMap(
      { width: w!, height: h!, overEdge: overEdge!, respawnArea: respawn!, repetitiveRespawnArea: repetitive!, wildFlag: wild!, asymmetric: asym === 1 },
      new GlibcRand(seed!),
      blocks,
    );
    expect(significant(text)).toBe(significant(m.text));
  });

  it('cobre 20 seeds e mapas com respawn, verde, assimetria e passagem pelas bordas', () => {
    expect(expected.maps.length).toBeGreaterThanOrEqual(20);
    const texts = expected.maps.map((m) => m.text);
    expect(texts.some((t) => t.includes('V respawn'))).toBe(true);
    expect(texts.some((t) => /flag 2 \d+ \d+ 8 6/.test(t))).toBe(true);
    expect(expected.maps.some((m) => m.params.endsWith(' 1'))).toBe(true);
  });
});

describe('RN-MAP-05: mapas gerados são sempre válidos', () => {
  it('1.000 mapas de 1×1 a 8×8 com parâmetros variados passam pelo parser', () => {
    const rng = new GlibcRand(2026);
    const failures: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const params = {
        width: (rng.rand() % 8) + 1,
        height: (rng.rand() % 8) + 1,
        overEdge: (rng.rand() % 11) / 10,
        respawnArea: (rng.rand() % 11) / 10,
        repetitiveRespawnArea: (rng.rand() % 10) / 10,
        wildFlag: (rng.rand() % 11) / 10,
        asymmetric: rng.rand() % 3 === 0,
      };
      const text = generateRandomMap(params, rng, blocks);
      const r = parseMap(text);
      if (!r.ok) failures.push(`${JSON.stringify(params)}: ${r.errors.join('; ')}`);
      else if (r.map.width !== params.width || r.map.height !== params.height) failures.push(`${JSON.stringify(params)}: tamanho`);
      else if (r.map.teams[0].flags.length + r.map.teams[1].flags.length + r.map.wildFlags.length === 0) failures.push('sem bandeiras');
    }
    expect(failures).toEqual([]);
  }, 60000);

  it('sem blocos em mapgen/ usa o bloco embutido', () => {
    const text = new MapGenerator(new GlibcRand(1));
    text.generate(3, 2);
    const out = text.saveMap('<Random>', 'Outgun', []);
    expect(out).toContain(':room\nW 0 0 5 1');
    expect(parseMap(out).ok).toBe(true);
  });
});
