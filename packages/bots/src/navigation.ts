// SPDX-License-Identifier: GPL-2.0-or-later
// Navegação dos bots (OG-051): andar numa direção, contornar paredes, passeio livre e ir de área em
// área até o destino pelas portas (src/robot.cpp:655-796 e 1033-1159).
import { PLAYER_RADIUS, ROCKET_RADIUS, Vec, positiveModulo } from '@outgun/sim';
import { Direction, type Area, type Neighbor } from './areamap.js';
import { DistanceTableId } from './distance.js';
import { AlreadyInRoom, Ctl, DestinationType, S_H, S_W, controlsFromDirection, to8way, type RobotCore } from './robot-core.js';
import { dangerousExplosionInNeighbor, teams } from './situation.js';

const inv8 = (dir: number): number => dir ^ 4;

/** Direção (entre a da arma e as vizinhas) com mais espaço livre à frente (`FreeDir`). */
export function freeDir(bot: RobotCore): number {
  let mdir = 0;
  let mdist = 0;
  for (let i = bot.myGundir - 1; i <= bot.myGundir + 1; ++i) {
    const d = (i + 8) % 8;
    const dist = bot.scanDir(d);
    if (dist > mdist || mdist === 0 || (dist >= mdist - ROCKET_RADIUS && i === bot.myGundir)) {
      mdist = dist;
      mdir = d;
    }
  }
  if (mdist < 1.5 * PLAYER_RADIUS) mdir = inv8(mdir);
  return mdir;
}

/** Correr na direção (`MoveDir`). */
export function moveDir(dir: number): number {
  return controlsFromDirection(dir) | Ctl.run;
}

/** Correr na direção, desviando de companheiros encostados (`MoveDirNoAggregate`). */
export function moveDirNoAggregate(bot: RobotCore, dirIn: number): number {
  let dir = dirIn;
  let sd = new Vec(0, 0);
  let n = 0;
  const fx = bot.fx;
  for (let i = 0; i < fx.maxPlayers; ++i) {
    const pl = bot.player(i);
    if (!pl.used || !bot.isMyTeam(pl) || pl.dead || !pl.onscreen || i === bot.me) continue;
    // sem myPos, para todos os jogadores terem a mesma visão
    const d = bot.predictPlayer(pl).sub(bot.predictPlayer(bot.player(bot.me)));
    if (Math.abs(d.x) > PLAYER_RADIUS || Math.abs(d.y) > PLAYER_RADIUS) continue;
    sd = sd.add(d);
    n++;
  }
  if (!n) return moveDir(dir);
  if (!sd.x && !sd.y) dir = bot.rand() % 8;
  sd = sd.div(n);

  let ctrl = controlsFromDirection(dir) | Ctl.run | Ctl.strafe;
  switch (dir) {
    case 0:
    case 4:
      ctrl |= sd.y > 0 ? Ctl.up : Ctl.down;
      break;
    case 2:
    case 6:
      ctrl |= sd.x > 0 ? Ctl.left : Ctl.right;
      break;
    case 1:
      ctrl &= ~(sd.y < sd.x ? Ctl.right : Ctl.down);
      break;
    case 5:
      ctrl &= ~(sd.y < sd.x ? Ctl.up : Ctl.left);
      break;
    case 3:
      ctrl &= ~(sd.y > -sd.x ? Ctl.down : Ctl.left);
      break;
    case 7:
      ctrl &= ~(sd.y > -sd.x ? Ctl.right : Ctl.up);
      break;
  }
  return ctrl;
}

/** Passeio sem destino: alvo aleatório visível na sala, ou a direção mais livre (`FreeWalk`). */
export function freeWalk(bot: RobotCore): number {
  const me = bot.myPos.local();
  const t = bot.freeWalkTarget;
  for (let tries = 0; tries < 20; ++tries) {
    if (t.x >= 0) {
      const delta = new Vec(t.x - me.x, t.y - me.y);
      if (!bot.isBehindWall(delta, PLAYER_RADIUS, PLAYER_RADIUS) && delta.mag() > 3 * PLAYER_RADIUS) {
        return moveToNoAggregate(bot, delta, PLAYER_RADIUS);
      }
    }
    // Coords(rand() % S_W, rand() % S_H): o GCC avalia o y primeiro
    const y = bot.rand() % S_H;
    const x = bot.rand() % S_W;
    t.x = x;
    t.y = y;
  }
  t.x = -1;
  return moveDirNoAggregate(bot, freeDir(bot));
}

