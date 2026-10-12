// SPDX-License-Identifier: GPL-2.0-or-later
// Física de jogadores e foguetes: port de `WorldBase::applyPlayerAcceleration`, `applyPhysics`,
// `applyPhysicsToRoom`, `applyPhysicsToPlayerInIsolation`, `executeBounce` e `limitPlayerSpeed`
// (src/world.cpp:1209-1275, 2693-3050). Efeitos de jogo (dano, morte, estatísticas) ficam nos
// callbacks, como no original.
import { ROCKET_RADIUS, ROOM_HEIGHT, ROOM_WIDTH, SHIELD_RADIUS_ADD } from '../constants.js';
import { timeTillPlayerPlayerCollision, timeTillPlayerRocketCollision, type BounceData } from '../geometry/bounce.js';
import { dot, Vec } from '../geometry/vec.js';
import type { Room } from '../map/map.js';
import { positiveModulo } from '../math.js';
import type { PhysicsSettings } from '@outgun/settings';
import { gunDirectionToRad, isDown, isLeft, isRight, isRun, isUp } from './controls.js';
import type { PlayerState, RocketState, WorldState } from './state.js';

export interface PlayerHitResult {
  deaths: [boolean, boolean];
  bounceStrength1: number;
  bounceStrength2: number;
}

/** `PhysicsCallbacksBase` (src/world.h:849). */
export interface PhysicsCallbacks {
  collideToRockets(): boolean;
  collidesToRockets(pid: number): boolean;
  collidesToPlayers(pid: number): boolean;
  gatherMovementDistance(): boolean;
  allowRoomChange(): boolean;
  addMovementDistance(pid: number, distance: number): void;
  playerScreenChange(pid: number): void;
  /** O chamador não remove o foguete. */
  rocketHitWall(rid: number, power: boolean): void;
  /** true se o jogador morreu (sai da simulação do frame). */
  rocketHitPlayer(rid: number, pid: number): boolean;
  playerHitWall(pid: number): void;
  playerHitPlayer(pid1: number, pid2: number, speed: number): PlayerHitResult;
  /** O chamador não remove o foguete. */
  rocketOutOfBounds(rid: number): void;
  shouldApplyPhysicsToPlayer(pid: number): boolean;
}

/** Contexto que a física precisa além do estado: configurações. */
export interface PhysicsContext {
  world: WorldState;
  physics: PhysicsSettings;
}

const room = (ctx: PhysicsContext, x: number, y: number): Room => ctx.world.map.room({ x, y });

/** Aceleração, arrasto e atrito do frame (RN-FIS-01..06). */
export function applyPlayerAcceleration(ctx: PhysicsContext, pl: PlayerState): void {
  const { physics, world } = ctx;
  let playerAccel = physics.acceleration;
  if (pl.turbo) playerAccel *= physics.turboMul;
  if (isRun(pl.controls)) {
    playerAccel *= physics.runMul;
    if (world.carriesEnemyOrWildFlag(pl)) playerAccel *= physics.flagMul;
  }

  pl.vel = pl.vel.mul(1 - physics.drag);

  // atrito: redução constante da velocidade
  const spd = pl.vel.mag();
  if (spd <= physics.friction || spd < 0.001) pl.vel = new Vec(0, 0);
  else pl.vel = pl.vel.mul(1 - physics.friction / spd);

  if (pl.underDeathbringerEffect(world.time)) return;

  let sideAcc = (isRight(pl.controls) ? 1 : 0) - (isLeft(pl.controls) ? 1 : 0);
  let forwAcc = (isUp(pl.controls) ? 1 : 0) - (isDown(pl.controls) ? 1 : 0);
  if (sideAcc === 0 && forwAcc === 0) return;
  if (sideAcc !== 0 && forwAcc !== 0) {
    sideAcc /= Math.sqrt(2);
    forwAcc /= Math.sqrt(2);
  }

  let acc: Vec;
  if (pl.accelerationMode === 'world' || !physics.allowFreeTurning) acc = new Vec(sideAcc, -forwAcc);
  else {
    const rad = gunDirectionToRad(pl.gundir);
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    acc = new Vec(dirX * forwAcc - dirY * sideAcc, dirY * forwAcc + dirX * sideAcc);
  }
  if (Math.abs(pl.vel.x) > 0.001 || Math.abs(pl.vel.y) > 0.001) {
    // componente paralela à velocidade (freio se oposta) × brake_mul; perpendicular × turn_mul
    const parMul = dot(acc, pl.vel) / pl.vel.mag2();
    let par = pl.vel.mul(parMul);
    const perp = acc.sub(par);
    if (parMul < 0) par = par.mul(physics.brakeMul);
    acc = perp.mul(physics.turnMul).add(par);
  }
  pl.vel = pl.vel.add(acc.mul(playerAccel));
}

