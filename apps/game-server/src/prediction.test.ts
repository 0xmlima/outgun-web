// SPDX-License-Identifier: GPL-2.0-or-later
// Critérios do OG-064 com o servidor de verdade e clientes `@outgun/netcode` numa rede simulada
// (relógio virtual em ms): correções de predição por segundo e saltos no desenho a 60 quadros/s.
import { fileURLToPath } from 'node:url';
import { ClientSession, SimulatedLink, delta, type LinkConditions } from '@outgun/netcode';
import { decodeFrame, encodeFrame, type AnyMessage } from '@outgun/protocol';
import { CONTROL, type Position } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import { Room } from './room.js';

const MAPS = fileURLToPath(new URL('../../../_legacy/maps', import.meta.url));
const FILES = ['2 versus 2 (duel)'];
const maps = loadMaps(MAPS, FILES);

interface Player {
  pid: number;
  session: ClientSession;
  up: SimulatedLink<Uint8Array>;
  down: SimulatedLink<Uint8Array>;
  nextSend: number;
  nextChange: number;
  /** Último desenho de cada jogador visível: posição, velocidade (px/frame) e se estava vivo. */
  drawn: Map<number, { pos: Position; speed: number; dead: boolean }>;
}

interface Result {
  seconds: number;
  /** Correções por segundo de cada jogador. */
  correctionsPerSecond: number[];
  /** Saltos no desenho: deslocamento acima do esperado pela velocidade + 8 px. */
  teleports: number;
  /** Maior excesso de deslocamento entre dois quadros (px). */
  worstJump: number;
  renders: number;
  frameOffset: number[];
  averageLag: number[];
  lost: number;
}

/** Partida de `players` jogadores andando ao acaso por `seconds` s depois de 5 s de aquecimento. */
function play(conditions: LinkConditions, players: number, seconds: number, seed: number): Result {
  let now = 0;
  const room = new Room({ id: 't', preset: 'classic', maps, mapFiles: FILES, maxPlayers: 4, seed, now: () => now });
  let rand = seed;
  const random = () => ((rand = (Math.imul(rand, 1103515245) + 12345) >>> 0) / 0x100000000);
  const list: Player[] = [];
  for (let i = 0; i < players; i++) {
    const up = new SimulatedLink<Uint8Array>(conditions, seed * 10 + i * 2 + 1);
    const down = new SimulatedLink<Uint8Array>(conditions, seed * 10 + i * 2 + 2);
    const session: ClientSession = new ClientSession({
      send: (messages) => up.send(encodeFrame(...messages), now),
      onMapChange: (req) => session.setMap(maps[FILES.indexOf(req.file)]!),
    });
    const joined = room.join({ send: (data) => down.send(data, now), close: () => {} }, { name: `P${i}`, accountId: null });
    if (!joined.ok) throw new Error(joined.text);
    list.push({ pid: joined.pid, session, up, down, nextSend: 37 * i, nextChange: 0, drawn: new Map() });
  }

  const warmup = 5000;
  const end = warmup + seconds * 1000;
  let nextRender = 0;
  let teleports = 0;
  let worstJump = 0;
  let renders = 0;
  const corrections0: number[] = [];
  for (now = 0; now <= end; now++) {
    if (now === warmup) for (const p of list) corrections0.push(p.session.stats.corrections);
    for (const p of list) {
      for (const data of p.up.receive(now)) {
        const r = decodeFrame(data, 'c2s');
        if (r.ok) room.handle(p.pid, r.messages);
      }
      for (const data of p.down.receive(now)) {
        const r = decodeFrame(data, 's2c');
        if (!r.ok) throw new Error(r.error);
        p.session.handle(r.messages as AnyMessage[], now);
      }
    }
    if (now % 100 === 0) room.tick();
    for (const p of list) {
      if (now >= p.nextChange) {
        // movimento normal: uma direção ou diagonal, às vezes correndo, trocando a cada 0,5–2 s
        p.nextChange = now + 500 + random() * 1500;
        const dirs = [CONTROL.up, CONTROL.down, CONTROL.left, CONTROL.right];
        let c = dirs[Math.floor(random() * 4)]!;
        if (random() < 0.5) c |= dirs[Math.floor(random() * 4)]!;
        if (random() < 0.4) c |= CONTROL.run;
        p.session.setControls(c, now);
      }
      if (now >= p.nextSend) {
        p.nextSend += p.session.sendFrame(now);
        if (p.nextSend < now) p.nextSend = now;
      }
    }
    if (now >= nextRender) {
      nextRender += 1000 / 60;
      for (const p of list) {
        const fd = p.session.extrapolate(now);
        if (!fd) continue;
        for (const pl of fd.players) {
          if (!pl) continue;
          const prev = p.drawn.get(pl.pid);
          const speed = Math.hypot(pl.vel.x, pl.vel.y);
          if (prev && now > warmup && !prev.dead && !pl.dead) {
            const d = delta(pl.pos, prev.pos, fd.map);
            const allowed = (Math.max(prev.speed, speed) * (1000 / 60)) / 100;
            const excess = Math.hypot(d.x, d.y) - allowed;
            worstJump = Math.max(worstJump, excess);
            if (excess > 8) teleports++;
          }
          p.drawn.set(pl.pid, { pos: pl.pos.clone(), speed, dead: pl.dead });
        }
        for (const pid of p.drawn.keys()) if (!fd.players[pid]) p.drawn.delete(pid);
        if (now > warmup) renders++;
      }
    }
  }
  return {
    seconds,
    correctionsPerSecond: list.map((p, i) => (p.session.stats.corrections - (corrections0[i] ?? 0)) / seconds),
    teleports,
    worstJump,
    renders,
    frameOffset: list.map((p) => p.session.stats.frameOffset),
    averageLag: list.map((p) => p.session.stats.averageLag),
    lost: list.reduce((n, p) => n + p.up.lost + p.down.lost, 0),
  };
}

describe('predição e suavização (OG-064)', () => {
  it('sem latência nem perda: nenhuma correção', () => {
    const r = play({ rttMs: 0, jitterMs: 0, loss: 0 }, 2, 20, 3);
    expect(r.correctionsPerSecond.every((c) => c === 0)).toBe(true);
    expect(r.teleports).toBe(0);
  });

  it('150 ms de RTT e 2% de perda: menos de 1 correção por segundo e nenhum teleporte', () => {
    const r = play({ rttMs: 150, jitterMs: 20, loss: 0.02 }, 4, 60, 5);
    console.log('OG-064 150ms/2%:', JSON.stringify(r));
    expect(r.lost).toBeGreaterThan(0);
    const mean = r.correctionsPerSecond.reduce((a, b) => a + b, 0) / r.correctionsPerSecond.length;
    expect(mean).toBeLessThan(1);
    expect(r.teleports).toBe(0);
    // o envio se ajusta para chegar perto do meio do frame do servidor
    for (const off of r.frameOffset) expect(Math.abs(off - 0.5)).toBeLessThan(0.3);
    // atraso medido ≈ RTT (1,5 frame) + espera pelo frame
    for (const lag of r.averageLag) expect(lag).toBeGreaterThan(1.2);
  });
});
