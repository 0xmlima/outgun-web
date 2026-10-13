// SPDX-License-Identifier: GPL-2.0-or-later
// Combate dos bots (OG-052): alvo, mira, decisão de tiro sem acertar companheiro e esquiva de
// foguetes e explosões (src/robot.cpp:84-654).
import {
  N_PI,
  N_PI_4,
  PLAYER_RADIUS,
  ROCKET_RADIUS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  Vec,
  dot,
  positiveFmod,
  randomShuffle,
  type RocketState,
} from '@outgun/sim';
import type { Area } from './areamap.js';
import { moveTo, moveToDoor } from './navigation.js';
import { Ctl, FADEOUT, S_H, S_W, controlsFromDirection, to8way, type RobotCore } from './robot-core.js';
import { explosionInRoom, imminentExplosionHere } from './situation.js';
import type { BotPlayer } from './view.js';

export enum AimLevel {
  None = 0,
  Near = 1,
  Full = 2,
}

/** Sem acerto (`1e100` do original). */
export const NO_HIT_TIME = 1e100;

/** `inv_dir` em direção contínua: meia volta. */
const invDir = (dir: number): number => positiveFmod(dir + 4, 8);
const toRad = (dir: number): number => dir * N_PI_4;

/** `WorldBase::getTimeTillCollision(PlayerBase, Rocket)`: já encostados → 0. */
function timeTillCollision(plPos: Vec, plVel: Vec, rkPos: Vec, rkVel: Vec, collRadius: number): number {
  const d = rkPos.sub(plPos);
  const r2 = collRadius * collRadius;
  if (d.mag2() < r2) return 0;
  const m = plVel.sub(rkVel);
  const m2 = m.mag2();
  const mdotd = dot(m, d);
  const d2 = d.mag2();
  const disc = mdotd * mdotd - m2 * (d2 - r2);
  if (disc >= 0) {
    const t = (mdotd - Math.sqrt(disc)) / m2;
    if (t >= 0) return t;
  }
  return 1e99;
}

/** Distância do inimigo ao plano de tiro em 8 direções. */
function rocketPlaneDistance(dir: number, d: Vec): number {
  if (dir === 0 || dir === 4) return Math.abs(d.y);
  if (dir === 2 || dir === 6) return Math.abs(d.x);
  if (dir === 1 || dir === 5) return Math.abs(d.y - d.x) / Math.sqrt(2);
  return Math.abs(d.y + d.x) / Math.sqrt(2);
}

/**
 * Tolerância da mira em 8 direções. No original é uma variável `static` local
 * (`1.3 * PLAYER_RADIUS + .7 * shot_deltax * (foguetes - 1)`), calculada uma única vez no processo,
 * na primeira mira de qualquer bot; como os bots começam com a arma 1, na prática vale sempre o valor
 * de 1 foguete. Fixado nesse valor (D-30).
 */
export const AIM_THRESHOLD = 1.3 * PLAYER_RADIUS;

/** Quão perto da mira está o alvo e em que direção (`TryAimTradTurning`). */
export function tryAimTradTurning(bot: RobotCore, target: number): [AimLevel, number] {
  const tp = bot.player(target);
  const tt = bot.predictPlayer(tp);
  let d = tt.sub(bot.myPos.local());
  const dist = d.mag();
  if (dist <= PLAYER_RADIUS) return [AimLevel.Full, bot.myGundir];
  d = d.add(tp.vel.mul(dist / bot.fx.physics.rocketSpeed));
  const dir = to8way(bot.getDir(d));
  if (bot.isBehindWall(d, ROCKET_RADIUS, PLAYER_RADIUS + ROCKET_RADIUS)) return [AimLevel.None, dir];
  const threshold = AIM_THRESHOLD;
  let below: boolean;
  if (dir === 0 || dir === 4) below = Math.abs(d.y) < threshold;
  else if (dir === 2 || dir === 6) below = Math.abs(d.x) < threshold;
  else below = Math.abs(Math.abs(d.y) - Math.abs(d.x)) <= threshold * Math.sqrt(2);
  return [below ? AimLevel.Full : AimLevel.Near, dir];
}