/** Contorna a parede: melhor direção (perto da arma) com um ponto de virada que vê o alvo. */
export function moveIndirectlyTowards(bot: RobotCore, delta: Vec, maxDistanceFromTarget: number): number {
  const me = bot.myPos.local();
  const target = me.add(delta);
  let bestDir = -1;
  let minDist = 1e99;
  for (let dirOffset = -3; dirOffset <= 3; ++dirOffset) {
    const dir = positiveModulo(bot.myGundir + dirOffset, 8);
    const [wallDist, wallPoint] = bot.wallHitPosition(dir, PLAYER_RADIUS);
    if (wallDist <= PLAYER_RADIUS) continue;
    // ponto de virada na linha, um raio de jogador antes da parede
    const fract = (wallDist - PLAYER_RADIUS) / wallDist;
    const turnPos = wallPoint.mul(fract).add(me.mul(1 - fract));
    const turnWorld = bot.myPos.clone();
    turnWorld.x = turnPos.x;
    turnWorld.y = turnPos.y;
    if (bot.isBehindWall(target.sub(turnPos), PLAYER_RADIUS, maxDistanceFromTarget, turnWorld)) continue;
    const dist = wallDist - PLAYER_RADIUS + target.sub(turnPos).mag() + 2 * PLAYER_RADIUS * Math.abs(dirOffset);
    if (dist < minDist) {
      minDist = dist;
      bestDir = dir;
    }
  }
  return moveDir(bestDir !== -1 ? bestDir : freeDir(bot));
}

export function moveToNoAggregate(bot: RobotCore, delta: Vec, maxDistanceFromTarget: number): number {
  if (bot.isBehindWall(delta, PLAYER_RADIUS, maxDistanceFromTarget)) return moveIndirectlyTowards(bot, delta, maxDistanceFromTarget);
  return moveDirNoAggregate(bot, to8way(bot.getDir(delta)));
}

export function moveTo(bot: RobotCore, delta: Vec, maxDistanceFromTarget: number): number {
  if (bot.isBehindWall(delta, PLAYER_RADIUS, maxDistanceFromTarget)) return moveIndirectlyTowards(bot, delta, maxDistanceFromTarget);
  return moveDir(to8way(bot.getDir(delta)));
}

/** Escolhe o destino e monta a tabela de distâncias até ele (`setDestination`). */
export function setDestination(bot: RobotCore, target: Area): void {
  if (target === bot.destination) return;
  bot.destination = target;
  bot.buildDistanceTable(target, bot.myRespawnWeight(), DistanceTableId.Destination);
}

/** Um passo até o destino: porta para um vizinho mais perto dele (`MoveToDestination`). */
export function moveToDestination(bot: RobotCore): number {
  if (bot.destinationType === DestinationType.None) return 0;
  const here = bot.myArea();
  const hereDistance = bot.distance(DistanceTableId.Destination, here);
  if (hereDistance === -1 || bot.destination === here) return 0;

  let bestDistance = hereDistance;
  let goodNeighbors: Neighbor[] = [];
  let oldDestinationFound = false;
  const carrying = bot.haveFlag(bot.me) !== 0;
  for (const ni of here.neighbors) {
    const nd = bot.distance(DistanceTableId.Destination, ni.area);
    if (nd <= bestDistance) {
      if (carrying) {
        const tc = teams(bot, ni.area, false);
        if (tc.enemies > tc.friends + 1) continue;
      }
      if (nd < bestDistance) {
        bestDistance = nd;
        goodNeighbors = [];
        oldDestinationFound = false;
      }
      if (ni === bot.immediateDestination) oldDestinationFound = true;
      if (!dangerousExplosionInNeighbor(bot, ni)) goodNeighbors.push(ni);
    }
  }
  // mesmo destino: espera a explosão passar, que não demora
  if (oldDestinationFound && bot.immediateDestination && dangerousExplosionInNeighbor(bot, bot.immediateDestination)) return 0;
  if (!oldDestinationFound) {
    bot.immediateDestination = goodNeighbors.length === 0 ? null : goodNeighbors[bot.rand() % goodNeighbors.length]!;
  }
  return bot.immediateDestination ? moveToDoor(bot, bot.immediateDestination) : 0;
}

/** Vai até a porta do vizinho e atravessa (`MoveToDoor`). */
export function moveToDoor(bot: RobotCore, neighbor: Neighbor): number {
  const dir = neighbor.direction;
  const me = bot.myPos.local();
  try {
    const door = bot.nearestDoor(neighbor, me);
    const through = door.add(new Vec(neighbor.dx, neighbor.dy).mul(PLAYER_RADIUS));
    return moveToNoAggregate(bot, through.sub(me), 0);
  } catch (e) {
    if (!(e instanceof AlreadyInRoom)) throw e;
    const run = Ctl.run;
    switch (dir) {
      case Direction.Up:
        return run | Ctl.up;
      case Direction.Down:
        return run | Ctl.down;
      case Direction.Left:
        return run | Ctl.left;
      case Direction.Right:
        return run | Ctl.right;
    }
  }
}

