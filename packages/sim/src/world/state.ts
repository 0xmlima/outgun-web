// SPDX-License-Identifier: GPL-2.0-or-later
// Estado mutável do mundo do servidor (`ServerWorld`, `ServerPlayer`, `Rocket`, `Flag`, `Team`;
// src/world.h). Os nomes seguem o original para facilitar a conferência; tempos absolutos estão em
// segundos do relógio da simulação (D-09) e "frames" são números de frame.
import { MAX_ROCKETS, ROOM_HEIGHT, ROOM_WIDTH } from '../constants.js';
import { Vec } from '../geometry/vec.js';
import type { GameMap } from '../map/map.js';

/** Posição mutável: sala + coordenadas locais. */
export class Position {
  constructor(
    public roomX: number,
    public roomY: number,
    public x: number,
    public y: number,
  ) {}

  local(): Vec {
    return new Vec(this.x, this.y);
  }

  /** `pos.local(Coords(pos.local() + vel * fraction))` */
  move(vel: Vec, fraction: number): void {
    this.x = this.x + vel.x * fraction;
    this.y = this.y + vel.y * fraction;
  }

  /** `Coords::isOutOfBounds` */
  isOutOfBounds(): boolean {
    return this.x < 0 || this.x > ROOM_WIDTH || this.y < 0 || this.y > ROOM_HEIGHT;
  }

  sameRoom(o: Position): boolean {
    return this.roomX === o.roomX && this.roomY === o.roomY;
  }

  clone(): Position {
    return new Position(this.roomX, this.roomY, this.x, this.y);
  }
}

export type AccelerationMode = 'world' | 'gun';

export interface PlayerStats {
  frags: number;
  kills: number;
  deaths: number;
  shots: number;
  hits: number;
  shotsTaken: number;
  /** Distância percorrida em pixels (`total_movement`). */
  movement: number;
}

export class PlayerState {
  dead = false;
  pos = new Position(0, 0, 0, 0);
  vel = new Vec(0, 0);
  /** Bits de `CONTROL`. */
  controls = 0;
  accelerationMode: AccelerationMode = 'world';
  /** Direção da arma em oitavos (0..8). */
  gundir = 0;
  attack = false;
  attackOnce = false;
  attackGunDir = 0;
  health = 100;
  energy = 100;
  megabonus = 0;
  weapon = 1;
  /** Acertos restantes do shield; 0 = sem shield. */
  shield = 0;
  power = false;
  powerTime = 0;
  turbo = false;
  turboTime = 0;
  /** Alpha 0..255; abaixo de 255 = com shadow. */
  visibility = 255;
  shadowTime = 0;
  deathbringer = false;
  /** Fim do efeito de deathbringer de outro jogador (tempo absoluto). */
  deathbringerEnd = 0;
  deathbringerAttacker = -1;
  nextShootFrame = 0;
  startTakeDamageFrame = 0;
  stats: PlayerStats = { frags: 0, kills: 0, deaths: 0, shots: 0, hits: 0, shotsTaken: 0, movement: 0 };

  constructor(
    readonly pid: number,
    public team: 0 | 1,
  ) {}

  hasShadow(): boolean {
    return this.visibility < 255;
  }

  underDeathbringerEffect(time: number): boolean {
    return this.deathbringerEnd >= time;
  }
}

export class RocketState {
  /** −1 = slot livre. */
  owner = -1;
  team = 0;
  power = false;
  pos = new Position(0, 0, 0, 0);
  vel = new Vec(0, 0);
  direction = 0;
}

export type FlagStatus = 'base' | 'carried' | 'dropped';

export class FlagState {
  status: FlagStatus = 'base';
  carrier = -1;
  constructor(
    readonly home: Position,
    public pos: Position,
  ) {}
}

export interface TeamState {
  flags: FlagState[];
  movement: number;
}

export class WorldState {
  frame = 0;
  /** Relógio da simulação em segundos (`get_time()` no original; ver D-09). */
  time = 0;
  /** Jogadores indexados por pid; undefined = vaga livre. */
  readonly players: (PlayerState | undefined)[];
  readonly rockets: RocketState[] = Array.from({ length: MAX_ROCKETS }, () => new RocketState());
  readonly teams: [TeamState, TeamState] = [
    { flags: [], movement: 0 },
    { flags: [], movement: 0 },
  ];
  readonly wildFlags: FlagState[] = [];

  constructor(
    readonly map: GameMap,
    /** Vagas (`maxplayers`); o time de um pid é `pid / (maxplayers / 2)`. */
    readonly maxPlayers: number,
  ) {
    this.players = new Array<PlayerState | undefined>(maxPlayers).fill(undefined);
  }

  /** `TSIZE` do original. */
  get teamSize(): number {
    return this.maxPlayers / 2;
  }

  /** O jogador carrega uma bandeira inimiga ou selvagem? (penalidade de aceleração ao correr) */
  carriesEnemyOrWildFlag(player: PlayerState): boolean {
    const enemy = this.teams[1 - player.team] as TeamState;
    return enemy.flags.some((f) => f.carrier === player.pid) || this.wildFlags.some((f) => f.carrier === player.pid);
  }
}
