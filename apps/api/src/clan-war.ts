// SPDX-License-Identifier: GPL-2.0-or-later
// Clã x clã (OG-259, RN-RKL-14): partida Ranked com formato em que os dois lados estão completos,
// todos de um lado são do mesmo clã cadastrado e todos do outro de outro clã (ex.: nn x BC). Bot
// substituto conta pelo clã do jogador que ele substitui (o game server manda esse clã nele, D-46).
import type { RankedFormat } from './ranking.js';

export interface ClanWarPlayer {
  team: 0 | 1;
  clanId: string | null;
}

/** Os clãs [vermelho, azul] quando a partida é clã x clã; senão, undefined. */
export function clanWarSides(format: RankedFormat | null | undefined, players: readonly ClanWarPlayer[]): [string, string] | undefined {
  if (!format) return undefined;
  const size = Number(format[0]);
  const side = (team: 0 | 1) => {
    const list = players.filter((p) => p.team === team);
    const clan = list[0]?.clanId;
    return list.length === size && clan && list.every((p) => p.clanId === clan) ? clan : undefined;
  };
  const red = side(0);
  const blue = side(1);
  return red && blue && red !== blue ? [red, blue] : undefined;
}
