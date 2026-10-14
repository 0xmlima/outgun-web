// SPDX-License-Identifier: GPL-2.0-or-later
// Carrega mapas da rotação a partir de uma pasta (`maps/` do jogo).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMapFile } from '@outgun/content';
import type { GameMap } from '@outgun/sim';
import { parseRandomMapToken, type GeneratedMaps, type RandomMapParams } from './generated-maps.js';

export function loadMaps(dir: string, names: readonly string[]): GameMap[] {
  return names.map((name) => {
    const file = `${name}.txt`;
    const result = parseMapFile(file, readFileSync(join(dir, file)));
    if (!result.ok) throw new Error(`mapa inválido ${file}: ${result.errors.join('; ')}`);
    return result.map;
  });
}

/** Uma entrada da rotação já resolvida: mapa da pasta ou `random_map` (com o primeiro mapa gerado). */
export interface RotationSlot {
  map: GameMap;
  file: string;
  random?: RandomMapParams;
}

/**
 * Resolve as entradas de uma rotação (OG-015): nomes de `maps/` e linhas `random_map L A ...`.
 * Nomes inexistentes ou inválidos ficam de fora (o chamador decide o que fazer com a lista vazia).
 */
export function resolveRotation(entries: readonly string[], map: (file: string) => GameMap | undefined, generated: GeneratedMaps | undefined): RotationSlot[] {
  const out: RotationSlot[] = [];
  for (const entry of entries) {
    const random = parseRandomMapToken(entry);
    if (random) {
      if (!generated) continue;
      const g = generated.generate(random);
      out.push({ map: g.map, file: g.file, random });
      continue;
    }
    const m = map(entry);
    if (m) out.push({ map: m, file: entry });
  }
  return out;
}

/** É uma entrada de rotação válida (mapa existente ou `random_map` bem formado)? */
export function isRotationEntry(entry: string, map: (file: string) => GameMap | undefined): boolean {
  return parseRandomMapToken(entry) !== null || map(entry) !== undefined;
}
