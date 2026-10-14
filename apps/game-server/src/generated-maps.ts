// SPDX-License-Identifier: GPL-2.0-or-later
// Mapas aleatórios da rotação (OG-015, RN-MAP-06): cada vez que uma entrada `random_map` entra na
// rotação, a sala gera `mapgen_<n>` como o `load_rotation_map` do original (src/server.cpp:514-524).
// Os textos ficam em memória (os últimos 64) para o game server servir em /maps/<arquivo>.txt; o
// cliente baixa dali e os replays levam o texto junto.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateRandomMap, parseMapFile, type MapgenBlock, type RandomMapParams } from '@outgun/content';
import { applyGamemod, classicSettings } from '@outgun/settings';
import { GlibcRand, type GameMap } from '@outgun/sim';

export type { RandomMapParams };

/** `random_map L A [bordas respawn respawn-repetitivo verde s|a]`, como a linha do gamemod; senão null. */
export function parseRandomMapToken(token: string): RandomMapParams | null {
  const m = /^random_map\s+(.+)$/.exec(token.trim());
  if (!m) return null;
  const result = applyGamemod(classicSettings(), `random_map ${m[1]}`);
  const entry = result.settings.maps.at(-1);
  if (result.errors.length > 0 || entry?.type !== 'random') return null;
  const { width, height, overEdge, respawnArea, repetitiveRespawnArea, wildFlag, asymmetric } = entry;
  return { width, height, overEdge, respawnArea, repetitiveRespawnArea, wildFlag, asymmetric };
}

export const GENERATED_PREFIX = 'mapgen_';

export class GeneratedMaps {
  private readonly texts = new Map<string, string>();
  private blocks: MapgenBlock[] | null = null;
  private readonly rng: GlibcRand;

  constructor(
    private readonly mapgenDir: string | null,
    seed = Math.floor(Math.random() * 2 ** 31),
    private readonly keep = 64,
  ) {
    this.rng = new GlibcRand(seed);
  }

  /** Blocos de `mapgen/` em ordem alfabética (spec mapgen.md); sem a pasta, o bloco embutido. */
  private loadBlocks(): MapgenBlock[] {
    if (this.blocks) return this.blocks;
    let names: string[];
    try {
      names = this.mapgenDir ? readdirSync(this.mapgenDir).filter((f) => f.endsWith('.txt')).sort() : [];
    } catch {
      names = [];
    }
    this.blocks = names.map((name) => ({ name, text: readFileSync(join(this.mapgenDir as string, name), 'latin1') }));
    return this.blocks;
  }

  /** Gera um mapa novo; o nome é `mapgen_<rand()>`, como no original. */
  generate(params: RandomMapParams): { file: string; map: GameMap; text: string } {
    for (;;) {
      const file = `${GENERATED_PREFIX}${this.rng.rand()}`;
      if (this.texts.has(file)) continue;
      const text = generateRandomMap(params, this.rng, this.loadBlocks());
      const parsed = parseMapFile(`${file}.txt`, new TextEncoder().encode(text));
      if (!parsed.ok) throw new Error(`mapa gerado inválido: ${parsed.errors.join('; ')}`);
      this.texts.set(file, text);
      while (this.texts.size > this.keep) this.texts.delete(this.texts.keys().next().value as string);
      return { file, map: parsed.map, text };
    }
  }

  /** Texto de um mapa gerado (para /maps e para o replay); undefined se já saiu da memória. */
  text(file: string): string | undefined {
    return this.texts.get(file);
  }
}
