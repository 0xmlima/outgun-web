// SPDX-License-Identifier: GPL-2.0-or-later
// Tabela de capturas de `simulatePlayerPostPhysics` (src/world.cpp:3330-3348) e variantes de modo.
// O comportamento frame a frame é conferido contra o original nos traces flag-*; aqui ficam as
// combinações que não cabem em traces (todas as linhas da tabela × settings).
import { codeDefaults, type GameSettings } from '@outgun/settings';
import { describe, expect, it } from 'vitest';
import { GameMap } from '../map/map.js';
import { ServerSim } from './server.js';
import { CarriedFlag, FlagState, PlayerState, Position, WorldState } from './state.js';

type Kind = 'own' | 'enemy' | 'wild';

/** Mapa 3×1: sala 0 base vermelha, sala 1 base selvagem, sala 2 base azul (todas no centro). */
function flagMap(withWild = true): GameMap {
  const map = new GameMap(3, 1, 'teste', '', 0);
  map.teams[0].flags.push({ room: { x: 0, y: 0 }, x: 236, y: 177 });
  map.teams[1].flags.push({ room: { x: 2, y: 0 }, x: 236, y: 177 });
  if (withWild) map.wildFlags.push({ room: { x: 1, y: 0 }, x: 236, y: 177 });
  return map;
}

const baseRoom = { own: 0, wild: 1, enemy: 2 } as const;
const flagTeam = { own: 0, enemy: 1, wild: 2 } as const;
const carriedType = { own: CarriedFlag.Own, enemy: CarriedFlag.Enemy, wild: CarriedFlag.Wild } as const;

interface Setup {
  settings?: (s: GameSettings) => void;
  withWild?: boolean;
}

function world(setup: Setup = {}) {
  const settings = codeDefaults();
  setup.settings?.(settings);
  const w = new WorldState(flagMap(setup.withWild ?? true), 16);
  // com tempo 0, deathbringerEnd 0 contaria como "sob efeito" e bloquearia as bandeiras
  w.time = 100;
  w.frame = 1000;
  const sim = new ServerSim(w, settings, { rand: () => 0 });
  sim.loadMapFlags();
  const captures: { pid: number; flagTeam: number; assist: number }[] = [];
  sim.hooks.flagCaptured = (pid, team, assist) => captures.push({ pid, flagTeam: team, assist });
  return { w, sim, settings, captures };
}

function addPlayer(w: WorldState, pid: number, room: number, x: number, y: number): PlayerState {
  const pl = new PlayerState(pid, w.teamOf(pid));
  pl.pos = new Position(room, 0, x, y);
  pl.stats.dead = false;
  w.players[pid] = pl;
  return pl;
}

/**
 * O vermelho 0 carrega a bandeira `carried` e está 10 px ao lado da base `base`, onde está a
 * bandeira `target` (na base, se for a dela; senão largada ali). Simula o fim do frame do portador.
 */
function tryRow(carried: Kind, target: Kind, base: Kind, setup: Setup = {}) {
  const ctx = world(setup);
  const { w, sim } = ctx;
  w.time = 100;
  w.frame = 1000;
  const room = baseRoom[base];
  const carrier = addPlayer(w, 0, room, 246, 177);
  const carriedFlag = w.flagsOf(flagTeam[carried])[0] as FlagState;
  carriedFlag.take(0, 0); // pegou há muito tempo (min_capture_time não atrapalha)
  carrier.stats.carriedFlag = carriedType[carried];
  const targetFlag = w.flagsOf(flagTeam[target])[0] as FlagState;
  if (baseRoom[target] !== room) {
    targetFlag.take(5, 0);
    targetFlag.dropAt(new Position(room, 0, 236, 177));
    targetFlag.forgetCarrier(5); // quem largou já saiu (resetCarrierData): sem assistente
  }
  sim.postPhysics(carrier);
  return ctx;
}

