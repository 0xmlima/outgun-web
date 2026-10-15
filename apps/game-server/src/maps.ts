// SPDX-License-Identifier: GPL-2.0-or-later
// Carrega mapas da rotação a partir de uma pasta (`maps/` do jogo).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMapFile } from '@outgun/content';
import type { GameMap } from '@outgun/sim';
import { rotationKey, type RankedFormat, type RotationKey } from '@outgun/settings';
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

/** Rotações oficiais: Casual e Ranked sempre; as dos formatos (OG-251) caem na `ranked` se faltarem. */
export type Rotations = Record<'casual' | 'ranked', readonly string[]> & Partial<Record<RotationKey, readonly string[]>>;

/** Rotação que uma sala nova usa (a do formato, se houver). */
export function rotationFor(rotations: Rotations, mode: 'casual' | 'ranked', format?: RankedFormat): readonly string[] {
  return rotations[rotationKey(mode, format)] ?? rotations[mode];
}

/** Mapas da pasta (nomes sem `.txt`), informados à API no heartbeat (OG-251). */
export function listMaps(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => f.slice(0, -4))
      .filter((n) => n.length > 0 && n.length <= 64)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 500);
  } catch {
    return [];
  }
}
