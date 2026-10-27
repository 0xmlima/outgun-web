// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { RoomManager } from './rooms.js';
import { GameTelemetry } from './telemetry.js';

const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), ['outgun1']);

describe('GameTelemetry', () => {
  it('mede cada tick do processo e de cada sala', () => {
    const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
    const m = new RoomManager({ emptyTimeoutMs: 60_000, clock, seed: () => 1 });
    const telemetry = new GameTelemetry(m);
    m.observer = telemetry;
    m.create({ id: 'a', preset: 'classic', maps, maxPlayers: 16 });
    m.create({ id: 'b', preset: 'ranked', maps, maxPlayers: 16 });
    m.tickAll();
    m.tickAll();
    const text = telemetry.render();
    expect(text).toMatch(/^outgun_tick_duration_seconds_count 2$/m);
    expect(text).toMatch(/^outgun_room_tick_duration_seconds_count 4$/m);
    expect(text).toMatch(/^outgun_rooms\{mode="casual"\} 1$/m);
    expect(text).toMatch(/^outgun_players\{mode="casual"\} 0$/m);
  });

  it('uma sala que lança exceção não derruba as outras e conta como erro', () => {
    const m = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 1 });
    const telemetry = new GameTelemetry(m);
    m.observer = telemetry;
    const bad = m.create({ id: 'ruim', preset: 'classic', maps, maxPlayers: 16 });
    const good = m.create({ id: 'boa', preset: 'classic', maps, maxPlayers: 16 });
    bad.tick = () => {
      throw new Error('bug');
    };
    const before = good.frame;
    m.tickAll();
    expect(good.frame).toBe(before + 1);
    expect(telemetry.errors.get({ kind: 'tick' })).toBe(1);
  });

  it('conta WebSockets fechados por código e salas encerradas por motivo (OG-454)', () => {
    let t = 0;
    const clock = { now: () => t, setTimeout: () => 0, clearTimeout: () => {} };
    const m = new RoomManager({ emptyTimeoutMs: 1000, clock, seed: () => 1 });
    const telemetry = new GameTelemetry(m);
    m.observer = telemetry;
    telemetry.opened('player');
    telemetry.opened('player');
    telemetry.closed('player', 1006);
    telemetry.closed('player', 3999);
    expect(telemetry.wsClosed.get({ kind: 'player', code: '1006' })).toBe(1);
    expect(telemetry.wsClosed.get({ kind: 'player', code: 'other' })).toBe(1);
    m.create({ id: 'vazia', preset: 'classic', maps, maxPlayers: 16 });
    m.tickAll();
    t = 2000;
    m.tickAll();
    m.create({ id: 'outra', preset: 'classic', maps, maxPlayers: 16 });
    m.stop();
    expect(telemetry.roomsClosed.get({ reason: 'empty' })).toBe(1);
    expect(telemetry.roomsClosed.get({ reason: 'shutdown' })).toBe(1);
  });

  it('o alerta de p95 > 20 ms enxerga ticks lentos', () => {
    const m = new RoomManager({ emptyTimeoutMs: 60_000, seed: () => 1 });
    const telemetry = new GameTelemetry(m);
    for (let i = 0; i < 90; i++) telemetry.tick(3, 0);
    for (let i = 0; i < 10; i++) telemetry.tick(30, 0);
    expect(telemetry.tickDuration.quantile(0.95)).toBeGreaterThan(0.02);
  });
});
