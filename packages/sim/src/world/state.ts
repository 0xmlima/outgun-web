// SPDX-License-Identifier: GPL-2.0-or-later
// Estado mutável do mundo do servidor (`ServerWorld`, `ServerPlayer`, `Rocket`, `Flag`, `Team`;
// src/world.h). Os nomes seguem o original para facilitar a conferência; tempos absolutos estão em
// segundos do relógio da simulação (D-09) e "frames" são números de frame.
import { MAX_POWERUPS, MAX_ROCKETS, ROOM_HEIGHT, ROOM_WIDTH } from '../constants.js';
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

/** Bandeira carregada, como `Statistics::FlagType`. */
export const CarriedFlag = { None: 0, Own: 1, Enemy: 2, Wild: 3 } as const;
export type CarriedFlag = (typeof CarriedFlag)[keyof typeof CarriedFlag];

/** `Statistics` (src/world.h:266); nomes iguais aos do trace. Tempos em segundos do relógio da sim. */
export interface PlayerStats {
  frags: number;
  kills: number;
  deaths: number;
  dbKills: number;
  dbDeaths: number;
  consKills: number;
  curConsKills: number;
  consDeaths: number;
  curConsDeaths: number;
  suicides: number;
  captures: number;
  assists: number;
  flagsTaken: number;
  flagsDropped: number;
  flagsReturned: number;
  carriersKilled: number;
  /** Dano em inimigos sem o excesso: soma de `min(dano, vida antes do acerto)` (OG-355, D-68). */
  effectiveDamage: number;
  /** Abates por zona da vítima; base = sala onde nasce uma bandeira do time (OG-355). */
  killsEnemyBase: number;
  killsOwnBase: number;
  killsMidfield: number;
  /** Abates com bônus de defesa de portador ou de bandeira (OG-355). */
  defenses: number;
  shots: number;
  hits: number;
  shotsTaken: number;
  spawnTime: number;
  lifetime: number;
  /** Distância percorrida em pixels (`total_movement`). */
  movement: number;
  startTime: number;
  dead: boolean;
  carriedFlag: CarriedFlag;
  flagCarryingTime: number;
  flagTakeTime: number;
}

