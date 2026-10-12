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
  CarriedFlag,
  DeathbringerExplosion,
  FlagState,
  PlayerState,
  Position,
  ServerSim,
  Vec,
  WorldState,
  type GameMap,
  type PowerupKind,
  type PowerupState,
  type RocketState,
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

export class SimTraceAdapter implements SimAdapter {
  private settings!: GameSettings;
  private map!: GameMap;
  private header!: TraceHeader;
  private world!: WorldState;
  private sim!: ServerSim;
  private pre!: TraceState;

  setup(header: TraceHeader): void {
    this.header = header;
    this.map = mapByCrc(header.mapCrc);
    this.settings = applyGamemod(codeDefaults(), header.gamemod).settings;
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
      const rk = world.rockets[r.id] as RocketState;
      rk.owner = r.owner;
      rk.team = r.team;
      rk.power = r.power !== 0;
      rk.pos = toPosition(r.pos);
      rk.vel = new Vec(r.vel[0], r.vel[1]);
      rk.direction = r.direction;
    });
    state.teams.forEach((t, i) => {
      const team = world.teams[i as 0 | 1];
      Object.assign(team, { score: t.score, kills: t.kills, deaths: t.deaths, suicides: t.suicides, flagsTaken: t.flagsTaken, flagsDropped: t.flagsDropped, flagsReturned: t.flagsReturned, shots: t.shots, hits: t.hits, shotsTaken: t.shotsTaken, movement: t.movement });
      team.flags.push(...t.flags.map(toFlag));
    });
    world.wildFlags.push(...state.wildFlags.map(toFlag));
    this.world = world;
    this.sim = new ServerSim(world, this.settings, { rand: () => 0 });
    world.explosions = state.deathbringers.map((db) => {
      const e = new DeathbringerExplosion(db.frame0, toPosition(db.pos), db.owner, db.team);
      e.outsideMask = db.outsideMask;
      return e;
    });
    state.powerups.forEach((p) => {
      const item = world.items[p.id] as PowerupState;
      item.kind = p.kind as PowerupKind;
      item.respawnTime = p.respawnTime;
      item.pos = toPosition(p.pos);
    });
  }

  applyInputs(state: TraceState): void {
    this.pre = state;
    for (const p of state.players) {
      const pl = this.world.players[p.pid];
      if (pl) this.copyInputs(pl, p);
    }
  }

  step(rng: Rng, time: number): TraceState {
    this.world.frame = this.pre.frame;
    this.world.time = time;
    this.sim.rng = rng;
    this.sim.simulateFrame();
    return this.snapshot();
  }

  private copyPhysical(pl: PlayerState, p: TracePlayer): void {
    pl.dead = p.dead !== 0;
    pl.pos = toPosition(p.pos);
    pl.vel = new Vec(p.vel[0], p.vel[1]);
    pl.health = p.health;
    pl.energy = p.energy;
    pl.megabonus = p.megabonus;
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
    pl.framesToRespawn = p.framesToRespawn;
    pl.extraFramesToRespawn = p.extraFramesToRespawn;
    pl.respawnToBase = p.respawnToBase !== 0;
    pl.dropKey = p.dropKey !== 0;
    pl.droppedFlag = p.droppedFlag !== 0;
    pl.awaitingClientReadies = p.awaitingClientReadies;
    pl.stats = { ...p.stats, dead: p.stats.dead !== 0, carriedFlag: p.stats.carriedFlag as CarriedFlag };
  }

  private copyInputs(pl: PlayerState, p: TracePlayer): void {
    pl.controls = p.controls;
    pl.accelerationMode = p.accelerationMode === 1 ? 'gun' : 'world';
    pl.gundir = p.gundir;
    pl.attack = p.attack !== 0;
    pl.attackOnce = p.attackOnce !== 0;
    pl.attackGunDir = p.attackGunDir;
  }

  /** Estado no formato do trace: o "pre" com tudo o que a sim calcula substituído. */
  private snapshot(): TraceState {
    const out = structuredClone(this.pre);
    const w = this.world;
    out.players = out.players.map((p) => {
      const pl = w.players[p.pid] as PlayerState;
      return {
        ...p,
        dead: Number(pl.dead),
        pos: toCoords(pl.pos),
        vel: [pl.vel.x, pl.vel.y],
        attackOnce: Number(pl.attackOnce),
        health: pl.health,
        energy: pl.energy,
        megabonus: pl.megabonus,
        weapon: pl.weapon,
        shield: pl.shield,
        power: Number(pl.power),
        powerTime: pl.powerTime,
        turbo: Number(pl.turbo),
        turboTime: pl.turboTime,
        visibility: pl.visibility,
        deathbringer: Number(pl.deathbringer),
        shadowTime: pl.shadowTime,
        deathbringerEnd: pl.deathbringerEnd,
        deathbringerAttacker: pl.deathbringerAttacker,
        nextShootFrame: pl.nextShootFrame,
        startTakeDamageFrame: pl.startTakeDamageFrame,
        framesToRespawn: pl.framesToRespawn,
        extraFramesToRespawn: pl.extraFramesToRespawn,
        stats: { ...pl.stats, dead: Number(pl.stats.dead), carriedFlag: pl.stats.carriedFlag },
      };
    });
    out.rockets = w.rockets.flatMap((r, id) =>
      r.owner === -1 ? [] : [{ id, owner: r.owner, team: r.team, power: Number(r.power), pos: toCoords(r.pos), vel: [r.vel.x, r.vel.y] as [number, number], direction: r.direction }],
    );
    out.deathbringers = w.explosions.map((e) => ({ frame0: e.frame0, pos: toCoords(e.pos), owner: e.ownerPid, team: e.ownerTeam, outsideMask: e.outsideMask }));
    out.powerups = w.items.flatMap((it, id) => (it.kind === 7 ? [] : [{ id, kind: it.kind, respawnTime: it.respawnTime, pos: toCoords(it.pos) }]));
    out.teams = [0, 1].map((i) => {
      const t = w.teams[i as 0 | 1];
      return { ...out.teams[i as 0 | 1], score: t.score, kills: t.kills, deaths: t.deaths, suicides: t.suicides, flagsTaken: t.flagsTaken, flagsDropped: t.flagsDropped, flagsReturned: t.flagsReturned, shots: t.shots, hits: t.hits, shotsTaken: t.shotsTaken, movement: t.movement };
    }) as TraceState['teams'];
    return out;
  }
}

