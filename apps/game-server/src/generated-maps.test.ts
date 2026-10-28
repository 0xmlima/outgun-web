// SPDX-License-Identifier: GPL-2.0-or-later
// Mapas aleatórios na rotação (OG-015): `random_map` gera um mapa novo cada vez que entra; a lista
// mostra `<Random>`; o texto vai pelo game server (/maps) e no replay.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeneratedMaps, parseRandomMapToken } from './generated-maps.js';
import { resolveRotation } from './maps.js';
import type { Connection } from './room.js';
import { RoomManager } from './rooms.js';
import { startServer, type RunningServer } from './server.js';
import { mapLoader } from './spawn.js';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const map = mapLoader(`${repo}_legacy/maps`);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(): void {}
}

describe('random_map na rotação (OG-015)', () => {
  it('lê a linha como o gamemod; inválida dá null', () => {
    expect(parseRandomMapToken('random_map 3 2')).toEqual({ width: 3, height: 2, overEdge: 0.2, respawnArea: 0.1, repetitiveRespawnArea: 0.5, wildFlag: 0.1, asymmetric: false });
    expect(parseRandomMapToken('random_map 4 4 1 0 0 0 a')).toMatchObject({ width: 4, height: 4, overEdge: 1, asymmetric: true });
    expect(parseRandomMapToken('random_map 0 2')).toBeNull();
    expect(parseRandomMapToken('random_map 3 2 9')).toBeNull();
    expect(parseRandomMapToken('outgun1')).toBeNull();
  });

  it('a rotação mistura mapas da pasta e gerados; nome inexistente sai', () => {
    const generated = new GeneratedMaps(`${repo}_legacy/mapgen`, 7);
    const slots = resolveRotation(['outgun1', 'random_map 3 2', 'nao-existe'], map, generated);
    expect(slots.map((s) => s.file)).toEqual(['outgun1', expect.stringMatching(/^mapgen_\d+$/)]);
    expect(slots[1]).toMatchObject({ random: { width: 3, height: 2 }, map: { width: 3, height: 2, title: '<Random>' } });
    expect(generated.text(slots[1]!.file)).toContain('P title <Random>');
  });

  it('cada vez que a entrada entra é um mapa novo; a lista mostra <Random>; o replay leva o texto', () => {
    const generated = new GeneratedMaps(`${repo}_legacy/mapgen`, 11);
    const slots = resolveRotation(['random_map 2 2', 'outgun1'], map, generated);
    const m = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 3, roomDefaults: { generatedMaps: generated } });
    const room = m.create({ id: 'r', preset: 'classic', maps: slots.map((s) => s.map), mapFiles: slots.map((s) => s.file), randomSlots: slots.map((s) => s.random ?? null), maxPlayers: 8 });
    const conn = new TestConnection();
    const joined = room.join(conn, { name: 'Adm', accountId: null, admin: true });
    if (!joined.ok) throw new Error(joined.text);
    room.handle(joined.pid, [message('clientReady', {})]);
    const list = conn.received.find((x) => x.type === 'mapList');
    expect(list?.type === 'mapList' && list.maps[0]).toMatchObject({ title: '<Random>', author: 'Outgun', width: 2, height: 2 });

    const files: string[] = [];
    for (let i = 0; i < 3; i++) {
      // vota no mapa aleatório (índice 0) e força a troca
      room.handle(joined.pid, [message('mapVote', { map: 0 })]);
      room.handle(joined.pid, [message('chat', { text: '/forcemap', teamOnly: false })]);
      m.tickAll();
      const change = conn.received.filter((x) => x.type === 'mapChange').at(-1);
      if (change?.type !== 'mapChange') throw new Error('sem troca de mapa');
      files.push(change.file);
      for (let k = 0; k < 80; k++) m.tickAll();
    }
    expect(files.every((f) => /^mapgen_\d+$/.test(f))).toBe(true);
    expect(new Set(files).size).toBe(3);
    expect(room.world.map.width).toBe(2);
    expect(generated.text(files[2]!)).toBeDefined();
  });

  it('o painel reenviando a mesma rotação com random_map não zera o voto na troca seguinte (OG-458)', () => {
    const generated = new GeneratedMaps(`${repo}_legacy/mapgen`, 11);
    const entries = ['random_map 2 2', 'outgun1', 'coliseu'];
    const slots = resolveRotation(entries, map, generated);
    const m = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 3, roomDefaults: { generatedMaps: generated } });
    const room = m.create({ id: 'r', preset: 'classic', maps: slots.map((s) => s.map), mapFiles: slots.map((s) => s.file), randomSlots: slots.map((s) => s.random ?? null), maxPlayers: 8 });
    const conn = new TestConnection();
    const joined = room.join(conn, { name: 'Ana', accountId: null });
    if (!joined.ok) throw new Error(joined.text);
    room.handle(joined.pid, [message('clientReady', {})]);
    room.setRotation(resolveRotation(entries, map, generated)); // heartbeat com a config de novo: arquivos gerados diferentes
    room.handle(joined.pid, [message('mapVote', { map: 2 }), message('mapExit', { on: true })]);
    m.tickAll();
    const change = conn.received.filter((x) => x.type === 'mapChange').at(-1);
    expect(change?.type === 'mapChange' && change.file).toBe('coliseu');
  });

  describe('game server', () => {
    let server: RunningServer;
    const generated = new GeneratedMaps(`${repo}_legacy/mapgen`, 5);
    let file = '';
    beforeAll(async () => {
      const m = new RoomManager({ emptyTimeoutMs: 60_000 });
      file = generated.generate({ width: 2, height: 1, overEdge: 0.2, respawnArea: 0.1, repetitiveRespawnArea: 0.5, wildFlag: 0.1, asymmetric: false }).file;
      server = await startServer({ port: 0, host: '127.0.0.1', manager: m, devTickets: true, generatedMaps: generated });
    });
    afterAll(() => server.close());

    it('serve o texto do mapa gerado para o cliente baixar', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/maps/${file}.txt`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(generated.text(file));
      expect((await fetch(`http://127.0.0.1:${server.port}/maps/mapgen_1.txt`)).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${server.port}/maps/..%2Fsecret.txt`)).status).toBe(404);
    });
  });
});