/** Foguete que vai me acertar primeiro antes de eu quicar na parede (`GetDangerousRocket`). */
export function getDangerousRocket(bot: RobotCore): number {
  const thinkAheadFrames = 10;
  const safetyRoomMul = 4;
  const framesAfterBounce = 0.5;
  let nearRocket = -1;
  let firstTime = 1e99;
  const me = bot.player(bot.me);
  // a velocidade é a recebida; a posição, a extrapolada
  const pos = bot.myPos;
  const room = bot.fx.map.room({ x: pos.roomX, y: pos.roomY });
  const bounceTime = room.timeTillWall(pos.local(), me.vel, PLAYER_RADIUS, thinkAheadFrames).time;
  bot.fx.world.rockets.forEach((rocket, i) => {
    if (rocket.owner === -1 || (rocket.team === me.team && !bot.fx.physics.friendlyFire)) return;
    if (rocket.pos.roomX !== pos.roomX || rocket.pos.roomY !== pos.roomY) return;
    const rPos = rocket.pos.local().add(rocket.vel.mul(bot.averageLag));
    const collisionTime = timeTillCollision(pos.local(), me.vel, rPos, rocket.vel, (PLAYER_RADIUS + ROCKET_RADIUS) * safetyRoomMul);
    if (collisionTime > bounceTime + framesAfterBounce || collisionTime >= firstTime) return;
    const rocketWallTime = room.timeTillWall(rPos, rocket.vel, ROCKET_RADIUS, thinkAheadFrames).time;
    if (collisionTime > rocketWallTime) return;
    firstTime = collisionTime;
    nearRocket = i;
  });
  return nearRocket;
}

function enemiesHere(bot: RobotCore): BotPlayer[] {
  return bot.fx.players.filter((e) => e.used && !bot.isMyTeam(e) && !e.dead && bot.here(e, true));
}

/** Inimigo fácil: perto do plano de tiro e sem tempo de fugir (`GetEasyEnemy`). */
export function getEasyEnemy(bot: RobotCore): number {
  let target = -1;
  let nearestDist = 1e10;
  const ph = bot.fx.physics;
  for (const enemy of enemiesHere(bot)) {
    const d = bot.predictPlayer(enemy).sub(bot.myPos.local());
    const playerDist = d.mag();
    const escapeDist = ((playerDist / ph.rocketSpeed) * ph.maxRunSpeed) / 2;
    const planeDist = ph.allowFreeTurning ? playerDist : rocketPlaneDistance(to8way(bot.getDir(d)), d);
    if (
      planeDist < 2 * PLAYER_RADIUS &&
      planeDist + escapeDist < nearestDist &&
      !bot.isBehindWall(d, ROCKET_RADIUS, PLAYER_RADIUS + ROCKET_RADIUS)
    ) {
      target = enemy.pid;
      nearestDist = planeDist + escapeDist;
    }
  }
  return target;
}

/** Inimigo mirando em mim (`GetDangerousEnemy`). */
export function getDangerousEnemy(bot: RobotCore): number {
  let target = -1;
  let nearestDist = 1e10;
  const ph = bot.fx.physics;
  for (const enemy of enemiesHere(bot)) {
    const d = bot.predictPlayer(enemy).sub(bot.myPos.local());
    const playerDist = d.mag();
    const aimTowardsMe = invDir(bot.getDir(d));
    let aimed: boolean;
    if (ph.allowFreeTurning) {
      // ±45°: 90° ao todo
      const tolerance = N_PI_4;
      const diff = positiveFmod(toRad(enemy.gundir) - toRad(aimTowardsMe), 2 * N_PI);
      aimed = diff < tolerance || diff > 2 * N_PI - tolerance;
    } else aimed = to8way(enemy.gundir) === to8way(aimTowardsMe);
    if (!aimed && playerDist > 2 * PLAYER_RADIUS) continue;
    const escapeDist = ((playerDist / ph.rocketSpeed) * ph.maxRunSpeed) / 2;
    const planeDist = ph.allowFreeTurning ? playerDist : rocketPlaneDistance(to8way(aimTowardsMe), d);
    if (
      planeDist < 2 * PLAYER_RADIUS &&
      planeDist + escapeDist < nearestDist &&
      !bot.isBehindWall(d, ROCKET_RADIUS, PLAYER_RADIUS + ROCKET_RADIUS)
    ) {
      target = enemy.pid;
      nearestDist = planeDist + escapeDist;
    }
  }
  return target;
}

