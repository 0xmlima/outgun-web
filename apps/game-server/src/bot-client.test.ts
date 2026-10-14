// SPDX-License-Identifier: GPL-2.0-or-later
// Bots com IA na sala (OG-053): clientes virtuais que só recebem o que um jogador receberia, com o
// atraso de `bot_ping`, e jogam CTF.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { runBotMatches } from './bot-stats.js';
import { loadMaps } from './maps.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1', 'verde']);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
}

function botRoom(opts: { bots: number; gamemod?: string; map?: number } = { bots: 6 }) {
  const room = new Room({
    id: 'bots',
    preset: 'classic',
    maps: [maps[opts.map ?? 0]!],
    mapFiles: [['outgun1', 'verde'][opts.map ?? 0]!],
    maxPlayers: 16,
    seed: 3,
    botTest: true,
    ...(opts.gamemod ? { gamemod: opts.gamemod } : {}),
  });
  for (let i = 0; i < opts.bots; i++) room.addBot();
  return room;
}

describe('bots com IA na sala (OG-053)', () => {
  it('jogam CTF: se movem, atiram e capturam numa partida de 3 minutos', () => {
    const stats = runBotMatches({ matches: 1, bots: 6, minutes: 3, map: 'outgun1', seed: 7 });
    expect(stats.matches).toBe(1);
    expect(stats.capturesPerMatch).toBeGreaterThan(0);
  });

  it('recebem os frames com o atraso de bot_ping e decidem uma vez por frame', () => {
    const room = botRoom({ bots: 2, gamemod: 'bot_ping 300' });
    for (let i = 0; i < 100; i++) room.tick();
    for (const bot of room.botClients()) {
      // o frame F sai no fim do tick F e chega 3 frames depois (`room.frame` já é o próximo)
      expect(room.frame - 1 - bot.reactedFrame).toBe(3);
      expect(bot.decisions).toBeGreaterThan(90);
    }
  });

  it('com bot_ping 0 decidem no mesmo frame', () => {
    const room = botRoom({ bots: 2, gamemod: 'bot_ping 0' });
    for (let i = 0; i < 50; i++) room.tick();
    for (const bot of room.botClients()) expect(room.frame - 1 - bot.reactedFrame).toBe(0);
  });

  it('random_wild_flag com bots não derruba a sala (no original derruba)', () => {
    const room = botRoom({ bots: 8, gamemod: 'random_wild_flag 1\ntime_limit 1' });
    expect(() => {
      for (let i = 0; i < 1500; i++) room.tick();
    }).not.toThrow();
    expect(room.results.length).toBeGreaterThanOrEqual(2);
    expect(room.world.wildFlags).toHaveLength(1);
  });

  it('bandeiras travadas e captura só na selvagem (verde)', () => {
    const room = botRoom({ bots: 6, map: 1, gamemod: 'lock_team_flags 1\ncapture_on_team_flag 0\ncapture_on_wild_flag 1\ntime_limit 2' });
    for (let i = 0; i < 1300; i++) room.tick();
    expect(room.results.length).toBe(1);
  });

  it('humano recebe as regras de bandeira em vigor (flagModes) na entrada', () => {
    const room = botRoom({ bots: 0, gamemod: 'capture_on_wild_flag 1\nsee_minimap_player_properties 1' });
    const conn = new TestConnection();
    const res = room.join(conn, { name: 'Ana', accountId: null });
    expect(res.ok).toBe(true);
    const modes = conn.received.find((m) => m.type === 'flagModes');
    expect(modes).toMatchObject({ captureOnWildFlags: true, seeMinimapProperties: 1 });
  });

  it('confirma no chat de time a preferência de defesa de um companheiro', () => {
    const room = new Room({ id: 'b', preset: 'classic', maps: [maps[0]!], mapFiles: ['outgun1'], maxPlayers: 4, seed: 3, gamemod: 'bot_ping 0' });
    const conn = new TestConnection();
    const res = room.join(conn, { name: 'Ana', accountId: null });
    if (!res.ok) throw new Error(res.reason);
    room.handle(res.pid, [message('clientReady', {})]);
    room.addBot();
    room.addBot();
    room.addBot();
    for (let i = 0; i < 5; i++) room.tick();
    room.handle(res.pid, [message('chat', { text: '.d', teamOnly: true })]);
    for (let i = 0; i < 5; i++) room.tick();
    const texts = conn.received.flatMap((m) => (m.type === 'text' ? [m.text] : []));
    expect(texts.some((t) => t.endsWith('Roger - Ana prefers defending until dead, then attacking'))).toBe(true);
  });
});
