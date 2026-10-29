// SPDX-License-Identifier: GPL-2.0-or-later
// Juiz da sala de treino (OG-490, RN-TRN-01/02): posicionar → contagem → jogar → resultado → reinício.
import { fileURLToPath } from 'node:url';
import { GlibcRand, PLAYER_RADIUS, Position } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import { loadMaps } from './maps.js';
import {
  ATTEMPT_LIMIT_FRAMES,
  COUNTDOWN_FRAMES,
  outOfBaseRoom,
  Placement,
  RESULT_FRAMES,
  TrainingSession,
  type TrainingAnnouncement,
  type TrainingConfig,
  type TrainingModeDef,
  type TrainingPlayer,
  type TrainingWorld,
} from './training.js';

const MAP_NAMES = ['2 versus 2 (duel)', '3x3 (duel)', 'cebs park', 'pari2', 'the cover 4'];
const maps = loadMaps(fileURLToPath(new URL('../../../_legacy/maps', import.meta.url)), MAP_NAMES);
const config: TrainingConfig = { mode: 'attack', bots: 1, allies: 0, level: 3, powerups: false, sameStart: false };

/** Modo de teste: um bot de guarda; falha quando quem treina morre, sucesso quando sai da sala da base inimiga. */
const testMode: TrainingModeDef = {
  roster: () => [{ team: 1, role: 'guard' }],
  place: (ctx, players) => new Map(players.map((p) => [p.pid, ctx.spot(ctx.baseRoom(p.team === 0 ? 1 : 1))])),
  judge: (world, ev) => {
    if (ev.kind === 'death' && world.players().find((p) => p.pid === ev.pid)?.bot === false) return { success: false, reason: 'died' };
    const me = world.players().find((p) => !p.bot);
    if (ev.kind === 'frame' && me && outOfBaseRoom(world.map, 1, me.pos)) return { success: true, reason: 'flagOut' };
    return null;
  },
};

function fixture() {
  const map = maps[0]!;
  let frame = 0;
  const players: TrainingPlayer[] = [{ pid: 0, team: 0, bot: false, role: null, dead: false, ready: true, pos: new Position(0, 0, 100, 100), carrying: null }];
  const world: TrainingWorld = {
    map,
    get frame() {
      return frame;
    },
    players: () => players,
    flag: () => null,
  };
  const log: TrainingAnnouncement[] = [];
  const placed: { pid: number; fresh: boolean }[] = [];
  let bots: number[] = [];
  const session = new TrainingSession(
    config,
    testMode,
    world,
    {
      setBots: (slots) => (bots = slots.map((_, i) => 10 + i)),
      place: (pid, pos, _safe, fresh) => {
        placed.push({ pid, fresh });
        const p = players.find((x) => x.pid === pid);
        if (p) {
          p.pos = pos;
          p.dead = false;
        }
      },
      resetFlags: () => {},
      announce: (s) => log.push(s),
      holdRespawn: () => {},
    },
    7,
  );
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      session.tick();
      frame++;
    }
  };
  return { session, players, log, placed, step, bots: () => bots, map };
}

describe('TrainingSession', () => {
  it('espera quem treina, posiciona, conta e solta', () => {
    const f = fixture();
    f.players[0]!.ready = false;
    f.step(5);
    expect(f.session.phase).toBe('idle');
    expect(f.log).toEqual([]);
    f.players[0]!.ready = true;
    f.step();
    expect(f.session.phase).toBe('countdown');
    expect(f.bots()).toEqual([10]);
    expect(f.placed[0]).toEqual({ pid: 0, fresh: true });
    expect(f.log.map((s) => [s.phase, s.seconds])).toEqual([['countdown', 3]]);
    f.step(COUNTDOWN_FRAMES);
    expect(f.log.map((s) => [s.phase, s.seconds])).toEqual([
      ['countdown', 3],
      ['countdown', 2],
      ['countdown', 1],
      ['playing', 0],
    ]);
    // durante a contagem todos ficam presos no ponto (sem renascer de novo)
    expect(f.placed.filter((p) => p.fresh)).toHaveLength(1);
    expect(f.placed.length).toBeGreaterThan(COUNTDOWN_FRAMES - 2);
  });

  it('falha, mostra o resultado e reinicia sozinho', () => {
    const f = fixture();
    f.step(1 + COUNTDOWN_FRAMES + 15);
    f.players[0]!.dead = true;
    f.session.event({ kind: 'death', pid: 0 });
    expect(f.session.phase).toBe('result');
    const res = f.log.at(-1)!;
    expect([res.result, res.reason, res.attempts, res.successes]).toEqual(['fail', 'died', 1, 0]);
    expect(res.tenths).toBeGreaterThan(10);
    f.step(RESULT_FRAMES + 1);
    expect(f.session.phase).toBe('countdown');
    expect(f.placed.filter((p) => p.fresh)).toHaveLength(2);
  });

  it('sucesso pela condição do modo, checada a cada frame', () => {
    const f = fixture();
    f.step(1 + COUNTDOWN_FRAMES);
    const base = new Placement(f.map, new GlibcRand(1), config).baseRoom(1);
    f.players[0]!.pos = new Position(base.x === 0 ? 1 : 0, base.y, 100, 100);
    f.step();
    expect(f.log.at(-1)).toMatchObject({ phase: 'result', result: 'success', reason: 'flagOut', successes: 1 });
  });

  it('tentativa sem fim falha por tempo', () => {
    const f = fixture();
    f.step(1 + COUNTDOWN_FRAMES + ATTEMPT_LIMIT_FRAMES + 1);
    expect(f.log.at(-1)).toMatchObject({ phase: 'result', result: 'fail', reason: 'timeout' });
  });

  it('morte fora da tentativa não conta', () => {
    const f = fixture();
    f.step(2);
    f.session.event({ kind: 'death', pid: 0 });
    expect(f.session.phase).toBe('countdown');
    expect(f.session.attempts).toBe(0);
  });
});

describe('Placement nos mapas de treino', () => {
  it.each(MAP_NAMES.map((n, i) => [n, i] as const))('%s: bases, caminho e pontos livres', (_name, i) => {
    const map = maps[i]!;
    const ctx = new Placement(map, new GlibcRand(3), config);
    const red = ctx.baseRoom(0);
    const blue = ctx.baseRoom(1);
    const near = ctx.roomOnPath(1, 0, 1);
    expect(Math.abs(near.x - blue.x) + Math.abs(near.y - blue.y)).toBe(red.x === blue.x && red.y === blue.y ? 0 : 1);
    for (let k = 0; k < 6; k++) {
      const p = ctx.spot(blue);
      expect([p.roomX, p.roomY]).toEqual([blue.x, blue.y]);
      expect(map.fallOnWallCirc({ room: blue, x: p.x, y: p.y }, PLAYER_RADIUS)).toBe(false);
    }
    expect(outOfBaseRoom(map, 1, ctx.flagSpot(1))).toBe(false);
  });
});