export function newStats(): PlayerStats {
  return {
    frags: 0,
    kills: 0,
    deaths: 0,
    dbKills: 0,
    dbDeaths: 0,
    consKills: 0,
    curConsKills: 0,
    consDeaths: 0,
    curConsDeaths: 0,
    suicides: 0,
    captures: 0,
    assists: 0,
    flagsTaken: 0,
    flagsDropped: 0,
    flagsReturned: 0,
    carriersKilled: 0,
    effectiveDamage: 0,
    killsEnemyBase: 0,
    killsOwnBase: 0,
    killsMidfield: 0,
    defenses: 0,
    shots: 0,
    hits: 0,
    shotsTaken: 0,
    spawnTime: 0,
    lifetime: 0,
    movement: 0,
    startTime: 0,
    dead: true,
    carriedFlag: CarriedFlag.None,
    flagCarryingTime: 0,
    flagTakeTime: 0,
  };
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
  framesToRespawn = 0;
  extraFramesToRespawn = 0;
  respawnToBase = false;
  /** Esperando o cliente confirmar o carregamento do mapa (não renasce). */
  awaitingClientReadies = 0;
  /** Tecla de largar bandeira pressionada. */
  dropKey = false;
  /** Largou a bandeira e ainda está sobre ela (não a pega de volta). */
  droppedFlag = false;
  stats: PlayerStats = newStats();

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

/** Tipos de power-up (`Powerup::Pup_type`, src/world.h:782). */
export const PowerupKind = {
  shield: 0,
  turbo: 1,
  shadow: 2,
  power: 3,
  weapon: 4,
  megahealth: 5,
  deathbringer: 6,
  /** Slot vazio. */
  unused: 7,
  /** Esperando para reaparecer em `respawnTime`. */
  respawning: 8,
} as const;
export type PowerupKind = (typeof PowerupKind)[keyof typeof PowerupKind];

export class PowerupState {
  kind: PowerupKind = PowerupKind.unused;
  respawnTime = 0;
  pos = new Position(-1, -1, 0, 0);

  /** Power-up de verdade no chão (não vazio nem reaparecendo). */
  isReal(): boolean {
    return this.kind <= PowerupKind.deathbringer;
  }
}

/** Explosão de deathbringer (`DeathbringerExplosion`, src/world.h:809). */
export class DeathbringerExplosion {
  /**
   * Bit por jogador que, no frame anterior, estava na mesma sala e fora do anel (só esses podem ser
   * atingidos). Começa com todos os bits ligados.
   */
  outsideMask = 0xffffffff;

  constructor(
    readonly frame0: number,
    readonly pos: Position,
    /** Dono; trocado por um pid fictício se ele sair (`pidChange`). */
    public ownerPid: number,
    readonly ownerTeam: number,
  ) {}

  /** Raio no frame: linear até 100 px no primeiro segundo, depois `100 + 800 × (t − 1)²`. */
  radius(frame: number): number {
    const delta = (frame - this.frame0) * 0.1;
    return delta < 1 ? delta * 100 : 100 + (delta - 1) * (delta - 1) * 800;
  }

  expired(frame: number): boolean {
    return frame > this.frame0 + 18;
  }
}

export type FlagStatus = 'base' | 'carried' | 'dropped';

/** `Flag` (src/world.h:640): estado, portadores (para a assistência) e posse de bandeira selvagem. */
export class FlagState {
  status: FlagStatus = 'base';
  /** Portador atual; −1 se não está sendo carregada. */
  carrier = -1;
  /** Último portador (candidato a assistente na captura). */
  prevCarrier = -1;
  /** Penúltimo portador, para quando o mesmo jogador larga e pega de novo. */
  prevPrevCarrier = -1;
  /** Quando foi tirada da base (o original não inicializa; só é lida depois de uma pegada na base). */
  grabTime = 0;
  /** Quando foi largada (em `frame / 10`; só bandeiras de time). */
  dropTime = -1e10;
  /** Time que carregou a bandeira selvagem por último (−1 = ninguém) e há quantos frames. */
  carryingTeam = -1;
  carryingTime = 0;

  constructor(
    readonly home: Position,
    public pos: Position,
  ) {}

  /** `Flag::take(carrier, time)`: a hora da pegada só conta se ela estava na base. */
  take(carrier: number, time: number): void {
    if (this.status === 'base') this.grabTime = time;
    this.status = 'carried';
    this.carrier = carrier;
    // mantém como anterior um jogador diferente do portador
    if (this.prevCarrier === carrier) this.prevCarrier = this.prevPrevCarrier;
    this.prevPrevCarrier = -1;
  }

  /** `Flag::return_to_base`. */
  returnToBase(): void {
    this.status = 'base';
    this.pos = this.home.clone();
    this.carrier = -1;
    this.prevCarrier = -1;
    this.prevPrevCarrier = -1;
    this.carryingTeam = -1;
  }

  /** `Flag::move` + `Flag::drop`. */
  dropAt(pos: Position): void {
    this.pos = pos;
    this.status = 'dropped';
    if (this.prevCarrier !== this.carrier) this.prevPrevCarrier = this.prevCarrier;
    else if (this.prevPrevCarrier === this.carrier) this.prevPrevCarrier = -1;
    this.prevCarrier = this.carrier;
    this.carrier = -1;
  }

  /** `Flag::add_carrying_time`: troca de time zera a contagem. */
  addCarryingTime(team: number): void {
    if (this.carryingTeam !== team) {
      this.carryingTeam = team;
      this.carryingTime = 0;
    }
    ++this.carryingTime;
  }

  /** `Team::reset_prev_carrier` / laço de `resetCarrierData` para uma bandeira. */
  forgetCarrier(pid: number): void {
    if (this.prevCarrier === pid) this.prevCarrier = -1;
    else if (this.prevPrevCarrier === pid) this.prevPrevCarrier = -1;
  }
}

/** Captura registrada no placar do time (`Team::caps`). */
export interface Capture {
  /** Tempo de mapa em segundos inteiros (`getMapTime() / 10`). */
  time: number;
  pid: number;
  /** Assistente; −1 = sem assistência. */
  assistPid: number;
}

export interface TeamState {
  flags: FlagState[];
  score: number;
  kills: number;
  deaths: number;
  suicides: number;
  flagsTaken: number;
  flagsDropped: number;
  flagsReturned: number;
  shots: number;
  hits: number;
  shotsTaken: number;
  movement: number;
  captures: Capture[];
}

export function newTeam(): TeamState {
  return { flags: [], score: 0, kills: 0, deaths: 0, suicides: 0, flagsTaken: 0, flagsDropped: 0, flagsReturned: 0, shots: 0, hits: 0, shotsTaken: 0, movement: 0, captures: [] };
}

/** Por que a partida acabou (no original todas levam a `server_next_map`). */
export type GameOverReason = 'captureLimit' | 'timeOut' | 'extraTimeOut';

export class WorldState {
  frame = 0;
  /** Relógio da simulação em segundos (`get_time()` no original; ver D-09). */
  time = 0;
  /** Jogadores indexados por pid; undefined = vaga livre. */
  readonly players: (PlayerState | undefined)[];
  readonly rockets: RocketState[] = Array.from({ length: MAX_ROCKETS }, () => new RocketState());
  readonly items: PowerupState[] = Array.from({ length: MAX_POWERUPS }, () => new PowerupState());
  /** Explosões de deathbringer ativas, da mais antiga para a mais nova. */
  explosions: DeathbringerExplosion[] = [];
  readonly teams: [TeamState, TeamState] = [newTeam(), newTeam()];
  wildFlags: FlagState[] = [];
  /** Frame em que o mapa atual começou (`map_start_time`). */
  mapStartFrame = 0;
  /** Período de prorrogação atual, a partir de 1 (`current_extra_time_period`). */
  extraTimePeriod = 1;
  /** Último ponto de spawn usado por time (`MapTeam::lastspawn`); o próximo é o seguinte. */
  lastSpawn: [number, number] = [0, 0];
  /** Partida encerrada neste mapa; o servidor de sala mostra o placar e troca de mapa. */
  gameOver: GameOverReason | null = null;

  constructor(
    /** Mapa atual; trocado por `ServerSim.changeMap` no fim da partida. */
    public map: GameMap,
    /** Vagas (`maxplayers`); o time de um pid é `pid / (maxplayers / 2)`. */
    readonly maxPlayers: number,
  ) {
    this.players = new Array<PlayerState | undefined>(maxPlayers).fill(undefined);
  }

  /** `TSIZE` do original. */
  get teamSize(): number {
    return this.maxPlayers / 2;
  }

  /** `get_player_count()`: vagas ocupadas (humanos e bots). */
  playerCount(): number {
    return this.players.filter((p) => p !== undefined).length;
  }

  /** Time de um pid (`pid / TSIZE`). */
  teamOf(pid: number): 0 | 1 {
    return Math.trunc(pid / this.teamSize) as 0 | 1;
  }

  /** `getMapTime()`: frames desde o início do mapa. */
  mapTime(): number {
    return this.frame - this.mapStartFrame;
  }

  /** Bandeiras do time 0, 1 ou das selvagens (2), como os índices de time do original. */
  flagsOf(team: number): FlagState[] {
    return team === 2 ? this.wildFlags : (this.teams[team as 0 | 1] as TeamState).flags;
  }

  /** O jogador carrega uma bandeira inimiga ou selvagem? (penalidade de aceleração ao correr) */
  carriesEnemyOrWildFlag(player: PlayerState): boolean {
    const enemy = this.teams[1 - player.team] as TeamState;
    return enemy.flags.some((f) => f.carrier === player.pid) || this.wildFlags.some((f) => f.carrier === player.pid);
  }
}
