// SPDX-License-Identifier: GPL-2.0-or-later
// Cache dos AreaMaps por mapa, compartilhado por todos os bots do processo (`BotSharedDataStorage`,
// src/bot_support.cpp:35-60). O mapa é identificado por CRC e título, como no original; o dado vive
// enquanto houver algum bot usando.
import type { GameMap } from '@outgun/sim';
import { AreaMap } from './areamap.js';

const maps = new Map<string, { areaMap: AreaMap; users: number }>();

function key(map: GameMap): string {
  return `${map.crc}\u0000${map.title}`;
}

export function acquireAreaMap(map: GameMap): AreaMap {
  const k = key(map);
  let entry = maps.get(k);
  if (!entry) {
    entry = { areaMap: new AreaMap(map), users: 0 };
    maps.set(k, entry);
  }
  ++entry.users;
  return entry.areaMap;
}

export function releaseAreaMap(areaMap: AreaMap): void {
  const k = key(areaMap.map);
  const entry = maps.get(k);
  if (!entry || entry.areaMap !== areaMap) throw new Error('releaseAreaMap: AreaMap não adquirido');
  if (--entry.users === 0) maps.delete(k);
}

/** Quantos mapas estão no cache (para testes e métricas). */
export function cachedAreaMaps(): number {
  return maps.size;
}
