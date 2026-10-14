// SPDX-License-Identifier: GPL-2.0-or-later
// Gravação de replays (OG-090).
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodeReplayBody, message, PROTOCOL_VERSION, readReplayPrefix, REPLAY_VERSION, type Replay } from '@outgun/protocol';
import { GlibcRand } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import type { MatchReport } from './match-report.js';
import { ReplayStore } from './replay.js';
import { Room, type Connection } from './room.js';

const maps = loadMaps(fileURLToPath(new URL('../../../maps', import.meta.url)), ['outgun1']);
const silent: Connection = { send: () => {}, close: () => {} };

function setup(maxPlayers = 16) {
  const saved = new Map<string, Uint8Array>();
  const reports: MatchReport[] = [];
  const replays = { save: (key: string, data: Uint8Array) => (saved.set(key, data), `http://gs/replays/${key}.ogr`) };
  const r = new Room({ id: 'sala', preset: 'classic', maps, mapFiles: ['outgun1'], maxPlayers, seed: 5, replays, reportMatch: (m) => reports.push(m) });
  const join = (name: string) => {
    const res = r.join(silent, { name, accountId: null });
    if (!res.ok) throw new Error(res.reason);
    r.handle(res.pid, [message('clientReady', {})]);
    return res.pid;
  };
  return { r, join, saved, reports };
}

function read(data: Uint8Array): Replay {
  const prefix = readReplayPrefix(data);
  if (!prefix) throw new Error('não é replay');
  return decodeReplayBody(new Uint8Array(gunzipSync(prefix.body)), prefix.version, prefix.protocol);
}

describe('OG-090: gravação de replays', () => {
  it('grava a partida com versão no cabeçalho, estado inicial e um bloco por frame; o relatório leva a URL', () => {
    const { r, join, saved, reports } = setup(4);
    const a = join('Ana');
    join('Bia');
    r.settings.world.timeLimit = 60; // frames
    for (let i = 0; i < 100; i++) {
      r.handle(a, [message('input', { clientFrame: i & 255, controls: 8, gundir: 0 })]);
      r.tick();
    }
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report.replayUrl).toBe(`http://gs/replays/${report.serverMatchId}.ogr`);
    const replay = read(saved.get(report.serverMatchId)!);
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(replay.protocol).toBe(PROTOCOL_VERSION);
    expect(replay.header).toMatchObject({ roomId: 'sala', map: 'outgun1', mapTitle: maps[0]!.title, maxPlayers: 4, frames: replay.frames.length });
    expect(replay.init.map((m) => m.type)).toEqual(expect.arrayContaining(['mapChange', 'playersPresent', 'playerJoined', 'flagUpdate']));
    expect(replay.frames.length).toBeGreaterThanOrEqual(60);
    const frames = replay.frames.map((f) => f[0]!);
    expect(frames.every((m) => m.type === 'replayFrame')).toBe(true);
    const xs = frames.map((m) => (m.type === 'replayFrame' ? m.players.find((p) => p.pid === a)!.x : 0));
    expect(new Set(xs).size).toBeGreaterThan(1); // Ana andou
    expect(replay.frames.at(-1)!.map((m) => m.type)).toContain('statsReady'); // fim da partida gravado
  });

  it('sem gravador configurado, nada é gravado e o relatório não tem URL', () => {
    const reports: MatchReport[] = [];
    const r = new Room({ id: 's', preset: 'classic', maps, maxPlayers: 4, seed: 5, reportMatch: (m) => reports.push(m) });
    for (const name of ['Ana', 'Bia']) r.join(silent, { name, accountId: null });
    r.settings.world.timeLimit = 30;
    for (let i = 0; i < 60; i++) r.tick();
    expect(reports[0]?.replayUrl).toBeUndefined();
  });

  it('critério: 10 min com 16 jogadores em movimento e atirando cabem em 5 MB', () => {
    const { r, join, saved } = setup(16);
    const pids = Array.from({ length: 16 }, (_, i) => join(`J${i}`));
    const rng = new GlibcRand(9);
    r.settings.world.timeLimit = 6000; // 10 min
    r.settings.world.captureLimit = 0;
    const controls = pids.map(() => 0);
    for (let f = 0; f < 6000 + 20; f++) {
      pids.forEach((pid, i) => {
        if (rng.rand() % 10 === 0) controls[i] = rng.rand() % 32; // muda de direção ~1 vez por segundo
        r.handle(pid, [message('input', { clientFrame: f & 255, controls: controls[i]!, gundir: (rng.rand() % 8) * 256 }), message('fire', { on: rng.rand() % 4 === 0 })]);
      });
      r.tick();
    }
    const [data] = [...saved.values()];
    expect(data).toBeDefined();
    const replay = read(data!);
    expect(replay.header.frames).toBeGreaterThanOrEqual(6000);
    console.log(`replay de 10 min, 16 jogadores: ${(data!.length / 1e6).toFixed(2)} MB`);
    expect(data!.length).toBeLessThanOrEqual(5_000_000);
  }, 60_000);

  it('ReplayStore: grava, devolve a URL, recusa nomes inválidos e apaga pela retenção', () => {
    const dir = mkdtempSync(join(tmpdir(), 'replays-'));
    try {
      const store = new ReplayStore(dir, 'http://gs/replays', 30);
      expect(store.save('sala-1', new Uint8Array([1, 2, 3]))).toBe('http://gs/replays/sala-1.ogr');
      store.save('sala-2', new Uint8Array([4]));
      expect(store.path('sala-1.ogr')).toBe(join(dir, 'sala-1.ogr'));
      expect(store.path('../segredo.ogr')).toBeNull();
      const old = (Date.now() - 31 * 86_400_000) / 1000;
      utimesSync(join(dir, 'sala-1.ogr'), old, old);
      expect(store.prune()).toBe(1);
      expect(new ReplayStore(dir, 'http://gs/replays', 0).prune(Date.now() + 1e12)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
