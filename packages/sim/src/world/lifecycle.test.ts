// SPDX-License-Identifier: GPL-2.0-or-later
// Ciclo da partida (OG-029): respawn, reinício do mapa e limites de tempo. A paridade frame a frame
// está nos traces respawn-order, match-* e bots-match; aqui ficam os eventos e casos-limite.
import { codeDefaults, type GameSettings } from '@outgun/settings';
import { describe, expect, it } from 'vitest';
import { GameMap } from '../map/map.js';
import { respawnTime, ServerSim } from './server.js';
import { PlayerState, Position, WorldState, type GameOverReason } from './state.js';

function setup(configure: (s: GameSettings, map: GameMap) => void = () => {}, rand: () => number = () => 0) {
  const settings = codeDefaults();
  const map = new GameMap(3, 2, 'teste', '', 0);
  map.teams[0].flags.push({ room: { x: 0, y: 0 }, x: 236, y: 177 });
  map.teams[1].flags.push({ room: { x: 2, y: 0 }, x: 236, y: 177 });
  configure(settings, map);
  const world = new WorldState(map, 16);
  world.time = 100;
  world.frame = 1000;
  const events: string[] = [];
  const sim = new ServerSim(world, settings, { rand }, {
    timeWarning: (s) => events.push(`aviso ${s}`),
    normalTimeOut: (sd) => events.push(`fim do tempo normal${sd ? ' (morte súbita)' : ''}`),
    extraTimePeriodStarted: (p) => events.push(`prorrogação ${p}`),
    gameOver: (r: GameOverReason) => events.push(`fim: ${r}`),
    playerSpawned: (pid) => events.push(`nasceu ${pid}`),
  });
  sim.loadMapFlags();
  return { settings, map, world, sim, events };
}

function addPlayer(world: WorldState, pid: number): PlayerState {
  const pl = new PlayerState(pid, world.teamOf(pid));
  pl.pos = new Position(1, 1, 100, 100);
  pl.stats.dead = false;
  world.players[pid] = pl;
  return pl;
}

describe('respawn (respawnPlayer)', () => {
  it('no início do mapa usa os pontos de spawn em rodízio, começando pelo segundo', () => {
    const { world, sim, map } = setup((_, m) => {
      m.teams[0].spawn.push({ room: { x: 0, y: 0 }, x: 10, y: 20 }, { room: { x: 0, y: 1 }, x: 30, y: 40 });
    });
    const pl = addPlayer(world, 0);
    const spots: number[][] = [];
    for (let i = 0; i < 3; i++) {
      pl.respawnToBase = true;
      pl.dead = true;
      pl.stats.dead = true;
      sim.respawnPlayer(0);
      spots.push([pl.pos.roomY, pl.pos.x]);
    }
    expect(spots).toEqual([
      [1, 30],
      [0, 10],
      [1, 30],
    ]);
    expect(map.teams[0].spawn).toHaveLength(2);
    expect(pl.respawnToBase).toBe(false);
  });

  it('sem pontos de spawn, cai na área de respawn ou numa sala desocupada', () => {
    const values = [1, 5, 7];
    const { world, sim } = setup(
      (_, m) => m.teams[1].respawn.push({ room: { x: 2, y: 1 }, x1: 100, y1: 100, x2: 110, y2: 120 }, { room: { x: 2, y: 0 }, x1: 50, y1: 50, x2: 60, y2: 60 }),
      () => values.shift() ?? 0,
    );
    const pl = addPlayer(world, 8);
    pl.respawnToBase = true; // ignorado: o time não tem pontos de spawn
    sim.respawnPlayer(8);
    expect([pl.pos.roomX, pl.pos.roomY, pl.pos.x, pl.pos.y]).toEqual([2, 0, 55, 57]);

    // time 0 sem áreas: sala sorteada evitando as ocupadas (o jogador 8 está na sala 2,0)
    const rolls = [2, 3, 0, 0];
    const free = setup(undefined, () => rolls.shift() ?? 0);
    const other = addPlayer(free.world, 8);
    other.pos = new Position(2, 0, 50, 50);
    const red = addPlayer(free.world, 0);
    red.pos = new Position(0, 1, 50, 50); // a própria posição também conta como ocupada
    free.sim.respawnPlayer(0);
    expect([red.pos.roomX, red.pos.roomY, red.pos.x, red.pos.y]).toEqual([0, 0, 15, 15]); // sorteou 2 e 3 (ocupadas), depois 0
  });

  it('aplica vida, energia, power-ups iniciais e proteção de spawn', () => {
    const { world, sim, events } = setup((s) => {
      Object.assign(s.world, { startHealth: 150, startEnergy: 50, spawnSafeTime: 1.5 });
      Object.assign(s.powerups, { startShield: true, startTurbo: 10, startWeapon: 3 });
    });
    const pl = addPlayer(world, 0);
    pl.dead = true;
    pl.stats.dead = true;
    sim.respawnPlayer(0);
    expect(pl.dead).toBe(false);
    expect([pl.health, pl.energy, pl.shield, pl.weapon, pl.turbo, pl.turboTime]).toEqual([150, 50, 1, 3, true, 110]);
    expect([pl.nextShootFrame, pl.startTakeDamageFrame]).toEqual([1015, 1015]);
    expect(pl.stats.spawnTime).toBe(100);
    expect(events).toEqual(['nasceu 0']);
  });

  it('tempo de respawn: equilíbrio para o time maior e extra de quem está sozinho', () => {
    const settings = codeDefaults();
    Object.assign(settings.world, { respawnTime: 2, respawnBalancingTime: 2, extraRespawnTimeAlone: 1 });
    expect(respawnTime(settings, 2, 1)).toEqual([2, 3]);
    expect(respawnTime(settings, 3, 2)).toEqual([2, 2]);
    expect(respawnTime(settings, 1, 0)).toEqual([2, 1]);
  });
});