// Linhas da tabela do original; "reverse": a bandeira-alvo é a capturada.
const TABLE: { carried: Kind; target: Kind; base: Kind; real: boolean; reverse?: boolean }[] = [
  { carried: 'enemy', target: 'own', base: 'own', real: true },
  { carried: 'enemy', target: 'own', base: 'enemy', real: false },
  { carried: 'enemy', target: 'wild', base: 'wild', real: true },
  { carried: 'enemy', target: 'wild', base: 'enemy', real: false },
  { carried: 'own', target: 'enemy', base: 'own', real: true, reverse: true },
  { carried: 'own', target: 'enemy', base: 'enemy', real: false },
  { carried: 'own', target: 'wild', base: 'own', real: true, reverse: true },
  { carried: 'own', target: 'wild', base: 'wild', real: false },
  { carried: 'wild', target: 'own', base: 'own', real: true },
  { carried: 'wild', target: 'own', base: 'wild', real: false },
  { carried: 'wild', target: 'enemy', base: 'wild', real: true, reverse: true },
  { carried: 'wild', target: 'enemy', base: 'enemy', real: false },
  { carried: 'wild', target: 'wild', base: 'wild', real: false }, // só há uma selvagem: não captura nela mesma
];

type Row = (typeof TABLE)[number];

/** `reachable`: sem carry_own_team_flag ninguém carrega a própria bandeira (linhas não testadas). */
const MODES: { name: string; settings: (s: GameSettings) => void; allows: (row: Row) => boolean; reachable?: (row: Row) => boolean }[] = [
  {
    name: 'tudo liberado',
    settings: (s) => Object.assign(s.world, { carryOwnTeamFlag: true, captureOnTeamFlag: true, captureOnWildFlag: true }),
    allows: () => true,
  },
  {
    name: 'sem capture_on_wild_flag',
    settings: (s) => Object.assign(s.world, { carryOwnTeamFlag: true, captureOnTeamFlag: true, captureOnWildFlag: false }),
    allows: (row) => row.base !== 'wild',
  },
  {
    name: 'sem capture_on_team_flag',
    settings: (s) => Object.assign(s.world, { carryOwnTeamFlag: true, captureOnTeamFlag: false, captureOnWildFlag: true }),
    allows: (row) => row.base !== 'own',
  },
  {
    name: 'sem carry_own_team_flag (padrão)',
    settings: (s) => Object.assign(s.world, { carryOwnTeamFlag: false, captureOnTeamFlag: true, captureOnWildFlag: true }),
    allows: () => true,
    reachable: (row) => row.carried !== 'own',
  },
];

describe('tabela de capturas (try_capture)', () => {
  for (const mode of MODES) {
    describe(mode.name, () => {
      for (const row of TABLE.filter((r) => mode.reachable?.(r) ?? true)) {
        const expected = row.real && mode.allows(row);
        it(`${row.carried} → ${row.target} na base ${row.base}: ${expected ? 'captura' : 'não captura'}`, () => {
          const { w, captures } = tryRow(row.carried, row.target, row.base, { settings: mode.settings });
          expect(captures.length).toBe(expected ? 1 : 0);
          expect(w.teams[0].score).toBe(expected ? 1 : 0);
          if (!expected) return;
          const captured = row.reverse ? row.target : row.carried;
          expect(captures[0]?.flagTeam).toBe(flagTeam[captured]);
          // tudo volta para a base e o portador fica sem bandeira
          expect(w.players[0]?.stats.carriedFlag).toBe(CarriedFlag.None);
          for (const t of [0, 1, 2]) for (const f of w.flagsOf(t)) expect(f.status).not.toBe('carried');
        });
      }
    });
  }

  it('sem os três tipos de bandeira, a captura em bandeira de time vale mesmo com capture_on_team_flag 0', () => {
    const { captures } = tryRow('enemy', 'own', 'own', { withWild: false, settings: (s) => (s.world.captureOnTeamFlag = false) });
    expect(captures).toHaveLength(1);
  });

  it('capture_away_from_base: a bandeira do time não precisa estar na base', () => {
    for (const away of [false, true]) {
      const { w, sim, captures } = world({ settings: (s) => (s.world.captureAwayFromBase = away) });
      w.time = 100;
      const carrier = addPlayer(w, 0, 0, 100, 100);
      (w.teams[1].flags[0] as FlagState).take(0, 0);
      carrier.stats.carriedFlag = CarriedFlag.Enemy;
      const own = w.teams[0].flags[0] as FlagState;
      own.take(5, 0);
      own.dropAt(new Position(0, 0, 110, 100));
      own.forgetCarrier(5);
      own.dropTime = 100; // largada agora: a devolução automática por toque ainda não vale
      sim.postPhysics(carrier);
      expect(captures).toHaveLength(away ? 1 : 0);
    }
  });

  it('min_capture_time: só captura depois do tempo mínimo desde a pegada na base', () => {
    for (const [elapsed, ok] of [
      [0.5, false],
      [1, true],
    ] as const) {
      const { w, sim, settings, captures } = world();
      expect(settings.world.minCaptureTime).toBe(1);
      w.time = 50 + elapsed;
      const carrier = addPlayer(w, 0, 0, 246, 177);
      (w.teams[1].flags[0] as FlagState).take(0, 50);
      carrier.stats.carriedFlag = CarriedFlag.Enemy;
      sim.postPhysics(carrier);
      expect(captures).toHaveLength(ok ? 1 : 0);
    }
  });
});

