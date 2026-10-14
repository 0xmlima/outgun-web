// SPDX-License-Identifier: GPL-2.0-or-later
// Salas abertas sob demanda (OG-086): a API escolhe este servidor e manda a configuração da sala
// no ticket (claim `spawn`); aqui ela é conferida e a sala é criada com os mapas da pasta.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GameMap } from '@outgun/sim';
import type { RoomSpawn } from '@outgun/tickets';
import { loadMaps } from './maps.js';
import { findPreset } from './presets.js';
import type { Room } from './room.js';
import type { RoomManager } from './rooms.js';

export interface SpawnerOptions {
  mapsDir: string;
  /**
   * Rotação oficial de cada modo (a do Ranked é a única que salas Ranked usam, RN-MOD-04). O objeto
   * é lido a cada sala aberta: o painel admin (OG-087) pode trocá-lo.
   */
  rotations: Record<RoomSpawn['mode'], readonly string[]>;
  log?: (line: string) => void;
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
    if (!manager.hasCapacity) {
      options.log?.(`sala ${id} recusada: limite de ${manager.maxRooms} salas`);
      return undefined;
    }
    // Ranked sempre com a rotação oficial; Casual pode trazer a sua (mapas desconhecidos saem).
    const wanted = spec.mode === 'casual' && spec.maps ? spec.maps.filter((m) => map(m)) : [];
    const files = wanted.length > 0 ? wanted : options.rotations[spec.mode].filter((m) => map(m));
    if (files.length === 0) return undefined;
    const room = manager.create({
      id,
      name: spec.name,
      preset: preset.id,
      maps: files.map((f) => map(f)!),
      mapFiles: files,
      maxPlayers: spec.maxPlayers,
      persistent: spec.persistent,
    });
    options.log?.(`sala ${id} aberta (${spec.mode}, ${preset.id}, ${files.length} mapas)`);
    return room;
  };
}