describe('reinício do mapa', () => {
  it('changeMap zera placar e itens e deixa todos mortos esperando na base', () => {
    const { world, sim, map } = setup((_, m) => m.teams[0].spawn.push({ room: { x: 0, y: 0 }, x: 10, y: 20 }));
    const pl = addPlayer(world, 0);
    pl.stats.frags = 5;
    pl.stats.startTime = 3;
    world.teams[0].score = 4;
    world.items[0]!.kind = 2;
    world.rockets[0]!.owner = 0;
    sim.changeMap(map);
    expect(world.mapStartFrame).toBe(1000);
    expect(world.teams[0].score).toBe(0);
    expect(world.items[0]!.kind).toBe(7);
    expect(world.rockets[0]!.owner).toBe(-1);
    expect([pl.dead, pl.respawnToBase, pl.framesToRespawn, pl.extraFramesToRespawn]).toEqual([true, true, 0, 0]);
    expect([pl.stats.frags, pl.stats.startTime]).toEqual([0, 3]);
    expect([pl.pos.roomX, pl.pos.x]).toEqual([0, 10]);
  });
});

/** Morto sem renascer durante o teste. */
function waitForever(pl: PlayerState): void {
  pl.dead = true;
  pl.framesToRespawn = 1e9;
}

describe('limites de tempo', () => {
  /** Simula o fim de frame em cada `mapTime` pedido e devolve os eventos. */
  function run(configure: (s: GameSettings) => void, frames: number[], scores: [number, number] = [0, 0]) {
    const ctx = setup(configure);
    for (const pid of [0, 8]) waitForever(addPlayer(ctx.world, pid));
    ctx.world.mapStartFrame = 0;
    ctx.world.teams[0].score = scores[0];
    ctx.world.teams[1].score = scores[1];
    for (const f of frames) {
      ctx.world.frame = f;
      ctx.sim.simulateFrame();
    }
    return ctx;
  }

  it('avisos de 5 min, 1 min e 30 s conforme o tamanho do limite', () => {
    expect(run((s) => (s.world.timeLimit = 6000), [3000, 5400, 5700]).events).toEqual(['aviso 300', 'aviso 60', 'aviso 30']);
    expect(run((s) => (s.world.timeLimit = 600), [300, 0]).events).toEqual(['aviso 30']);
  });

  it('sem empate o tempo acaba; empate sem prorrogação nem morte súbita também', () => {
    expect(run((s) => (s.world.timeLimit = 600), [600], [1, 0]).events).toEqual(['fim: timeOut']);
    expect(run((s) => (s.world.timeLimit = 600), [600]).events).toEqual(['fim: timeOut']);
  });

  it('empate com morte súbita: o tempo normal acaba e a partida continua', () => {
    const { events, world } = run((s) => Object.assign(s.world, { timeLimit: 600, suddenDeath: true }), [600, 700]);
    expect(events).toEqual(['fim do tempo normal (morte súbita)']);
    expect(world.gameOver).toBeNull(); // a captura com morte súbita está em flags.test.ts e match-sudden-death
  });

  it('prorrogação em períodos enquanto houver empate', () => {
    const { events, world } = run((s) => Object.assign(s.world, { timeLimit: 600, extraTime: 600, extraTimePeriods: 2 }), [600, 1200, 1800]);
    expect(events).toEqual(['fim do tempo normal', 'prorrogação 2', 'fim: extraTimeOut']);
    expect(world.gameOver).toBe('extraTimeOut');
  });

  it('sozinho no servidor não há limite de tempo', () => {
    const ctx = setup((s) => (s.world.timeLimit = 600));
    waitForever(addPlayer(ctx.world, 0));
    ctx.world.mapStartFrame = 0;
    ctx.world.frame = 600;
    ctx.sim.simulateFrame();
    expect(ctx.events).toEqual([]);
  });
});
