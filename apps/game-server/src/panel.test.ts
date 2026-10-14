// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin no game server (OG-087): comandos da resposta do heartbeat executados na sala,
// confirmações para o heartbeat seguinte, presets e rotações aplicados quando a versão muda.
import { fileURLToPath } from 'node:url';
import { decodeFrame, message, type AnyMessage } from '@outgun/protocol';
import { describe, expect, it } from 'vitest';
import { AdminPanelLink } from './panel.js';
import type { HeartbeatReply } from './platform.js';
import { findPreset } from './presets.js';
import type { Connection } from './room.js';
import { RoomManager } from './rooms.js';
import { makeSpawner, mapLoader } from './spawn.js';

const mapsDir = fileURLToPath(new URL('../../../_legacy/maps', import.meta.url));
const map = mapLoader(mapsDir);

class TestConnection implements Connection {
  received: AnyMessage[] = [];
  closed: [number, string] | null = null;
  send(data: Uint8Array): void {
    const r = decodeFrame(data, 's2c');
    if (!r.ok) throw new Error(r.error);
    this.received.push(...r.messages);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
}

function setup() {
  const manager = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 4 });
  const rotations: Record<'casual' | 'ranked', readonly string[]> = { casual: ['outgun1'], ranked: ['outgun1'] };
  const room = manager.create({ id: 'main', preset: 'classic', maps: [map('outgun1')!], mapFiles: ['outgun1'], maxPlayers: 16, persistent: true });
  const conn = new TestConnection();
  const joined = room.join(conn, { name: 'Visita*', accountId: null, ip: '10.1.2.3', device: 'ab'.repeat(16) });
  if (!joined.ok) throw new Error(joined.text);
  room.handle(joined.pid, [message('clientReady', {})]);
  const panel = new AdminPanelLink({ manager, rotations, map });
  const uid = room.roster()[0]!.uid;
  return { manager, rotations, room, conn, panel, uid };
}

const reply = (commands: HeartbeatReply['commands'], config: Partial<HeartbeatReply['config']> = {}): HeartbeatReply => ({
  commands,
  config: { version: 'v1', presets: [], rotations: {}, ...config },
});

describe('painel admin no game server (OG-087)', () => {
  it('a sala manda a lista de jogadores no heartbeat', () => {
    const { manager, uid } = setup();
    expect(manager.hosted()[0]!.roster).toEqual([{ uid, name: 'Visita*', team: expect.any(Number), bot: false, muted: 0 }]);
  });

  it('mute, mensagem e ban: executados na sala; a confirmação leva conta, IP e dispositivo para o ban', () => {
    const { manager, room, conn, panel, uid } = setup();
    panel.onReply(
      reply([
        { id: 1, roomId: 'main', kind: 'mute', uid, actor: 'Mod' },
        { id: 2, roomId: 'main', kind: 'message', text: 'Manutenção às 22h', actor: 'Admin' },
        { id: 3, roomId: 'main', kind: 'ban', uid, minutes: 30, reason: 'trapaça', actor: 'Mod' },
        { id: 4, roomId: 'outra', kind: 'kick', uid, actor: 'Mod' },
      ]),
    );
    for (let i = 0; i < 2; i++) manager.tickAll();
    expect(conn.received).toContainEqual(expect.objectContaining({ type: 'playerMute', mode: 1, admin: 'Mod' }));
    expect(conn.received).toContainEqual(expect.objectContaining({ type: 'text', kind: 'admin', text: 'Admin: Manutenção às 22h' }));
    expect(conn.received).toContainEqual(expect.objectContaining({ type: 'playerKick', minutes: 30, admin: 'Mod' }));
    const acks = panel.takeAcks();
    expect(acks).toEqual([
      { id: 1, ok: true, target: { name: 'Visita*', ip: '10.1.2.3', device: 'ab'.repeat(16) } },
      { id: 2, ok: true },
      { id: 3, ok: true, target: { name: 'Visita*', ip: '10.1.2.3', device: 'ab'.repeat(16) } },
      { id: 4, ok: false, text: 'room is closed' },
    ]);
    expect(panel.takeAcks()).toEqual([]);
    panel.requeue(acks.slice(0, 1)); // heartbeat falhou: volta para a fila
    expect(panel.takeAcks()).toHaveLength(1);
    // o ban da sala vale também para a volta (mesmo dispositivo, outro nome e IP)
    for (let i = 0; i < 120; i++) manager.tickAll();
    expect(conn.closed).not.toBeNull();
    const again = room.join(new TestConnection(), { name: 'Outro', accountId: null, ip: '10.9.9.9', device: 'ab'.repeat(16) });
    expect(again.ok).toBe(false);
  });

  it('presets do painel: as salas abertas depois usam o preset novo', () => {
    const { manager, rotations, panel } = setup();
    panel.onReply(reply([], { presets: [{ id: 'sniper', description: 'Sniper', overrides: 'rocket_damage 250' }] }));
    expect(findPreset('sniper')).toMatchObject({ mode: 'casual', locked: false });
    const spawn = makeSpawner(manager, { mapsDir, rotations });
    const room = spawn('p-sniper', { name: 'Tiro', mode: 'casual', preset: 'sniper', maxPlayers: 8, persistent: false });
    expect(room?.presetId).toBe('sniper');
    // preset do painel com o id de um do jogo é ignorado
    panel.onReply(reply([], { version: 'v2', presets: [{ id: 'ranked', description: 'x', overrides: 'pups_max 80%' }] }));
    expect(findPreset('ranked')?.locked).toBe(true);
    expect(findPreset('sniper')).toBeUndefined();
  });

  it('rotação do painel: entra na próxima troca de mapa das salas fixas e nas salas novas', () => {
    const { manager, rotations, room, conn, panel } = setup();
    panel.onReply(reply([], { rotations: { casual: ['2 versus 2 (duel)', 'nao-existe'] } }));
    expect(rotations.casual).toEqual(['2 versus 2 (duel)']);
    expect(room.world.map.title).not.toBe(map('2 versus 2 (duel)')!.title);
    // admin força a troca de mapa: a rotação nova começa pelo primeiro mapa
    room.remoteCommand({ id: 9, kind: 'message', text: 'troca', actor: 'Admin' });
    const admin = room.join(new TestConnection(), { name: 'Adm', accountId: null, admin: true });
    if (!admin.ok) throw new Error(admin.text);
    room.handle(admin.pid, [message('chat', { text: '/forcemap', teamOnly: false })]);
    manager.tickAll();
    expect(room.world.map.title).toBe(map('2 versus 2 (duel)')!.title);
    expect(conn.received).toContainEqual(expect.objectContaining({ type: 'mapList', maps: [expect.objectContaining({ file: '2 versus 2 (duel)' })] }));
    // a mesma versão não reaplica
    panel.onReply(reply([], { rotations: { casual: ['outgun1'] } }));
    expect(rotations.casual).toEqual(['2 versus 2 (duel)']);
  });
});
