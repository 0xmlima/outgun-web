// SPDX-License-Identifier: GPL-2.0-or-later
// Criação e avanço de foguetes compartilhados por servidor e cliente: `WorldBase::shootRockets`,
// `WorldBase::addRocket` e `WorldBase::rocketFrameAdvance` (src/world.cpp:1300-1410, 3052-3066).
// O cliente cria os foguetes de `rocketFire` com a mesma formação, já avançados pelos frames de atraso.
import { N_PI_2, ROCKET_RADIUS, SHOT_DELTA_X } from '../constants.js';
import { Vec } from '../geometry/vec.js';
import { adjustGunDirection, gunDirectionToRad } from './controls.js';
import type { PhysicsCallbacks, PhysicsContext } from './physics.js';
import type { Position, RocketState } from './state.js';

/** Formações de tiro por nível de arma (src/world.cpp:1380): foguetes à frente e desvios em oitavos. */
const FORMATIONS: readonly { forward: 1 | 2 | 3; directions: readonly number[] }[] = [
  { forward: 1, directions: [] },
  { forward: 2, directions: [] },
  { forward: 3, directions: [] },
  { forward: 2, directions: [-1, 1] },
  { forward: 3, directions: [-2, 2] },
  { forward: 2, directions: [-1, 1, -2, 2] },
  { forward: 3, directions: [-2, 2, -3, 3] },
  { forward: 2, directions: [-1, 1, -2, 2, -3, 3] },
  { forward: 3, directions: [-1, 1, -2, 2, -3, 3] },
];

export interface RocketShot {
  owner: number;
  team: number;
  /** Posição de saída (inteira, como vai na rede). */
  pos: Position;
  power: boolean;
  /** Direção da arma em oitavos. */
  dir: number;
  /** Frames que os foguetes já voaram (o cliente recebe o tiro atrasado). */
  frameAdvance: number;
}

/** `WorldBase::addRocket`: cria o foguete já avançado 15 px (não acerta quem está colado). */
export function addRocket(ctx: PhysicsContext, rid: number, shot: RocketShot, dir: number, xdelta: number, cb: PhysicsCallbacks): void {
  const r = ctx.world.rockets[rid] as RocketState;
  r.owner = shot.owner;
  r.team = shot.team;
  r.power = shot.power;
  r.pos = shot.pos.clone();
  r.direction = dir;
  const deg = gunDirectionToRad(dir);
  const room = ctx.world.map.room({ x: r.pos.roomX, y: r.pos.roomY });
  const physics = ctx.physics;

  if (xdelta) {
    // foguetes paralelos: primeiro desloca para o lado
    r.vel = new Vec(Math.cos(deg + N_PI_2), Math.sin(deg + N_PI_2)).mul(xdelta * SHOT_DELTA_X);
    const wallTime = room.timeTillWall(r.pos.local(), r.vel, ROCKET_RADIUS, 1.01).time;
    r.pos.move(r.vel, 1);
    if (wallTime < 1) {
      cb.rocketHitWall(rid, r.power);
      return;
    }
  }
  r.vel = new Vec(Math.cos(deg), Math.sin(deg)).mul(physics.rocketSpeed);
  const advance = 15 / physics.rocketSpeed + shot.frameAdvance;
  const wallTime = room.timeTillWall(r.pos.local(), r.vel, ROCKET_RADIUS, advance * 1.01).time;
  if (wallTime <= advance) {
    r.pos.move(r.vel, wallTime);
    cb.rocketHitWall(rid, r.power);
    return;
  }
  r.pos.move(r.vel, advance);
  if (r.pos.isOutOfBounds()) cb.rocketOutOfBounds(rid);
}

/** `WorldBase::shootRockets`: um foguete por slot de `rids`, na formação do nível de arma (`rids.length`). */
export function shootRocketFormation(ctx: PhysicsContext, rids: readonly number[], shot: RocketShot, cb: PhysicsCallbacks): void {
  const form = FORMATIONS[rids.length - 1];
  if (!form) throw new Error(`nível de arma inválido: ${rids.length}`);
  const add = (index: number, direction: number, xdelta: number) => addRocket(ctx, rids[index] as number, shot, direction, xdelta, cb);
  if (form.forward === 1) add(0, shot.dir, 0);
  else if (form.forward === 2) {
    add(0, shot.dir, -1);
    add(1, shot.dir, 1);
  } else {
    add(0, shot.dir, 0);
    add(1, shot.dir, -2);
    add(2, shot.dir, 2);
  }
  for (let ri = form.forward; ri < rids.length; ri++) add(ri, adjustGunDirection(shot.dir, form.directions[ri - form.forward] as number), 0);
}

/** `WorldBase::rocketFrameAdvance`: foguetes andam `frames` frames sem colidir com jogadores. */
export function rocketFrameAdvance(ctx: PhysicsContext, frames: number, cb: PhysicsCallbacks): void {
  ctx.world.rockets.forEach((rk, rid) => {
    if (rk.owner === -1) return;
    const room = ctx.world.map.room({ x: rk.pos.roomX, y: rk.pos.roomY });
    const wallTime = room.timeTillWall(rk.pos.local(), rk.vel, ROCKET_RADIUS, frames).time;
    if (wallTime < frames) {
      rk.pos.move(rk.vel, wallTime);
      cb.rocketHitWall(rid, rk.power);
    } else {
      rk.pos.move(rk.vel, frames);
      if (rk.pos.isOutOfBounds()) cb.rocketOutOfBounds(rid);
    }
  });
}
