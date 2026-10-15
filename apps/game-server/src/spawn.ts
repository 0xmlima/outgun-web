// SPDX-License-Identifier: GPL-2.0-or-later
// Salas abertas sob demanda (OG-086): a API escolhe este servidor e manda a configuração da sala
// no ticket (claim `spawn`); aqui ela é conferida e a sala é criada com os mapas da pasta.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GameMap } from '@outgun/sim';
import { formatPlayers, isRankedFormat, isSeriesBestOf } from '@outgun/settings';
import type { RoomSpawn } from '@outgun/tickets';
import { loadMaps, resolveRotation, rotationFor, type Rotations } from './maps.js';
import type { GeneratedMaps } from './generated-maps.js';
import { findPreset } from './presets.js';
import type { Room } from './room.js';
import type { RoomManager } from './rooms.js';

export interface SpawnerOptions {
  mapsDir: string;
  /**
   * Rotação oficial de cada modo (a do Ranked é a única que salas Ranked usam, RN-MOD-04). O objeto
   * é lido a cada sala aberta: o painel admin (OG-087) pode trocá-lo.
   */
  rotations: Rotations;
  log?: (line: string) => void;
  /** Mapas gerados para as entradas `random_map` (OG-015). */
  generatedMaps?: GeneratedMaps;
}

/** Mapas da pasta por nome, com cache (nomes com barra ou inexistentes dão undefined). */
export function mapLoader(mapsDir: string): (name: string) => GameMap | undefined {
  const cache = new Map<string, GameMap>();
  return (name) => {
    if (!cache.has(name)) {
      if (!/^[^/\\]+$/.test(name) || !existsSync(join(mapsDir, `${name}.txt`))) return undefined;
      try {
        cache.set(name, loadMaps(mapsDir, [name])[0]!);
      } catch {
        return undefined;
      }
    }
    return cache.get(name);
  };
}

export function makeSpawner(manager: RoomManager, options: SpawnerOptions): (id: string, spec: RoomSpawn) => Room | undefined {
  const map = mapLoader(options.mapsDir);

  return (id, spec) => {
    const preset = findPreset(spec.preset);
    if (!preset || preset.mode !== spec.mode) return undefined;
    // formato e série só no Ranked, e a sala tem exatamente 2 × N vagas (OG-250)
    const ranked = spec.ranked;
    if (ranked && (spec.mode !== 'ranked' || !isRankedFormat(ranked.format) || !isSeriesBestOf(ranked.bestOf))) return undefined;
    if (!manager.hasCapacity) {
      options.log?.(`sala ${id} recusada: limite de ${manager.maxRooms} salas`);
      return undefined;
    }
    // Ranked sempre com a rotação oficial; Casual pode trazer a sua (mapas desconhecidos saem);
    // as duas aceitam `random_map L A ...` (OG-015)
    const wanted = spec.mode === 'casual' && spec.maps ? resolveRotation(spec.maps, map, options.generatedMaps) : [];
    const slots = wanted.length > 0 ? wanted : resolveRotation(rotationFor(options.rotations, spec.mode, ranked?.format), map, options.generatedMaps);
    if (slots.length === 0) return undefined;
    const files = slots.map((s) => s.file);
    const room = manager.create({
      id,
      name: spec.name,
      preset: preset.id,
      maps: slots.map((s) => s.map),
      mapFiles: files,
      ...(slots.some((s) => s.random) ? { randomSlots: slots.map((s) => s.random ?? null) } : {}),
      maxPlayers: ranked ? formatPlayers(ranked.format) : spec.maxPlayers,
      persistent: spec.persistent,
      ...(ranked ? { ranked: { format: ranked.format, bestOf: ranked.bestOf } } : {}),
    });
    options.log?.(`sala ${id} aberta (${spec.mode}, ${preset.id}, ${files.length} mapas${ranked ? `, ${ranked.format} md${ranked.bestOf}` : ''})`);
    return room;
  };
}
