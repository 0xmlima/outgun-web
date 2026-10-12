// SPDX-License-Identifier: GPL-2.0-or-later
// Carrega mapas da rotação a partir de uma pasta (`maps/` do jogo).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMapFile } from '@outgun/content';
import type { GameMap } from '@outgun/sim';

export function loadMaps(dir: string, names: readonly string[]): GameMap[] {
  return names.map((name) => {
    const file = `${name}.txt`;
    const result = parseMapFile(file, readFileSync(join(dir, file)));
    if (!result.ok) throw new Error(`mapa inválido ${file}: ${result.errors.join('; ')}`);
    return result.map;
  });
}
