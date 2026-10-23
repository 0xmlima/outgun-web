// SPDX-License-Identifier: GPL-2.0-or-later
// Leitura das decisões de bots gravadas pelo oráculo (tools/parity/patches/002-bottrace.patch) e
// montagem da visão/estado do bot a partir delas. Só para testes de paridade.
import type { PhysicsSettings } from '@outgun/settings';
import { DeathbringerExplosion, FlagState, Position, PowerupKind, Vec, type GameMap, type Rng, type WorldCoords } from '@outgun/sim';
import type { AreaMap } from './areamap.js';
import { Robot } from './brain.js';
import { DistanceTableId } from './distance.js';
import { BotView } from './view.js';

type Coords = [number, number, number, number];

export interface DumpPlayer {
  used: number;
  dead?: number;
  team?: number;
  pos?: Coords;
  vel?: [number, number];
  posUpdated?: number;
  defending?: number;
  defendingAfterDeath?: number;
  name?: string;
  controls?: number;
  accelerationMode?: number;
  gundir?: number;
  deathbringer?: number;
  deathbringerAffected?: number;
  turbo?: number;
  onscreen?: number;
  fromMinimapUpdate?: number;
  prevMapPosUpdateFrame?: number;
  prevMapUpdateRoom?: [number, number];
  shadowTime?: number;
  weapon?: number;
}

export interface DumpBotState {
  destinationType: number;
  destination: number;
  immediate: [number, number];
  lastSeen: number;
  myGundir: number;
  freeWalkTarget: [number, number];
  enemiesInRoom: number;
  prevFire: number;
  gunDir: number;
  tables: [number, number][];
}

export interface DumpState {
  frame: number;
  me: number;
  bot: DumpBotState;
  seen: number[];
  players: DumpPlayer[];
}

export interface DumpBefore extends DumpState {
  maxplayers: number;
  hidden: number;
  clFrameSent: number;
  clFrameWorld: number;
  controlHistory: number[];
  settings: {
    carryOwnTeamFlag: number;
    captureAwayFromBase: number;
    lockTeamFlags: number;
    lockWildFlags: number;
    captureOnTeamFlags: number;
    captureOnWildFlags: number;
    seeMinimapPlayerProperties: number;
  };
  physics: Record<string, number>;
  rockets: { id: number; owner: number; team: number; power: number; pos: Coords; vel: [number, number] }[];
  powerups: { id: number; kind: number; pos: Coords }[];
  flags: { carried: number; atBase: number; carrier: number; pos: Coords }[][];
  explosions: { frame0: number; pos: Coords; team: number }[];
  bases: Coords[][];
}

export interface BotDump {
  before: DumpBefore;
  rand: number[];
  after: { controls: number; state: DumpState };
}

/** Entrega os `rand()` gravados e acusa consumo a mais. */
export class RecordedRng implements Rng {
  index = 0;
  constructor(private readonly values: readonly number[]) {}
  rand(): number {
    const v = this.values[this.index];
    if (v === undefined) throw new Error(`o bot pediu mais rand() que o original (${this.values.length})`);
    this.index++;
    return v;
  }
}

const pos = (c: Coords): Position => new Position(c[0], c[1], c[2], c[3]);

export function physicsFromDump(p: Record<string, number>): PhysicsSettings {
  const n = (k: string): number => p[k] ?? 0;
  return {
    friction: n('fric'),
    drag: n('drag'),
    acceleration: n('accel'),
    brakeMul: n('brakeMul'),
    turnMul: n('turnMul'),
    runMul: n('runMul'),
    turboMul: n('turboMul'),
    flagMul: n('flagMul'),
    rocketSpeed: n('rocketSpeed'),
    friendlyFire: n('friendlyFire'),
    friendlyDeathbringer: n('friendlyDb'),
    playerCollisions: (['no', 'normal', 'special'] as const)[n('playerCollisions')] ?? 'no',
    allowFreeTurning: !!n('allowFreeTurning'),
    maxRunSpeed: n('maxRunSpeed'),
  };
}

