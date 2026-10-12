// SPDX-License-Identifier: GPL-2.0-or-later
// Tabela de frags (PLAN 6.8, RN-PTS-01) e pontos negativos (RN-PTS-02), uma linha por teste. As
// mesmas regras são conferidas frame a frame contra o original nos traces (bots-match, flag-*).
import { codeDefaults, type GameSettings } from '@outgun/settings';
import { describe, expect, it } from 'vitest';
import { GameMap } from '../map/map.js';
import { DamageType, ServerSim } from './server.js';
import { finishMatch } from './stats.js';
import { CarriedFlag, FlagState, PlayerState, Position, WorldState } from './state.js';

/** Mapa 3×1: base vermelha na sala 0, sala 1 neutra (onde acontecem as mortes), base azul na sala 2. */
function setup(configure: (s: GameSettings) => void = () => {}, wild = false) {
  const settings = codeDefaults();
  configure(settings);
  const map = new GameMap(3, 1, 'teste', '', 0);
  map.teams[0].flags.push({ room: { x: 0, y: 0 }, x: 236, y: 177 });
  map.teams[1].flags.push({ room: { x: 2, y: 0 }, x: 236, y: 177 });
  if (wild) map.wildFlags.push({ room: { x: 1, y: 0 }, x: 400, y: 300 });
  const world = new WorldState(map, 16);
  world.time = 100;
  world.frame = 1000;
  const frags = new Map<number, number>();
  const negs = new Map<number, number>();
  const sim = new ServerSim(world, settings, { rand: () => 0 }, {
    scoreFrag: (pid, n) => frags.set(pid, (frags.get(pid) ?? 0) + n),
    scoreNeg: (pid, n) => negs.set(pid, (negs.get(pid) ?? 0) + n),
  });
  sim.loadMapFlags();
  const add = (pid: number, room = 1, x = 100, y = 100) => {
    const pl = new PlayerState(pid, world.teamOf(pid));
    pl.pos = new Position(room, 0, x, y);
    pl.stats.dead = false;
    world.players[pid] = pl;
    return pl;
  };
  /** Dá a bandeira `flagTeam` (0, 1, 2) ao jogador. */
  const give = (pid: number, flagTeam: number) => {
    (world.flagsOf(flagTeam)[0] as FlagState).take(pid, 0);
    (world.players[pid] as PlayerState).stats.carriedFlag = flagTeam === 2 ? CarriedFlag.Wild : flagTeam === world.teamOf(pid) ? CarriedFlag.Own : CarriedFlag.Enemy;
  };
  /** Larga a bandeira `flagTeam` na sala 1. */
  const lieInRoom = (flagTeam: number) => {
    const f = world.flagsOf(flagTeam)[0] as FlagState;
    f.take(15, 0);
    f.dropAt(new Position(1, 0, 300, 300));
    f.forgetCarrier(15);
  };
  const kill = (target: number, attacker: number) => sim.damagePlayer(target, attacker, 10000, DamageType.rocket);
  return { settings, world, sim, frags, negs, add, give, lieInRoom, kill };
}

