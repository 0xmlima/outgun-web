// SPDX-License-Identifier: GPL-2.0-or-later
// Adaptador entre os golden traces e a simulação TS (`@outgun/sim`). Cresce a cada card do épico
// E2: hoje cobre o que já foi portado (movimento, quiques, troca de sala, expiração de power-ups
// temporizados). Partes ainda não portadas lançam erro se forem exercitadas.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMapFile } from '@outgun/content';
import { applyGamemod, codeDefaults, type GameSettings } from '@outgun/settings';
import {
  applyPhysics,
  FlagState,
  PLAYER_RADIUS,
  PlayerState,
  Position,
  randomShuffle,
  Vec,
  WorldState,
  type GameMap,
  type PhysicsCallbacks,
  type PhysicsContext,
  type Rng,
} from '@outgun/sim';
import type { SimAdapter } from './run.js';
import type { TraceCoords, TraceFlag, TraceHeader, TracePlayer, TraceState } from './trace.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const mapCache = new Map<number, GameMap>();

/** Mapa do trace, encontrado pelo CRC entre `maps/` e `cmaps/`. */
export function mapByCrc(crc: number): GameMap {
  const cached = mapCache.get(crc);
  if (cached) return cached;
  for (const dir of ['maps', 'cmaps']) {
    for (const file of readdirSync(join(repoRoot, dir))) {
      if (!file.endsWith('.txt')) continue;
      const result = parseMapFile(file, readFileSync(join(repoRoot, dir, file)));
      if (result.ok) mapCache.set(result.map.crc, result.map);
    }
  }
  const map = mapCache.get(crc);
  if (!map) throw new Error(`mapa com CRC ${crc} não encontrado em maps/ ou cmaps/`);
  return map;
}

const toPosition = (c: TraceCoords) => new Position(c[0], c[1], c[2], c[3]);
const toCoords = (p: Position): TraceCoords => [p.roomX, p.roomY, p.x, p.y];

function toFlag(f: TraceFlag): FlagState {
  const flag = new FlagState(toPosition(f.home), toPosition(f.pos));
  flag.status = f.status === 0 ? 'base' : f.status === 1 ? 'carried' : 'dropped';
  flag.carrier = f.carrier;
  return flag;
}

/** Callbacks do servidor (`ServerPhysicsCallbacks`, src/world.cpp:1636), no que já foi portado. */
class ServerCallbacks implements PhysicsCallbacks {
  constructor(private readonly world: WorldState) {}
  collideToRockets() {
    return true;
  }
  collidesToRockets(pid: number) {
    return this.world.frame >= (this.world.players[pid] as PlayerState).startTakeDamageFrame;
  }
  collidesToPlayers(pid: number) {
    return this.collidesToRockets(pid);
  }
  gatherMovementDistance() {
    return true;
  }
  allowRoomChange() {
    return true;
  }
  addMovementDistance(pid: number, distance: number) {
    const pl = this.world.players[pid] as PlayerState;
    pl.stats.movement += distance;
    this.world.teams[pl.team].movement += distance;
  }
  playerScreenChange() {}
  rocketHitWall(rid: number) {
    (this.world.rockets[rid] as { owner: number }).owner = -1;
  }
  rocketHitPlayer(): boolean {
    throw new Error('foguete acertando jogador: ainda não portado (OG-022/OG-024)');
  }
  playerHitWall() {}
  playerHitPlayer() {
    // `player_collisions normal`; os efeitos de `special` entram no OG-023.
    return { deaths: [false, false] as [boolean, boolean], bounceStrength1: 1, bounceStrength2: 1 };
  }
  rocketOutOfBounds(rid: number) {
    (this.world.rockets[rid] as { owner: number }).owner = -1;
  }
  shouldApplyPhysicsToPlayer(pid: number) {
    return !(this.world.players[pid] as PlayerState).dead;
  }
}

export class SimTraceAdapter implements SimAdapter {
  private settings!: GameSettings;
  private map!: GameMap;
  private header!: TraceHeader;
  private world!: WorldState;
  private pre!: TraceState;

  setup(header: TraceHeader): void {
    this.header = header;
    this.map = mapByCrc(header.mapCrc);
    const result = applyGamemod(codeDefaults(), header.gamemod);
    this.settings = result.settings;
  }