/** Monta a visão do bot gravada antes da decisão. */
export function viewFromDump(map: GameMap, b: DumpBefore): BotView {
  const s = b.settings;
  const view = new BotView(map, b.maxplayers, physicsFromDump(b.physics), {
    carryOwnTeamFlag: !!s.carryOwnTeamFlag,
    captureAwayFromBase: !!s.captureAwayFromBase,
    lockTeamFlags: !!s.lockTeamFlags,
    lockWildFlags: !!s.lockWildFlags,
    captureOnTeamFlags: !!s.captureOnTeamFlags,
    captureOnWildFlags: !!s.captureOnWildFlags,
    seeMinimapPlayerProperties: s.seeMinimapPlayerProperties,
  });
  view.frame = b.frame;
  b.players.forEach((d, i) => {
    const p = view.players[i]!;
    p.used = !!d.used;
    if (!d.used) return;
    p.dead = !!d.dead;
    p.team = d.team as 0 | 1;
    p.pos = pos(d.pos!);
    p.vel = new Vec(d.vel![0], d.vel![1]);
    p.posUpdated = d.posUpdated!;
    p.defending = !!d.defending;
    p.defendingAfterDeath = !!d.defendingAfterDeath;
    p.name = d.name ?? '';
    // o original reconhece bots pelo prefixo do nome
    p.bot = p.name.startsWith('BOT ');
    p.controls = d.controls ?? 0;
    p.accelerationMode = d.accelerationMode === 1 ? 'gun' : 'world';
    p.gundir = d.gundir ?? 0;
    p.deathbringer = !!d.deathbringer;
    p.deathbringerAffected = !!d.deathbringerAffected;
    p.turbo = !!d.turbo;
    p.onscreen = !!d.onscreen;
    p.fromMinimapUpdate = !!d.fromMinimapUpdate;
    p.prevMapPosUpdateFrame = d.prevMapPosUpdateFrame ?? -1e10;
    p.prevMapUpdateRoom = { x: d.prevMapUpdateRoom?.[0] ?? 0, y: d.prevMapUpdateRoom?.[1] ?? 0 };
    p.shadowTime = d.shadowTime ?? 0;
    p.weapon = d.weapon ?? 1;
  });
  view.syncUsed();
  for (const r of b.rockets) {
    const rk = view.world.rockets[r.id]!;
    rk.owner = r.owner;
    rk.team = r.team;
    rk.power = !!r.power;
    rk.pos = pos(r.pos);
    rk.vel = new Vec(r.vel[0], r.vel[1]);
  }
  for (const it of b.powerups) {
    const item = view.world.items[it.id]!;
    item.kind = it.kind as PowerupKind;
    item.pos = pos(it.pos);
  }
  const flags = b.flags.map((list) =>
    list.map((f) => {
      const fs = new FlagState(pos(f.pos), pos(f.pos));
      fs.status = f.carried ? 'carried' : f.atBase ? 'base' : 'dropped';
      fs.carrier = f.carrier;
      return fs;
    }),
  );
  view.world.teams[0].flags = flags[0] ?? [];
  view.world.teams[1].flags = flags[1] ?? [];
  view.world.wildFlags = flags[2] ?? [];
  const coords = (c: Coords): WorldCoords => ({ room: { x: c[0], y: c[1] }, x: c[2], y: c[3] });
  view.bases = [(b.bases[0] ?? []).map(coords), (b.bases[1] ?? []).map(coords), (b.bases[2] ?? []).map(coords)];
  view.world.explosions = b.explosions.map((e) => new DeathbringerExplosion(e.frame0, pos(e.pos), -1, e.team));
  return view;
}

/** Bot com o estado gravado antes da decisão (modo resync). */
export function robotFromDump(map: GameMap, areaMap: AreaMap, b: DumpBefore, rng: Rng): Robot {
  const view = viewFromDump(map, b);
  const bot = new Robot(view, areaMap, b.me, rng);
  view.enemiesSeenFrame.set(b.seen);
  const s = b.bot;
  bot.destinationType = s.destinationType;
  bot.destination = s.destination >= 0 ? areaMap.areas[s.destination]! : null;
  bot.immediateDestination = s.immediate[0] >= 0 ? areaMap.areas[s.immediate[0]]!.neighbors[s.immediate[1]]! : null;
  bot.lastSeen = s.lastSeen;
  bot.myGundir = s.myGundir;
  bot.freeWalkTarget.x = s.freeWalkTarget[0];
  bot.freeWalkTarget.y = s.freeWalkTarget[1];
  bot.enemiesInRoom = !!s.enemiesInRoom;
  bot.botPrevFire = !!s.prevFire;
  bot.gunDir = s.gunDir;
  const team = view.players[b.me]!.team;
  s.tables.forEach(([center, weight], id) => {
    if (center >= 0) bot.tables.build(id as DistanceTableId, areaMap.areas[center]!, weight, team);
  });
  return bot;
}

/** Estado do bot depois da decisão, no formato do dump (para comparar). */
export function botStateOf(bot: Robot): DumpBotState {
  let immediate: [number, number] = [-1, -1];
  if (bot.immediateDestination) {
    for (const a of bot.areaMap.areas) {
      const n = a.neighbors.indexOf(bot.immediateDestination);
      if (n !== -1) {
        immediate = [a.index, n];
        break;
      }
    }
  }
  return {
    destinationType: bot.destinationType,
    destination: bot.destination ? bot.destination.index : -1,
    immediate,
    lastSeen: bot.lastSeen,
    myGundir: bot.myGundir,
    freeWalkTarget: [bot.freeWalkTarget.x, bot.freeWalkTarget.y],
    enemiesInRoom: bot.enemiesInRoom ? 1 : 0,
    prevFire: bot.botPrevFire ? 1 : 0,
    gunDir: bot.gunDir,
    tables: [DistanceTableId.Main, DistanceTableId.Def, DistanceTableId.Destination].map((id) => {
      const [center, weight] = bot.tables.descriptor(id);
      return [center ? center.index : -1, center ? weight : 0];
    }),
  };
}

/** Controles já enviados e pendentes, como `RobotMain` os usa. */
export function pendingControls(b: DumpBefore): { controls: number[]; pending: number } {
  return { controls: b.controlHistory, pending: (b.clFrameSent - b.clFrameWorld + 256) % 256 };
}
