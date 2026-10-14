// SPDX-License-Identifier: GPL-2.0-or-later
// Estado e utilitários comuns da IA dos bots (`Robot`, src/robot.h e src/robot.cpp). As decisões
// ficam em navigation.ts (OG-051), combat.ts (OG-052) e brain.ts (OG-053); todas recebem o
// `RobotCore`, que equivale ao `this` do original. Spec: plan/specs/bots-ia.md.
import {
  N_PI_4,
  PLAYER_RADIUS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  Vec,
  applyPhysicsToPlayerInIsolation,
  applyPlayerAcceleration,
  gunDirectionTo8way,
  iround,
  positiveFmod,
  type Position,
  type Rng,
} from '@outgun/sim';
import type { Area, AreaMap, Neighbor } from './areamap.js';
import { Direction } from './areamap.js';
import { DistanceTableId, DistanceTables } from './distance.js';
import type { BotPlayer, BotView } from './view.js';

/** Largura e altura da sala (`S_W`, `S_H`, src/robot.cpp:78). */
export const S_W = ROOM_WIDTH;
export const S_H = ROOM_HEIGHT;
/** Frames depois dos quais uma posição de inimigo é esquecida (`FADEOUT`). */
export const FADEOUT = 50;

/** O que o bot persegue (`DestinationType`, src/robot.h:44). */
export enum DestinationType {
  None = 0,
  Flag = 1,
  Base = 2,
  Team = 3,
  Fog = 4,
}

/** Coordenadas locais mutáveis (`Coords`); `x = −1` marca "sem alvo" no passeio livre. */
export interface MutableCoords {
  x: number;
  y: number;
}

/** `GunDirection().fromRad(r)`: oitavos de volta normalizados para [0, 8). */
export function gunDirFromRad(rad: number): number {
  return positiveFmod(rad / N_PI_4, 8);
}

/** `GunDirection::to8way` (exige direção válida). */
export function to8way(dir: number): number {
  return iround(dir) % 8;
}

/** `ClientControls().fromDirection(dir)`: só as teclas da direção. */
export function controlsFromDirection(dir: number): number {
  switch (dir) {
    case 0:
      return Ctl.right;
    case 1:
      return Ctl.right | Ctl.down;
    case 2:
      return Ctl.down;
    case 3:
      return Ctl.down | Ctl.left;
    case 4:
      return Ctl.left;
    case 5:
      return Ctl.left | Ctl.up;
    case 6:
      return Ctl.up;
    case 7:
      return Ctl.up | Ctl.right;
    default:
      throw new RangeError(`direção inválida: ${dir}`);
  }
}

/** Bits de `ClientControls` (src/commont.h:104). */
export const Ctl = { up: 1, down: 2, left: 4, right: 8, run: 16, strafe: 32 } as const;

/** Quando a posição prevista já está na sala vizinha (`Robot::AlreadyInRoom`). */
export class AlreadyInRoom extends Error {}

/** Precisão das posições na rede, descontada do raio na extrapolação (`playerPosAccuracy`). */
const PLAYER_POS_ACCURACY = ROOM_WIDTH / 0xfff / 2;

export class RobotCore {
  readonly tables: DistanceTables;
  destinationType = DestinationType.None;
  destination: Area | null = null;
  /** Vizinho escolhido como próximo passo até o destino. */
  immediateDestination: Neighbor | null = null;
  freeWalkTarget: MutableCoords = { x: -1, y: 0 };
  /** Atirando (o servidor recebeu `fire_on`). */
  botPrevFire = false;
  enemiesInRoom = false;
  /** Inimigo em mira (pid) ou −1. */
  lastSeen = -1;
  /** Direção da arma em 8 direções que o bot acredita ter; −1 = desconhecida (morto). */
  myGundir = -1;
  /** Direção livre da arma (`gunDir` do ClientBase; só com `allowFreeTurning`); −1 = indefinida. */
  gunDir = -1;
  /** Bandeiras que o bot deixa para outros do time (por time 0, 1, 2 e índice). */
  readonly flagsIgnored: boolean[][] = [[], [], []];
  /** Atraso em frames entre o mundo recebido e o efeito dos controles (`averageLag`). */
  averageLag = 0;
  /** Eu extrapolado por `averageLag` (`futureMe`); `myPos` é a posição dele. */
  private future!: BotPlayer;
  /** Área de `myPos` (`futureMe` não se move durante a decisão). */
  private myAreaMemo: Area | null = null;