/** Limite rígido de velocidade (por eixo, aproximado como no original). */
export function limitPlayerSpeed(ctx: PhysicsContext, pl: PlayerState): void {
  const limit = ctx.physics.maxRunSpeed * ctx.physics.turboMul * 4;
  if (Math.abs(pl.vel.x) > limit || Math.abs(pl.vel.y) > limit) pl.vel = pl.vel.mul(limit / pl.vel.mag());
}

/** Quique na parede: inverte a componente na direção do contato e perde 5%. */
export function executeWallBounce(pl: PlayerState, bounceVec: Vec, plyRadius: number): void {
  const mul = (2 * dot(pl.vel, bounceVec)) / (plyRadius * plyRadius);
  pl.vel = pl.vel.sub(bounceVec.mul(mul));
  pl.vel = pl.vel.mul(0.95);
}

/** Quique entre dois jogadores; devolve [morreu1, morreu2]. */
export function executePlayerBounce(ctx: PhysicsContext, pl1: PlayerState, pl2: PlayerState, cb: PhysicsCallbacks): [boolean, boolean] {
  const ds = pl2.pos.local().sub(pl1.pos.local());
  const r = ds.mag();
  let tVar = dot(pl1.vel, ds) / (r * r);
  const k1 = r * tVar;
  const v1 = pl1.vel.sub(ds.mul(tVar));
  tVar = -dot(pl2.vel, ds) / (r * r);
  const k2 = r * tVar;
  const v2 = pl2.vel.add(ds.mul(tVar));

  const res = cb.playerHitPlayer(pl1.pid, pl2.pid, Math.abs(k2 - k1));

  const newk1 = k1 + (-k2 - k1) * res.bounceStrength1;
  const newk2 = k2 + (-k1 - k2) * res.bounceStrength2;
  const baseSpeedMul = 0.9;
  pl1.vel = v1.add(ds.mul(newk1 / r)).mul(baseSpeedMul);
  pl2.vel = v2.sub(ds.mul(newk2 / r)).mul(baseSpeedMul);
  limitPlayerSpeed(ctx, pl1);
  limitPlayerSpeed(ctx, pl2);
  return res.deaths;
}

function timeTillBounce(ctx: PhysicsContext, pl: PlayerState, plyRadius: number, maxFraction: number): BounceData {
  return room(ctx, pl.pos.roomX, pl.pos.roomY).timeTillWall(pl.pos.local(), pl.vel, plyRadius, maxFraction);
}

function rocketTimeTillWall(ctx: PhysicsContext, rk: RocketState, maxFraction: number): number {
  return room(ctx, rk.pos.roomX, rk.pos.roomY).timeTillWall(rk.pos.local(), rk.vel, ROCKET_RADIUS, maxFraction).time;
}

/**
 * Se o jogador saiu da sala, troca de sala (mundo toroidal) e devolve o tempo excedente a reaplicar;
 * senão devolve undefined.
 */