  load(state: TraceState): void {
    this.pre = state;
    const world = new WorldState(this.map, this.header.maxplayers);
    world.frame = state.frame;
    for (const p of state.players) {
      const pl = new PlayerState(p.pid, p.team as 0 | 1);
      this.copyPhysical(pl, p);
      this.copyInputs(pl, p);
      world.players[p.pid] = pl;
    }
    state.rockets.forEach((r) => {
      const rk = world.rockets[r.id]!;
      rk.owner = r.owner;
      rk.team = r.team;
      rk.power = r.power !== 0;
      rk.pos = toPosition(r.pos);
      rk.vel = new Vec(r.vel[0], r.vel[1]);
      rk.direction = r.direction;
    });
    state.teams.forEach((t, i) => {
      const team = world.teams[i as 0 | 1];
      team.movement = t.movement;
      team.flags.push(...t.flags.map(toFlag));
    });
    world.wildFlags.push(...state.wildFlags.map(toFlag));
    this.world = world;
  }

  applyInputs(state: TraceState): void {
    this.pre = state;
    for (const p of state.players) {
      const pl = this.world.players[p.pid];
      if (pl) this.copyInputs(pl, p);
    }
  }

  step(rng: Rng, time: number): TraceState {
    const world = this.world;
    world.frame = this.pre.frame;
    world.time = time;
    // ServerWorld::simulateFrame: ordem aleatória dos jogadores (n - 1 chamadas a rand())
    const order = world.players.filter((p): p is PlayerState => p !== undefined);
    randomShuffle(order, rng);
    // simulatePlayerPrePhysics: expiração de turbo e power (afeta a aceleração deste frame)
    for (const pl of order) {
      if (pl.turbo && time > pl.turboTime) pl.turbo = false;
      if (pl.power && time > pl.powerTime) pl.power = false;
    }
    const ctx: PhysicsContext = { world, physics: this.settings.physics };
    applyPhysics(ctx, new ServerCallbacks(world), PLAYER_RADIUS, 1);
    world.frame++;
    return this.snapshot();
  }

  private copyPhysical(pl: PlayerState, p: TracePlayer): void {
    pl.dead = p.dead !== 0;
    pl.pos = toPosition(p.pos);
    pl.vel = new Vec(p.vel[0], p.vel[1]);
    pl.health = p.health;
    pl.energy = p.energy;
    pl.weapon = p.weapon;
    pl.shield = p.shield;
    pl.power = p.power !== 0;
    pl.powerTime = p.powerTime;
    pl.turbo = p.turbo !== 0;
    pl.turboTime = p.turboTime;
    pl.visibility = p.visibility;
    pl.shadowTime = p.shadowTime;
    pl.deathbringer = p.deathbringer !== 0;
    pl.deathbringerEnd = p.deathbringerEnd;
    pl.deathbringerAttacker = p.deathbringerAttacker;
    pl.nextShootFrame = p.nextShootFrame;
    pl.startTakeDamageFrame = p.startTakeDamageFrame;
    pl.stats.movement = p.stats.movement;
  }

  private copyInputs(pl: PlayerState, p: TracePlayer): void {
    pl.controls = p.controls;
    pl.accelerationMode = p.accelerationMode === 1 ? 'gun' : 'world';
    pl.gundir = p.gundir;
    pl.attack = p.attack !== 0;
    pl.attackOnce = p.attackOnce !== 0;
    pl.attackGunDir = p.attackGunDir;
  }

  /** Estado no formato do trace: o "pre" com os campos que a sim já calcula substituídos. */
  private snapshot(): TraceState {
    const out = structuredClone(this.pre);
    out.players = out.players.map((p) => {
      const pl = this.world.players[p.pid] as PlayerState;
      return {
        ...p,
        pos: toCoords(pl.pos),
        vel: [pl.vel.x, pl.vel.y],
        turbo: Number(pl.turbo),
        power: Number(pl.power),
        stats: { ...p.stats, movement: pl.stats.movement },
      };
    });
    out.teams = [
      { ...out.teams[0], movement: this.world.teams[0].movement },
      { ...out.teams[1], movement: this.world.teams[1].movement },
    ];
    return out;
  }
}

/** Recorte de campos comparados no movimento (OG-021). */
export const movementFields = (s: TraceState) => ({
  players: s.players.map((p) => ({ pid: p.pid, pos: p.pos, vel: p.vel, movement: p.stats.movement })),
  teamMovement: s.teams.map((t) => t.movement),
});