  get futureMe(): BotPlayer {
    return this.future;
  }

  set futureMe(p: BotPlayer) {
    this.future = p;
    this.myAreaMemo = null;
  }


  constructor(
    readonly view: BotView,
    readonly areaMap: AreaMap,
    /** pid do bot. */
    public me: number,
    /** `rand()` do processo (no original é global, compartilhado com o servidor). */
    readonly rng: Rng,
  ) {
    this.tables = new DistanceTables(areaMap);
  }

  get fx(): BotView {
    return this.view;
  }

  get myPos(): Position {
    return this.futureMe.pos;
  }

  player(pid: number): BotPlayer {
     
    return this.view.players[pid]!;
  }

  myTeam(): 0 | 1 {
    return this.player(this.me).team;
  }

  isMyTeam(p: BotPlayer): boolean {
    return p.team === this.myTeam();
  }

  areaOf(pos: Position): Area {
    return this.areaMap.identifyAreaAt(pos.roomX, pos.roomY, pos.x, pos.y);
  }

  myArea(): Area {
    return (this.myAreaMemo ??= this.areaOf(this.myPos));
  }

  distance(id: DistanceTableId, area: Area): number {
    return this.tables.distance(id, area);
  }

  /** `here`: visto há menos de 10 frames na minha sala (e na minha área, salvo `roomEnough`). */
  here(p: BotPlayer, roomEnough = false): boolean {
    return (
      p.posUpdated > this.fx.frame - 10 &&
      p.pos.roomX === this.myPos.roomX &&
      p.pos.roomY === this.myPos.roomY &&
      (roomEnough || this.areaOf(p.pos) === this.myArea())
    );
  }

  predictPos(startPos: Vec, vel: Vec): Vec {
    return startPos.add(vel.mul(this.averageLag));
  }

  predictPlayer(p: BotPlayer): Vec {
    return this.predictPos(p.pos.local(), p.vel);
  }

  /** Bandeira que `pid` carrega: 0 nenhuma, 1 inimiga, 2 selvagem, 3 do próprio time (`HaveFlag`). */
  haveFlag(pid: number): number {
    for (let team = 0; team <= 2; ++team) {
      for (const f of this.fx.world.flagsOf(team)) {
        if (f.status === 'carried' && f.carrier === pid) return team === this.player(pid).team ? 3 : team === 2 ? 2 : 1;
      }
    }
    return 0;
  }

  /** Caminho livre de raio `radius` até perto (`maxDistanceFromTarget`) do alvo? (`IsBehindWall`) */
  isBehindWall(delta: Vec, radius: number, maxDistanceFromTarget: number, start: Position = this.myPos): boolean {
    const room = this.fx.map.room({ x: start.roomX, y: start.roomY });
    const dist = delta.mag();
    if (dist === 0) return false;
    const nearEnoughFraction = (dist - maxDistanceFromTarget) / dist;
    if (nearEnoughFraction <= 0) return false;
    return room.timeTillWall(start.local(), delta, radius, nearEnoughFraction).time < nearEnoughFraction;
  }

  /** Distância até a parede ou borda na direção e o ponto de contato (`WallHitPosition`). */
  wallHitPosition(dir8: number, radius: number): [number, Vec] {
    const rad = dir8 * N_PI_4;
    const d = new Vec(Math.cos(rad), Math.sin(rad));
    const room = this.fx.map.room({ x: this.myPos.roomX, y: this.myPos.roomY });
    let maxDist = 1e99;
    if (d.x !== 0) maxDist = Math.min(maxDist, (d.x > 0 ? S_W - this.myPos.x : -this.myPos.x) / d.x);
    if (d.y !== 0) maxDist = Math.min(maxDist, (d.y > 0 ? S_H - this.myPos.y : -this.myPos.y) / d.y);
    const dist = Math.min(maxDist, room.timeTillWall(this.myPos.local(), d, radius, maxDist).time);
    return [dist, this.myPos.local().add(d.mul(dist))];
  }