describe('pegar, largar e devolver', () => {
  it('mayTakeFlag (sala de treino, D-87): quem o gancho recusa encosta e não pega', () => {
    const { w, sim } = world();
    w.time = 10;
    w.frame = 100;
    sim.hooks.mayTakeFlag = (pid) => pid !== 0;
    const pl = addPlayer(w, 0, 2, 236, 177);
    sim.postPhysics(pl);
    expect(pl.stats.carriedFlag).toBe(CarriedFlag.None);
    expect((w.teams[1].flags[0] as FlagState).status).toBe('base');
    const other = addPlayer(w, 2, 2, 236, 177);
    sim.postPhysics(other);
    expect(other.stats.carriedFlag).toBe(CarriedFlag.Enemy);
  });

  it('largar de propósito desfaz o frag; quem largou só pega de novo depois de sair de cima', () => {
    const { w, sim } = world();
    w.time = 10;
    w.frame = 100;
    const pl = addPlayer(w, 0, 2, 236, 177);
    sim.postPhysics(pl);
    expect(pl.stats.carriedFlag).toBe(CarriedFlag.Enemy);
    expect(pl.stats.frags).toBe(1);
    sim.setDropKey(0, true);
    const flag = w.teams[1].flags[0] as FlagState;
    expect(flag.status).toBe('dropped');
    expect(flag.dropTime).toBe(10);
    expect(pl.stats.frags).toBe(0);
    expect(pl.stats.flagsDropped).toBe(1);
    sim.setDropKey(0, false);
    sim.postPhysics(pl);
    expect(flag.status).toBe('dropped'); // ainda em cima
    pl.pos = new Position(2, 0, 400, 300);
    sim.postPhysics(pl);
    expect(pl.droppedFlag).toBe(false);
    pl.pos = new Position(2, 0, 236, 177);
    sim.postPhysics(pl);
    expect(flag.status).toBe('carried');
    expect(flag.prevCarrier).toBe(-1); // o mesmo jogador não vira "anterior" de si mesmo
  });

  it('devolução respeita flag_return_delay e não existe com carry_own_team_flag', () => {
    for (const carryOwn of [false, true]) {
      const { w, sim } = world({ settings: (s) => (s.world.carryOwnTeamFlag = carryOwn) });
      const flag = w.teams[1].flags[0] as FlagState;
      flag.take(0, 0);
      w.frame = 100;
      flag.dropAt(new Position(1, 0, 100, 100));
      flag.dropTime = 10;
      const blue = addPlayer(w, 8, 1, 100, 100);
      w.frame = 105; // 0,5 s depois: cedo demais
      sim.postPhysics(blue);
      expect(flag.status).toBe(carryOwn ? 'carried' : 'dropped');
      if (carryOwn) continue;
      w.frame = 110;
      sim.postPhysics(blue);
      expect(flag.status).toBe('base');
      expect(blue.stats.flagsReturned).toBe(1);
      expect(blue.stats.frags).toBe(1);
    }
  });

  it('lock_team_flags com os três tipos: bandeiras de time não podem ser pegas', () => {
    const { w, sim } = world({ settings: (s) => (s.world.lockTeamFlags = true) });
    const pl = addPlayer(w, 0, 2, 236, 177);
    sim.postPhysics(pl);
    expect(pl.stats.carriedFlag).toBe(CarriedFlag.None);
    pl.pos = new Position(1, 0, 236, 177);
    sim.postPhysics(pl);
    expect(pl.stats.carriedFlag).toBe(CarriedFlag.Wild);
  });

  it('loadMapFlags remove as bandeiras que os locks tornariam inúteis', () => {
    const count = (setup: (s: GameSettings) => void) => {
      const { w } = world({ settings: setup });
      return [w.teams[0].flags.length, w.teams[1].flags.length, w.wildFlags.length];
    };
    expect(count(() => {})).toEqual([1, 1, 1]);
    expect(count((s) => Object.assign(s.world, { lockTeamFlags: true, captureOnTeamFlag: false }))).toEqual([0, 0, 1]);
    expect(count((s) => Object.assign(s.world, { lockTeamFlags: true, lockWildFlags: true }))).toEqual([0, 0, 0]);
    expect(count((s) => Object.assign(s.world, { lockWildFlags: true, captureOnWildFlag: false }))).toEqual([1, 1, 0]);
    expect(count((s) => (s.world.lockTeamFlags = true))).toEqual([1, 1, 1]);
  });

  it('random_wild_flag: só uma selvagem sorteada fora das paredes', () => {
    const settings = codeDefaults();
    settings.world.randomWildFlag = true;
    const w = new WorldState(flagMap(), 16);
    const values = [7, 2, 100, 50];
    const sim = new ServerSim(w, settings, { rand: () => values.shift() ?? 0 });
    sim.loadMapFlags();
    expect(w.teams[0].flags).toHaveLength(0);
    expect(w.teams[1].flags).toHaveLength(0);
    expect(w.wildFlags).toHaveLength(1);
    expect(w.wildFlags[0]?.home).toEqual(new Position(7 % 3, 0, 100, 50));
  });

  it('morte súbita: depois do tempo normal, qualquer captura encerra', () => {
    const reasons: string[] = [];
    const { w, sim } = world({ settings: (s) => Object.assign(s.world, { timeLimit: 600, suddenDeath: true }) });
    sim.hooks.gameOver = (reason) => reasons.push(reason);
    w.mapStartFrame = 0; // frame 1000: o tempo normal já acabou
    const carrier = addPlayer(w, 0, 0, 246, 177);
    (w.teams[1].flags[0] as FlagState).take(0, 0);
    carrier.stats.carriedFlag = CarriedFlag.Enemy;
    sim.postPhysics(carrier);
    expect(reasons).toEqual(['captureLimit']);
  });

  it('limite de capturas avisa o servidor (diferença mínima de placar)', () => {
    let reached = 0;
    const { w, sim } = world({ settings: (s) => Object.assign(s.world, { captureLimit: 2, winScoreDifference: 2 }) });
    sim.hooks.gameOver = (reason) => {
      expect(reason).toBe('captureLimit');
      reached++;
    };
    w.time = 100;
    w.teams[0].score = 1;
    w.teams[1].score = 0;
    const carrier = addPlayer(w, 0, 0, 246, 177);
    (w.teams[1].flags[0] as FlagState).take(0, 0);
    carrier.stats.carriedFlag = CarriedFlag.Enemy;
    sim.postPhysics(carrier);
    expect(w.teams[0].score).toBe(2);
    expect(reached).toBe(1);
  });
});