function changeRoomIfOutside(ctx: PhysicsContext, pl: PlayerState): number | undefined {
  const { world } = ctx;
  let rdx = 0;
  let rdy = 0;
  let tbx = -1;
  let tby = -1;
  if (pl.pos.x < 0) {
    rdx = -1;
    tbx = pl.pos.x / pl.vel.x;
  } else if (pl.pos.x > ROOM_WIDTH) {
    rdx = 1;
    tbx = (pl.pos.x - ROOM_WIDTH) / pl.vel.x;
  }
  if (pl.pos.y < 0) {
    rdy = -1;
    tby = pl.pos.y / pl.vel.y;
  } else if (pl.pos.y > ROOM_HEIGHT) {
    rdy = 1;
    tby = (pl.pos.y - ROOM_HEIGHT) / pl.vel.y;
  }
  if (!rdx && !rdy) return undefined;
  let tb: number;
  if (tbx > tby) {
    tb = tbx;
    pl.pos.roomX = positiveModulo(pl.pos.roomX + rdx, world.map.width);
    pl.pos.x -= rdx * ROOM_WIDTH;
  } else {
    tb = tby;
    pl.pos.roomY = positiveModulo(pl.pos.roomY + rdy, world.map.height);
    pl.pos.y -= rdy * ROOM_HEIGHT;
  }
  // devolve o tempo em que o jogador passou da borda; será reaplicado na sala nova
  pl.pos.move(pl.vel, -tb);
  return tb;
}

/** Movimento de um jogador sozinho, sem colisões com outros (após trocar de sala no meio do frame). */
export function applyPhysicsToPlayerInIsolation(ctx: PhysicsContext, pl: PlayerState, plyRadius: number, fraction: number): void {
  let subFrame = 0;
  for (;;) {
    const bounce = timeTillBounce(ctx, pl, plyRadius, fraction);
    const bounceTime = bounce.time + subFrame;
    const mt = Math.min(fraction, Math.max(bounceTime, subFrame + 0.01));
    const plTime = Math.min(bounceTime - 0.001, mt);
    if (plTime > subFrame) {
      pl.pos.move(pl.vel, plTime - subFrame);
      const tb = changeRoomIfOutside(ctx, pl);
      if (tb !== undefined) {
        subFrame = Math.max(plTime - tb, subFrame + 0.01); // garante progresso
        continue;
      }
    }
    subFrame = mt;
    if (subFrame > fraction - 0.001) break;
    executeWallBounce(pl, bounce.contact, plyRadius);
  }
}

/** Um frame (ou fração) de física em todas as salas: aceleração e movimento com colisões. */
export function applyPhysics(ctx: PhysicsContext, cb: PhysicsCallbacks, plyRadius: number, fraction: number): void {
  if (fraction < 0.001) return;
  const { world } = ctx;
  const w = world.map.width;
  const h = world.map.height;
  const roomPly: number[][] = Array.from({ length: w * h }, () => []);
  const roomRock: number[][] = Array.from({ length: w * h }, () => []);
  for (let i = 0; i < world.maxPlayers; i++) {
    const pl = world.players[i];
    if (!pl || !cb.shouldApplyPhysicsToPlayer(i)) continue;
    if (pl.pos.roomX < 0 || pl.pos.roomY < 0 || pl.pos.roomX >= w || pl.pos.roomY >= h) continue;
    applyPlayerAcceleration(ctx, pl);
    (roomPly[pl.pos.roomX * h + pl.pos.roomY] as number[]).push(i);
  }
  world.rockets.forEach((rk, i) => {
    if (rk.owner !== -1) (roomRock[rk.pos.roomX * h + rk.pos.roomY] as number[]).push(i);
  });
  // salas em ordem x, depois y (como os laços do original)
  for (let rx = 0; rx < w; rx++) {
    for (let ry = 0; ry < h; ry++) {
      applyPhysicsToRoom(ctx, rx, ry, roomPly[rx * h + ry] as number[], roomRock[rx * h + ry] as number[], cb, plyRadius, fraction);
    }
  }
}