  scanDir(dir8: number): number {
    return this.wallHitPosition(dir8, PLAYER_RADIUS)[0];
  }

  /** `GetDir`: direção (0..8) de um vetor. */
  getDir(delta: Vec): number {
    return gunDirFromRad(Math.atan2(delta.y, delta.x));
  }

  /** Ponto da porta mais perto de `pos`, com folga das quinas (`nearestDoor`). */
  nearestDoor(neighbor: Neighbor, pos: Vec): Vec {
    let fixedTarget: number;
    let xFixed: boolean;
    switch (neighbor.direction) {
      case Direction.Up:
        fixedTarget = 0;
        xFixed = false;
        if (pos.y < 0) throw new AlreadyInRoom();
        break;
      case Direction.Down:
        fixedTarget = S_H;
        xFixed = false;
        if (pos.y > S_H) throw new AlreadyInRoom();
        break;
      case Direction.Left:
        fixedTarget = 0;
        xFixed = true;
        if (pos.x < 0) throw new AlreadyInRoom();
        break;
      case Direction.Right:
        fixedTarget = S_W;
        xFixed = true;
        if (pos.x > S_W) throw new AlreadyInRoom();
        break;
    }
    const myFreeCoord = xFixed ? pos.y : pos.x;
    let nearest: readonly [number, number] | undefined;
    let minDist = 1e10;
    for (const door of neighbor.doors) {
      if (door[0] <= myFreeCoord && door[1] >= myFreeCoord) {
        nearest = door;
        break;
      }
      const dist = door[0] <= myFreeCoord ? myFreeCoord - door[1] : door[0] - myFreeCoord;
      if (dist < minDist) {
        nearest = door;
        minDist = dist;
      }
    }
    if (!nearest) throw new Error('nearestDoor: vizinho sem porta');
    const doorMiddle = (nearest[0] + nearest[1]) / 2;
    const niceLow = Math.min(doorMiddle, nearest[0] + 4 * PLAYER_RADIUS);
    const niceHigh = Math.max(doorMiddle, nearest[1] - 4 * PLAYER_RADIUS);
    const freeTarget = myFreeCoord <= niceLow ? niceLow : myFreeCoord >= niceHigh ? niceHigh : myFreeCoord; // bound()
    return xFixed ? new Vec(fixedTarget, freeTarget) : new Vec(freeTarget, fixedTarget);
  }

  distanceFromDoor(n: Neighbor, pos: Vec = this.myPos.local()): number {
    try {
      return this.nearestDoor(n, pos).sub(pos).mag();
    } catch (e) {
      if (e instanceof AlreadyInRoom) return 0;
      throw e;
    }
  }

  /** Constrói a tabela se o centro ou o peso mudaram (`BuildDistanceTable` com um ponto de partida). */
  buildDistanceTable(start: Area, respawnWeight: number, id: DistanceTableId): void {
    this.tables.build(id, start, respawnWeight, this.myTeam());
  }

  /** `myRespawnWeight`: com bandeira, áreas de respawn inimigas pesam no caminho. */
  myRespawnWeight(): number {
    return this.haveFlag(this.me) ? 1 : 0;
  }

  /**
   * `ClientWorld::extrapolateSinglePlayerPosition`: aplica `controls[0..n−2]` por um frame cada e
   * o último por `subFrameAfter`, só com as paredes (sem outros jogadores).
   */
  extrapolate(pl: BotPlayer, controls: readonly number[], subFrameAfter: number): void {
    const ctx = { world: this.fx.world, physics: this.fx.physics };
    const radius = PLAYER_RADIUS - PLAYER_POS_ACCURACY;
    controls.forEach((c, i) => {
      pl.controls = c;
      applyPlayerAcceleration(ctx, pl);
      applyPhysicsToPlayerInIsolation(ctx, pl, radius, i === controls.length - 1 ? subFrameAfter : 1);
    });
  }

  /** A arma do jogador em 8 direções. */
  gundir8(p: BotPlayer): number {
    return gunDirectionTo8way(p.gundir);
  }

  /** `rand()` do original. */
  rand(): number {
    return this.rng.rand();
  }
}