/** Inimigo mais perto na sala (`GetNearestEnemy`). */
export function getNearestEnemy(bot: RobotCore): number {
  let target = -1;
  let mdist = 0;
  for (const enemy of enemiesHere(bot)) {
    const dist = bot.predictPlayer(enemy).sub(bot.myPos.local()).mag();
    if (dist < mdist || mdist === 0) {
      mdist = dist;
      target = enemy.pid;
    }
  }
  return target;
}

/** Mira livre: atirar? e em que direção contínua (`TryAimFreeTurning`). */
export function tryAimFreeTurning(bot: RobotCore, target: number): [boolean, number] {
  const tp = bot.player(target);
  let d = bot.predictPlayer(tp).sub(bot.myPos.local());
  const dist = d.mag();
  if (dist < 1) return [true, bot.gunDir];
  const tm = dist / bot.fx.physics.rocketSpeed;
  d = d.add(tp.vel.mul(tm));
  return [!bot.isBehindWall(d, ROCKET_RADIUS, PLAYER_RADIUS + ROCKET_RADIUS), bot.getDir(d)];
}

/** Tempo até um foguete na direção acertar o alvo, sem paredes; `NO_HIT_TIME` se erra (`GetHitTime`). */
export function getHitTime(bot: RobotCore, dir: number, iTarget: number): number {
  const target = bot.player(iTarget);
  if (target.dead || !bot.here(target, true)) return NO_HIT_TIME;
  const d = bot.predictPlayer(target).sub(bot.myPos.local());
  const dist = d.mag();
  if (dist <= PLAYER_RADIUS) return 0;
  const rad = toRad(dir);
  const rs = new Vec(Math.cos(rad), Math.sin(rad)).mul(bot.fx.physics.rocketSpeed);
  const ts = rs.sub(target.vel);
  const ts2 = ts.mag2();
  if (ts2 === 0) return NO_HIT_TIME;
  const mul = dot(d, ts) / ts2;
  const par = ts.mul(mul);
  const perp = d.sub(par);
  const hitTime = Math.sqrt(par.mag2() / ts2);
  return perp.mag() < 3 * PLAYER_RADIUS ? hitTime : NO_HIT_TIME;
}

/** Primeiro companheiro que o foguete acertaria (só com fogo amigo). */
export function getHitTeammateTime(bot: RobotCore, dir: number): number {
  let hitTime = NO_HIT_TIME;
  if (bot.fx.physics.friendlyFire === 0) return hitTime;
  for (let i = 0; i < bot.fx.maxPlayers; ++i) {
    const p = bot.player(i);
    if (p.used && bot.isMyTeam(p) && i !== bot.me) hitTime = Math.min(hitTime, getHitTime(bot, dir, i));
  }
  return hitTime;
}

/** Mira livre: atirar? e para onde (`NeedShootFreeTurning`). */
export function needShootFreeTurning(bot: RobotCore, defaultDir: number): [boolean, number] {
  const tryOrder: number[] = [];
  for (const pl of enemiesHere(bot)) if (pl.pid !== bot.lastSeen) tryOrder.push(pl.pid);
  const aimLastSeen: [boolean, number] = bot.lastSeen === -1 ? [false, defaultDir] : tryAimFreeTurning(bot, bot.lastSeen);
  if (aimLastSeen[0]) {
    if (getHitTime(bot, aimLastSeen[1], bot.lastSeen) <= getHitTeammateTime(bot, aimLastSeen[1])) return aimLastSeen;
    aimLastSeen[0] = false;
  }
  randomShuffle(tryOrder, bot.rng);
  for (const t of tryOrder) {
    const aim = tryAimFreeTurning(bot, t);
    if (aim[0] && getHitTime(bot, aim[1], t) <= getHitTeammateTime(bot, aim[1])) {
      bot.lastSeen = t;
      return aim;
    }
  }
  return aimLastSeen; // mira o último visto se ninguém dá para acertar
}