function applyPhysicsToRoom(
  ctx: PhysicsContext,
  rx: number,
  ry: number,
  rply: number[],
  rrock: number[],
  cb: PhysicsCallbacks,
  plyRadius: number,
  fraction: number,
): void {
  const { world, physics } = ctx;
  const theRoom = room(ctx, rx, ry);
  const player = (pid: number) => world.players[pid] as PlayerState;
  const rocket = (rid: number) => world.rockets[rid] as RocketState;
  const bounceOf = (pid: number, maxFraction: number) =>
    theRoom.timeTillWall(player(pid).pos.local(), player(pid).vel, plyRadius, maxFraction);

  const plyMoveMax: BounceData[] = rply.map((pid) => bounceOf(pid, fraction));
  const rockMoveMax: number[] = rrock.map((rid) => rocketTimeTillWall(ctx, rocket(rid), fraction));

  let subFrame = 0;
  for (;;) {
    // próximo quique em parede
    let minBounce = fraction + 1;
    let bPly = 0;
    let bPlyI = -1;
    rply.forEach((pid, pi) => {
      const bt = (plyMoveMax[pi] as BounceData).time;
      if (bt < minBounce) {
        minBounce = bt;
        bPlyI = pi;
        bPly = pid;
      }
    });

    // próxima colisão jogador × foguete
    let minCollision = fraction + 1;
    let cPly = 0;
    let cPlyI = -1;
    let cRock = 0;
    let cRockI = -1;
    if (cb.collideToRockets()) {
      rply.forEach((pid, pi) => {
        if (!cb.collidesToRockets(pid)) return;
        const pl = player(pid);
        rrock.forEach((rid, ri) => {
          const rk = rocket(rid);
          // foguete amigo: ignorado sem fogo amigo, e o próprio foguete nunca acerta o dono
          if (rk.team === Math.trunc(pid / world.teamSize) && (physics.friendlyFire === 0 || rk.owner === pid)) return;
          const radius = ROCKET_RADIUS + plyRadius + (pl.shield ? SHIELD_RADIUS_ADD : 0);
          const time = timeTillPlayerRocketCollision(pl.pos.local(), pl.vel, rk.pos.local(), rk.vel, radius);
          if (time < minCollision && time < (rockMoveMax[ri] as number)) {
            minCollision = time;
            cPlyI = pi;
            cPly = pid;
            cRockI = ri;
            cRock = rid;
          }
        });
      });
      minCollision += subFrame;
    }

    // próxima colisão jogador × jogador
    let minPlyCollision = fraction + 1;
    let pcPly1 = 0;
    let pcPly1I = -1;
    let pcPly2 = 0;
    let pcPly2I = -1;
    if (physics.playerCollisions !== 'no') {
      for (let pi = 0; pi < rply.length; pi++) {
        const pid = rply[pi] as number;
        if (!cb.collidesToPlayers(pid)) continue;
        for (let ti = pi + 1; ti < rply.length; ti++) {
          const tid = rply[ti] as number;
          if (!cb.collidesToPlayers(tid)) continue;
          const a = player(pid);
          const b = player(tid);
          const time = timeTillPlayerPlayerCollision(a.pos.local(), a.vel, b.pos.local(), b.vel, 2 * plyRadius);
          if (time < minPlyCollision) {
            minPlyCollision = time;
            pcPly1I = pi;
            pcPly1 = pid;
            pcPly2I = ti;
            pcPly2 = tid;
          }
        }
      }
      minPlyCollision += subFrame;
    }

    // movimento até o próximo evento
    let moveCeiling = minPlyCollision - 0.001; // -.001 para não sobrepor
    if (minBounce < subFrame + 0.01) minBounce = subFrame + 0.01; // evita quique infinito
    if (minPlyCollision < subFrame + 0.01) minPlyCollision = subFrame + 0.01;
    const eventTime = Math.min(Math.min(minCollision, minBounce), minPlyCollision);
    const mt = Math.min(fraction, eventTime);
    if (mt < moveCeiling) moveCeiling = mt;

    for (let pi = 0; pi < rply.length; ) {
      const plTime = Math.min((plyMoveMax[pi] as BounceData).time - 0.001, moveCeiling);
      if (plTime <= subFrame) {
        // esperando o quique: nada a fazer
        ++pi;
        continue;
      }
      const pid = rply[pi] as number;
      const pl = player(pid);
      pl.pos.move(pl.vel, plTime - subFrame);
      if (cb.gatherMovementDistance()) cb.addMovementDistance(pid, (plTime - subFrame) * pl.vel.mag());
      const tb = cb.allowRoomChange() ? changeRoomIfOutside(ctx, pl) : undefined;
      if (tb !== undefined) {
        applyPhysicsToPlayerInIsolation(ctx, pl, plyRadius, tb);
        cb.playerScreenChange(pid);
        // sai desta sala; os índices dos eventos são ajustados
        rply.splice(pi, 1);
        plyMoveMax.splice(pi, 1);
        const shift = (index: number) => (index >= pi ? (index === pi ? -1 : index - 1) : index);
        bPlyI = shift(bPlyI);
        cPlyI = shift(cPlyI);
        pcPly1I = shift(pcPly1I);
        pcPly2I = shift(pcPly2I);
      } else ++pi;
    }
    for (let ri = 0; ri < rrock.length; ) {
      const rid = rrock[ri] as number;
      const rk = rocket(rid);
      const wallTime = rockMoveMax[ri] as number;
      if (mt > wallTime) {
        rk.pos.move(rk.vel, wallTime - subFrame);
        cb.rocketHitWall(rid, rk.power);
        rrock.splice(ri, 1);
        rockMoveMax.splice(ri, 1);
        if (cRockI >= ri) cRockI = cRockI === ri ? -1 : cRockI - 1;
      } else {
        rk.pos.move(rk.vel, mt - subFrame);
        ++ri;
      }
    }
    subFrame = mt;
    if (subFrame > fraction - 0.001) break;

    // resolve o evento
    if (minPlyCollision < minBounce && minPlyCollision < minCollision) {
      if (pcPly1I !== -1 && pcPly2I !== -1) {
        const dead = executePlayerBounce(ctx, player(pcPly1), player(pcPly2), cb);
        if (dead[0]) {
          rply.splice(pcPly1I, 1);
          plyMoveMax.splice(pcPly1I, 1);
          if (pcPly2I > pcPly1I) --pcPly2I;
        } else {
          plyMoveMax[pcPly1I] = shiftTime(bounceOf(rply[pcPly1I] as number, fraction - subFrame), subFrame);
        }
        if (dead[1]) {
          rply.splice(pcPly2I, 1);
          plyMoveMax.splice(pcPly2I, 1);
        } else {
          plyMoveMax[pcPly2I] = shiftTime(bounceOf(rply[pcPly2I] as number, fraction - subFrame), subFrame);
        }
      }
    } else if (minCollision < minBounce) {
      if (cRockI !== -1 && cPlyI !== -1) {
        if (cb.rocketHitPlayer(cRock, cPly)) {
          rply.splice(cPlyI, 1);
          plyMoveMax.splice(cPlyI, 1);
        } else {
          plyMoveMax[cPlyI] = shiftTime(bounceOf(rply[cPlyI] as number, fraction - subFrame), subFrame);
        }
        rrock.splice(cRockI, 1);
        rockMoveMax.splice(cRockI, 1);
      }
    } else if (bPlyI !== -1) {
      executeWallBounce(player(bPly), (plyMoveMax[bPlyI] as BounceData).contact, plyRadius);
      cb.playerHitWall(bPly);
      plyMoveMax[bPlyI] = shiftTime(bounceOf(rply[bPlyI] as number, fraction - subFrame), subFrame);
    }
  }
  for (const rid of rrock) if (rocket(rid).pos.isOutOfBounds()) cb.rocketOutOfBounds(rid);
}

/** Mantém a tabela de quiques em tempo absoluto do frame. */
function shiftTime(bd: BounceData, subFrame: number): BounceData {
  return { time: bd.time + subFrame, contact: bd.contact };
}