describe('frags (RN-PTS-01)', () => {
  it('matar inimigo: +1', () => {
    const t = setup();
    t.add(0);
    t.add(8);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(1);
  });

  it('matar aliado: −2', () => {
    const t = setup();
    t.add(0);
    t.add(1);
    t.kill(1, 0);
    expect(t.frags.get(0)).toBe(-2);
  });

  it('defesa do portador: inimigo morto na sala de um aliado com bandeira, +1 uma vez só', () => {
    const t = setup(undefined, true);
    t.add(0);
    t.add(1);
    t.add(2);
    t.add(8);
    t.give(1, 1);
    t.give(2, 2);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(2);
  });

  it('defesa da bandeira: inimigo morto na sala com a própria bandeira no chão, +1', () => {
    const t = setup();
    t.add(0);
    t.add(8);
    t.lieInRoom(0);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(2);
  });

  it('ataque: inimigo morto na sala com a bandeira dele no chão, +1', () => {
    const t = setup();
    t.add(0);
    t.add(8);
    t.lieInRoom(1);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(2);
  });

  it('os três bônus de sala não se somam', () => {
    const t = setup();
    t.add(0);
    t.add(1);
    t.add(8);
    t.lieInRoom(0);
    t.lieInRoom(1);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(2);
    const u = setup();
    u.add(0);
    u.add(1);
    u.add(8);
    u.lieInRoom(0);
    u.give(1, 1); // portador aliado na sala (com a bandeira inimiga, que já não está no chão)
    u.kill(8, 0);
    expect(u.frags.get(0)).toBe(2);
  });

  it('com lock_team_flags em efeito não há bônus de bandeira no chão', () => {
    const t = setup((s) => (s.world.lockTeamFlags = true), true);
    t.add(0);
    t.add(8);
    t.lieInRoom(0);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(1);
  });

  it('matar portador inimigo: +1 extra e conta portador morto', () => {
    const t = setup();
    const a = t.add(0);
    t.add(8);
    t.give(8, 0);
    t.kill(8, 0);
    expect(t.frags.get(0)).toBe(2);
    expect(a.stats.carriersKilled).toBe(1);
  });

  it('matar portador aliado: −1 extra', () => {
    const t = setup();
    t.add(0);
    t.add(1);
    t.give(1, 1);
    t.kill(1, 0);
    expect(t.frags.get(0)).toBe(-3);
  });

  it('pegar +1, largar de propósito −1 (morrer não desfaz)', () => {
    const t = setup();
    const pl = t.add(0, 2, 236, 177);
    t.sim.postPhysics(pl);
    expect(t.frags.get(0)).toBe(1);
    t.sim.setDropKey(0, true);
    expect(t.frags.get(0)).toBe(0);
    const u = setup();
    u.add(0);
    u.add(8);
    u.give(8, 0);
    u.kill(8, 0);
    expect(u.frags.get(8) ?? 0).toBe(0);
  });

  it('devolver a própria bandeira: +1', () => {
    const t = setup();
    const pl = t.add(0, 1, 300, 300);
    t.lieInRoom(0);
    t.sim.postPhysics(pl);
    expect(t.frags.get(0)).toBe(1);
  });

  it('captura: +3 capturador, +3 assistente, +2 para cada um do time; −1 de ranking para o adversário', () => {
    const t = setup();
    const carrier = t.add(0, 0, 246, 177);
    t.add(1);
    t.add(8);
    t.add(9);
    const blue = t.world.teams[1].flags[0] as FlagState;
    blue.take(1, 0);
    blue.dropAt(new Position(1, 0, 10, 10));
    blue.take(0, 0); // o 1 é o portador anterior: assistente
    carrier.stats.carriedFlag = CarriedFlag.Enemy;
    t.sim.postPhysics(carrier);
    expect([t.frags.get(0), t.frags.get(1), t.frags.get(8), t.frags.get(9)]).toEqual([5, 5, undefined, undefined]);
    expect([t.negs.get(8), t.negs.get(9), t.negs.get(0)]).toEqual([1, 1, undefined]);
  });

  it('captura de bandeira selvagem não dá ponto negativo ao adversário', () => {
    const t = setup(undefined, true);
    const carrier = t.add(0, 0, 246, 177);
    t.add(8);
    t.give(0, 2);
    t.sim.postPhysics(carrier);
    expect(t.world.teams[0].score).toBe(1);
    expect(t.negs.get(8)).toBeUndefined();
  });

  it('suicídio: −1 frag, morte e suicídio', () => {
    const t = setup();
    const pl = t.add(0);
    t.add(8);
    t.sim.suicide(0);
    expect(t.frags.get(0)).toBe(-1);
    expect([pl.stats.deaths, pl.stats.suicides, t.world.teams[0].suicides, t.world.teams[0].deaths]).toEqual([1, 1, 1, 1]);
  });

  it('ponto por posse de bandeira selvagem: +2 para o time, −1 de ranking para o outro', () => {
    const t = setup((s) => (s.world.carryingScoreTime = 1), true);
    t.world.teams[0].flags = [];
    t.world.teams[1].flags = [];
    const pl = t.add(0);
    pl.dead = true; // só a contagem de posse importa aqui
    pl.framesToRespawn = 1e9;
    t.add(8).dead = true;
    (t.world.players[8] as PlayerState).framesToRespawn = 1e9;
    t.give(0, 2);
    for (let i = 0; i < 10; i++) t.sim.simulateFrame();
    expect(t.world.teams[0].score).toBe(1);
    expect([t.frags.get(0), t.negs.get(8)]).toEqual([2, 1]);
  });
});

describe('pontos negativos (RN-PTS-02)', () => {
  it('morrer: +1; morrer com bandeira: +1 extra', () => {
    const t = setup();
    t.add(0);
    t.add(8);
    t.add(9);
    t.kill(8, 0);
    t.give(9, 0);
    t.kill(9, 0);
    expect([t.negs.get(8), t.negs.get(9)]).toEqual([1, 2]);
  });
});

describe('resultado da partida', () => {
  it('fecha vida e posse em andamento e ordena vermelhos antes, por frags', () => {
    const t = setup();
    const a = t.add(0);
    const b = t.add(1);
    const c = t.add(8);
    a.stats.spawnTime = 40;
    a.stats.frags = 1;
    b.stats.frags = 5;
    c.stats.frags = 9;
    a.stats.shots = 4;
    a.stats.hits = 1;
    a.stats.movement = 300;
    t.give(0, 1);
    a.stats.flagTakeTime = 90;
    t.world.teams[0].score = 2;
    t.world.mapStartFrame = 0;
    const r = finishMatch(t.world, 'timeOut', 100);
    expect(r.players.map((p) => p.pid)).toEqual([1, 0, 8]);
    expect(r.winner).toBe(0);
    expect(r.mapTime).toBe(100);
    const p0 = r.players[1]!;
    expect([p0.lifetime, p0.flagCarryingTime, p0.accuracy, p0.movement, p0.speed]).toEqual([60, 10, 0.25, 10, 10 / 60]);
    expect(a.stats.dead).toBe(true);
    expect(a.stats.carriedFlag).toBe(CarriedFlag.None);
  });

  it('o gameOver entrega o resultado antes do reinício', () => {
    const t = setup((s) => (s.world.captureLimit = 1));
    let mapTime = -1;
    t.sim.hooks.gameOver = (reason, result) => {
      expect(reason).toBe('captureLimit');
      mapTime = result.mapTime;
      expect(result.teams[0].captures).toHaveLength(1);
    };
    t.world.mapStartFrame = 400;
    const carrier = t.add(0, 0, 246, 177);
    t.give(0, 1);
    t.sim.postPhysics(carrier);
    expect(mapTime).toBe(60);
  });
});
