// SPDX-License-Identifier: GPL-2.0-or-later
// Referência dos bots do Casual (OG-513, D-87, RN-TRN-08): partidas só de bots, com semente fixa, nos
// níveis 1 a 5, resumidas num hash do mundo a cada frame. O treino (OG-490+) não pode mudar nada aqui:
// qualquer diferença nas decisões, na mira ou na simulação muda o hash e quebra o teste.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room } from './room.js';

const MAPS = ['outgun1', 'pari2', 'the cover 4'];
const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), MAPS);
const FRAMES = 600;

function reference(map: number, level: number): string {
  const room = new Room({ id: 'ref', preset: 'classic', maps: [maps[map]!], mapFiles: [MAPS[map]!], maxPlayers: 16, seed: 41 + level, botTest: true, casualBots: { bots: 6, level }, now: () => 0 });
  const hash = createHash('sha256');
  for (let f = 0; f < FRAMES; f++) {
    room.tick();
    const w = room.world;
    const line = w.players.map((p) => (p ? `${p.pid}:${p.pos.roomX},${p.pos.roomY},${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)},${p.gundir},${p.dead ? 1 : 0},${p.stats.carriedFlag},${p.health}` : '-')).join('|');
    hash.update(`${line}#${w.teams[0].score}:${w.teams[1].score}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}

describe('bots do Casual: referência gravada (OG-513)', () => {
  it.each(MAPS.flatMap((name, map) => [1, 2, 3, 4, 5].map((level) => [name, level, map] as const)))('%s, nível %i', (_name, level, map) => {
    expect(reference(map, level)).toMatchSnapshot();
  });
});
