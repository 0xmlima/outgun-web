// SPDX-License-Identifier: GPL-2.0-or-later
// Troca de sala com velocidade zero num eixo (OG-428, D-81): antes a divisão por zero virava NaN e o
// laço da física não terminava.
import { codeDefaults } from '@outgun/settings';
import { describe, expect, it } from 'vitest';
import { ROOM_HEIGHT, ROOM_WIDTH } from '../constants.js';
import { Vec } from '../geometry/vec.js';
import { GameMap } from '../map/map.js';
import { applyPhysics, type PhysicsCallbacks } from './physics.js';
import { PlayerState, Position, WorldState } from './state.js';

const callbacks = (world: WorldState): PhysicsCallbacks => ({
  collideToRockets: () => false,
  collidesToRockets: () => false,
  collidesToPlayers: () => true,
  gatherMovementDistance: () => false,
  allowRoomChange: () => true,
  addMovementDistance: () => {},
  playerScreenChange: () => {},
  rocketHitWall: () => {},
  rocketHitPlayer: () => false,
  playerHitWall: () => {},
  playerHitPlayer: () => ({ deaths: [false, false], bounceStrength1: 1, bounceStrength2: 1 }),
  rocketOutOfBounds: () => {},
  shouldApplyPhysicsToPlayer: (pid) => world.players[pid]?.dead === false,
});

function step(x: number, y: number, vel: Vec, fraction = 1): PlayerState {
  const world = new WorldState(new GameMap(3, 3, 'teste', '', 0), 16);
  const pl = new PlayerState(0, 0);
  pl.pos = new Position(1, 1, x, y);
  pl.vel = vel;
  pl.dead = false;
  pl.deathbringerEnd = Infinity; // sob o efeito: sem aceleração, só o empurrão
  world.players[0] = pl;
  applyPhysics({ world, physics: codeDefaults().physics }, callbacks(world), 15, fraction);
  return pl;
}

describe('troca de sala (changeRoomIfOutside)', () => {
  it('fora da sala com velocidade zero no eixo: troca de sala sem NaN', () => {
    for (const [x, y, vel] of [
      [ROOM_WIDTH + 3, 100, new Vec(0, 4)],
      [-3, 100, new Vec(0, -4)],
      [200, ROOM_HEIGHT + 2, new Vec(5, 0)],
      [200, -2, new Vec(0, 0)],
    ] as const) {
      for (const fraction of [1, 0.5, 0.01]) {
        const pl = step(x, y, vel, fraction);
        expect(Number.isFinite(pl.pos.x) && Number.isFinite(pl.pos.y)).toBe(true);
        expect(pl.pos.x).toBeGreaterThanOrEqual(0);
        expect(pl.pos.x).toBeLessThanOrEqual(ROOM_WIDTH);
        expect(pl.pos.y).toBeGreaterThanOrEqual(0);
        expect(pl.pos.y).toBeLessThanOrEqual(ROOM_HEIGHT);
      }
    }
  });

  it('saindo pela direita em movimento: vai para a sala ao lado como antes', () => {
    const pl = step(ROOM_WIDTH - 10, 100, new Vec(30, 0));
    expect(pl.pos.roomX).toBe(2);
    expect(pl.pos.x).toBeGreaterThan(0);
    expect(pl.pos.x).toBeLessThan(30);
  });
});