/** Tiro especulativo numa porta por onde um inimigo pode entrar (`ShootAtDoorTradTurning`). */
export function shootAtDoorTradTurning(bot: RobotCore): [boolean, number] {
  const fx = bot.fx;
  const me = bot.player(bot.me);
  const myPos = bot.myPos;
  // acabou de chegar numa sala nova e ainda não sabe se há inimigos
  if (myPos.roomX !== me.pos.roomX || myPos.roomY !== me.pos.roomY) return [false, -1];
  // prestes a sair da sala
  const futurePos = myPos.local().add(me.vel.mul(5));
  if (futurePos.x < 0 || futurePos.x > S_W || futurePos.y < 0 || futurePos.y > S_H) return [false, -1];

  const enemyAreas = new Set<Area>();
  for (const pl of fx.players) {
    if (!pl.used || bot.isMyTeam(pl) || pl.dead || pl.posUpdated < fx.frame - FADEOUT) continue;
    enemyAreas.add(bot.areaOf(pl.pos));
  }
  const here = bot.myArea();
  const halfH = Math.trunc(S_H / 2);
  // se um inimigo pode aparecer perto, não atira em porta nenhuma
  for (const ni of here.neighbors) {
    if (fx.enemiesSeen(ni.area.room.x, ni.area.room.y) >= fx.frame - 5 && !enemyAreas.has(ni.area)) continue;
    if (bot.distanceFromDoor(ni, myPos.local()) < halfH) return [false, -1];
  }
  const hitPos = Array.from({ length: 8 }, (_, dir) => bot.wallHitPosition(dir, ROCKET_RADIUS));
  let bestDist = 1e99;
  let bestDir = -1;
  let knownEnemyTargeted = false;
  for (const ni of here.neighbors) {
    const roomSeen = fx.enemiesSeen(ni.area.room.x, ni.area.room.y) >= fx.frame - 5;
    const knownEnemy = enemyAreas.has(ni.area);
    const nearRespawn = ni.area.respawnValue[bot.myTeam() === 0 ? 1 : 0] >= 0.25;
    if (!knownEnemy && (roomSeen || !nearRespawn)) continue;
    for (let dir = 0; dir < 8; ++dir) {
      const [len, point] = hitPos[dir]!;
      // só vale a pena especular se o foguete vive bastante
      if (len < halfH) continue;
      const dist = bot.distanceFromDoor(ni, point);
      if ((dist < bestDist && knownEnemy === knownEnemyTargeted) || (knownEnemy && !knownEnemyTargeted)) {
        bestDist = dist;
        bestDir = dir;
        knownEnemyTargeted = knownEnemy;
        if (dist < 1 && knownEnemy) return [true, dir];
      }
    }
  }
  return bestDist > 4 * PLAYER_RADIUS ? [false, -1] : [true, bestDir];
}

/** Mira em 8 direções: atirar? e em qual (`NeedShootTradTurning`). */
export function needShootTradTurning(bot: RobotCore): [boolean, number] {
  const dirDistances: [boolean, number][] = Array.from({ length: 8 }, () => [false, 0]);
  let anyInRoom = false;
  for (const pl of enemiesHere(bot)) {
    anyInRoom = true;
    const [level, dir] = tryAimTradTurning(bot, pl.pid);
    if (level !== AimLevel.Full) continue;
    const hitTime = getHitTime(bot, dir, pl.pid);
    // "sem acerto" vem como tempo enorme; GetHitTime calcula melhor que TryAim
    if (hitTime > 1e10) continue;
    const entry = dirDistances[dir]!;
    if (!entry[0] || hitTime < entry[1]) dirDistances[dir] = [true, hitTime];
  }
  if (!anyInRoom) return shootAtDoorTradTurning(bot);
  let bestDir = -1;
  let bestValue = 1e99;
  for (let dir = 0; dir < 8; ++dir) {
    const [has, time] = dirDistances[dir]!;
    if (!has || time > getHitTeammateTime(bot, dir)) continue;
    let dirDiff = Math.abs(dir - bot.myGundir);
    if (dirDiff > 4) dirDiff = 8 - dirDiff;
    // na mira atual (ou perto) é muito favorecido
    const value = time * dirDiff;
    if (value < bestValue) {
      bestValue = value;
      bestDir = dir;
    }
  }
  return [bestDir !== -1, bestDir];
}