/** Recorte de campos comparados no movimento (OG-021). */
export const movementFields = (s: TraceState) => ({
  players: s.players.map((p) => ({ pid: p.pid, pos: p.pos, vel: p.vel, movement: p.stats.movement })),
  teamMovement: s.teams.map((t) => t.movement),
});

/** Tiro e foguetes (OG-022): foguetes completos, intervalo de tiro e contagem de tiros. */
export const rocketFields = (s: TraceState) => ({
  ...movementFields(s),
  rockets: s.rockets,
  shooters: s.players.map((p) => ({ pid: p.pid, nextShootFrame: p.nextShootFrame, attackOnce: p.attackOnce, shots: p.stats.shots })),
  teamShots: s.teams.map((t) => t.shots),
});

/** Vida, energia, dano e morte (OG-024) e power-ups (OG-025): o jogador inteiro e os itens do chão. */
export const combatFields = (s: TraceState) => ({
  ...rocketFields(s),
  // Só o que tem efeito no jogo: itens reais (tipo e posição) e os que vão reaparecer (tipo e
  // quando). Slots guardam posição/tempo antigos no original, que nunca são lidos.
  deathbringers: s.deathbringers,
  powerups: s.powerups.map((p) => (p.kind === 8 ? { id: p.id, kind: p.kind, respawnTime: p.respawnTime } : { id: p.id, kind: p.kind, pos: p.pos })),
  players: s.players.map((p) => {
    const { color: _c, bot: _b, wantChangeTeams: _w, awaitingClientReadies: _a, ...rest } = p;
    return rest;
  }),
  teams: s.teams.map((t) => ({ kills: t.kills, deaths: t.deaths, shots: t.shots, hits: t.hits, shotsTaken: t.shotsTaken, movement: t.movement, score: t.score })),
});
