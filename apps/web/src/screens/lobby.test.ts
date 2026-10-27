// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { LIVE_POLL_MS, liveRooms, POLL_MS } from './home-panels.js';
import { API_REFRESH_MS } from './stats.js';
import { filterRooms, REFRESH_MS, sortRooms, type RoomSummary } from './lobby.js';

const room = (id: string, players: number, maxPlayers = 16, online = true): RoomSummary => ({
  id, name: id, mode: 'casual', preset: 'classic', hasPassword: false, maxPlayers, players, humans: players, map: null, online, persistent: false, region: null,
});

describe('lobby (OG-069)', () => {
  it('lista: com gente primeiro, mais cheia antes, lotadas no fim', () => {
    expect(sortRooms([room('b', 0), room('cheia', 2, 2), room('a', 0), room('meio', 5), room('quase', 9)]).map((r) => r.id)).toEqual(['quase', 'meio', 'a', 'b', 'cheia']);
  });
  it('atualiza em até 5 s', () => {
    expect(REFRESH_MS).toBeLessThanOrEqual(5000);
  });

  it('filtros (OG-203): busca por nome ou mapa, sem diferenciar maiúsculas, e esconder lotadas', () => {
    const rooms = [{ ...room('Principal', 3), map: 'Coliseu' }, room('Treino', 2, 2), room('Amigos', 0)];
    expect(filterRooms(rooms, 'coli', false).map((r) => r.id)).toEqual(['Principal']);
    expect(filterRooms(rooms, 'TREI', false).map((r) => r.id)).toEqual(['Treino']);
    expect(filterRooms(rooms, '', true).map((r) => r.id)).toEqual(['Principal', 'Amigos']);
  });

  it('sala cheia de bots não é lotada: o humano entra no lugar de um bot (OG-445)', () => {
    expect(filterRooms([{ ...room('Bots', 16), humans: 1 }], '', true).map((r) => r.id)).toEqual(['Bots']);
  });
});

describe('Agora no Outgun (OG-282)', () => {
  it('jogadores online contam só pessoas; sala só com bots não aparece', () => {
    const rooms = [{ ...room('Principal', 8), humans: 1 }, { ...room('Bots', 6), humans: 0 }, { ...room('Fora', 3, 16, false), humans: 0 }];
    const { online, busy } = liveRooms(rooms);
    expect(online).toBe(1);
    expect(busy.map((r) => [r.id, r.players])).toEqual([['Principal', 8]]);
  });
});

describe('atualização automática do portal (OG-283)', () => {
  it('"Agora no Outgun" em até 5 s; o resto do portal a cada minuto', () => {
    expect(LIVE_POLL_MS).toBeLessThanOrEqual(5000);
    expect(POLL_MS).toBeLessThanOrEqual(60_000);
    expect(API_REFRESH_MS).toBeLessThanOrEqual(60_000);
  });
});