/** Distância prevista do foguete se eu usar `ctrl` (`predictDistanceFromRocket`). */
export function predictDistanceFromRocket(bot: RobotCore, rocketIn: RocketState, ctrl: number): number {
  const maxPredictionFrames = 10;
  let rPos = rocketIn.pos.local().add(rocketIn.vel.mul(bot.averageLag));
  const rVel = rocketIn.vel;
  const rRoomX = rocketIn.pos.roomX;
  const rRoomY = rocketIn.pos.roomY;
  const player = bot.futureMe.cloneBot();
  const sameRoom = (): boolean => player.pos.roomX === rRoomX && player.pos.roomY === rRoomY;
  let frames: number;
  for (frames = 0; frames < maxPredictionFrames; ++frames) {
    // subtrai os frames: prefere a saída mais rápida
    if (!sameRoom()) return ROOM_WIDTH + ROOM_HEIGHT - frames;
    const diff = player.pos.local().sub(rPos);
    const dVel = rVel.sub(player.vel);
    const timeToPlane = dot(dVel, diff) / dVel.mag2();
    if (timeToPlane <= 1) {
      if (timeToPlane > 0) {
        rPos = rPos.add(rVel.mul(timeToPlane));
        bot.extrapolate(player, [ctrl], timeToPlane);
      }
      break;
    }
    rPos = rPos.add(rVel);
    bot.extrapolate(player, [ctrl], 1);
  }
  return sameRoom() ? player.pos.local().sub(rPos).mag() : ROOM_WIDTH + ROOM_HEIGHT - frames - 1;
}

/** Foge do foguete na direção que mais se afasta dele (`EscapeRocket`). */
export function escapeRocket(bot: RobotCore, mrock: number): number {
  let bestDistance = 0;
  let best = 0;
  const rocket = bot.fx.world.rockets[mrock]!;
  for (let dir = 0; dir < 8; ++dir) {
    const ctrl = controlsFromDirection(dir) | Ctl.strafe | Ctl.run;
    const dist = predictDistanceFromRocket(bot, rocket, ctrl);
    if (dist > bestDistance) {
      bestDistance = dist;
      best = ctrl;
    }
  }
  return best;
}

/** Foge de explosão de deathbringer para a sala vizinha mais perto (`EscapeExplosion`). */
export function escapeExplosion(bot: RobotCore): number {
  if (!explosionInRoom(bot, bot.myPos.roomX, bot.myPos.roomY) && !imminentExplosionHere(bot)) return 0;
  let bestRoom = null;
  // sempre para a sala mais perto, onde quer que esteja a explosão
  let shortestDistance = 1e99;
  for (const ni of bot.myArea().neighbors) {
    if (explosionInRoom(bot, ni.area.room.x, ni.area.room.y)) continue;
    const dist = bot.distanceFromDoor(ni);
    if (dist < shortestDistance) {
      bestRoom = ni;
      shortestDistance = dist;
    }
  }
  return bestRoom ? moveToDoor(bot, bestRoom) : 0;
}

/** Ajusta a posição para alinhar o tiro com o alvo (`Aim`, mira em 8 direções). */
export function aim(bot: RobotCore, i: number): number {
  const d = bot.predictPlayer(bot.player(i)).sub(bot.myPos.local());
  const [level, dir] = tryAimTradTurning(bot, i);
  if (level === AimLevel.Full && dir === bot.myGundir) return 0;
  if (level === AimLevel.None || dir !== bot.myGundir) return moveTo(bot, d, PLAYER_RADIUS + PLAYER_RADIUS);
  // quase na mira: anda de lado
  let ctrl = Ctl.run | Ctl.strafe;
  const g = bot.myGundir;
  if (g === 0 || g === 2 || g === 4 || g === 6) {
    if (d.x > 0) ctrl |= Ctl.right;
    else if (d.x < 0) ctrl |= Ctl.left;
    if (d.y > 0) ctrl |= Ctl.down;
    else if (d.y < 0) ctrl |= Ctl.up;
  } else if (Math.abs(d.y) > Math.abs(d.x)) ctrl |= d.y < 0 ? Ctl.up : Ctl.down;
  else ctrl |= d.x < 0 ? Ctl.left : Ctl.right;
  return ctrl;
}

/** Companheiros amontoados comigo: não vale desviar de foguete (`IsMassive`). */
export function isMassive(bot: RobotCore): boolean {
  let d = new Vec(0, 0);
  let n = 0;
  for (const pl of bot.fx.players) {
    if (!pl.used || !bot.isMyTeam(pl) || pl.dead || !bot.here(pl)) continue;
    const diff = bot.predictPlayer(pl).sub(bot.myPos.local());
    d = d.add(new Vec(Math.abs(diff.x), Math.abs(diff.y)));
    ++n;
  }
  return n > 1 ? d.div(n).mag() <= 2 * PLAYER_RADIUS : false;
}

