// SPDX-License-Identifier: GPL-2.0-or-later
// Formato dos golden traces gravados pelo oráculo (tools/parity/patches/001-trace.patch).
// Descrição completa: tools/parity/trace-schema.md.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/** [sala x, sala y, x local, y local] */
export type TraceCoords = [number, number, number, number];

export interface TraceStats {
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
  shots: number;
  hits: number;
  shotsTaken: number;
  spawnTime: number;
  lifetime: number;
  movement: number;
  startTime: number;
  dead: number;
  carriedFlag: number;
  flagCarryingTime: number;
  flagTakeTime: number;
}

export interface TracePlayer {
  pid: number;
  team: number;
  bot: number;
  dead: number;
  pos: TraceCoords;
  vel: [number, number];
  /** Bits: cima 1, baixo 2, esquerda 4, direita 8, correr 16, strafe 32. */
  controls: number;
  accelerationMode: number;
  /** Direção da arma em oitavos de volta (0..8). */
  gundir: number;
  attack: number;
  attackOnce: number;
  attackGunDir: number;
  health: number;
  energy: number;
  megabonus: number;
  weapon: number;
  shield: number;
  power: number;
  turbo: number;
  visibility: number;
  deathbringer: number;
  powerTime: number;
  turboTime: number;
  shadowTime: number;
  deathbringerEnd: number;
  deathbringerAttacker: number;
  nextShootFrame: number;
  startTakeDamageFrame: number;
  framesToRespawn: number;
  extraFramesToRespawn: number;
  respawnToBase: number;
  dropKey: number;
  droppedFlag: number;
  awaitingClientReadies: number;
  wantChangeTeams: number;
  color: number;
  stats: TraceStats;
}

export interface TraceRocket {
  id: number;
  owner: number;
  team: number;
  power: number;
  pos: TraceCoords;
  vel: [number, number];
  direction: number;
}

export interface TracePowerup {
  id: number;
  /** 0 shield, 1 turbo, 2 shadow, 3 power, 4 weapon, 5 megahealth, 6 deathbringer, 8 reaparecendo */
  kind: number;
  respawnTime: number;
  pos: TraceCoords;
}

export interface TraceFlag {
  /** 0 na base, 1 carregada, 2 largada */
  status: number;
  carrier: number;
  prevCarrier: number;
  prevPrevCarrier: number;
  grabTime: number;
  dropTime: number;
  home: TraceCoords;
  pos: TraceCoords;
  carryingTeam: number;
  carryingTime: number;
}

export interface TraceTeam {
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
  flags: TraceFlag[];
  /** [tempo do jogo em segundos, "capturador (assistente)"] */
  captures: [number, string][];
}

export interface TraceDeathbringer {
  frame0: number;
  pos: TraceCoords;
  owner: number;
  team: number;
  outsideMask: number;
}

export interface TraceState {
  frame: number;
  /** `get_time()` do original durante o frame (relógio do servidor, em segundos). */
  time: number;
  mapStartTime: number;
  players: TracePlayer[];
  rockets: TraceRocket[];
  powerups: TracePowerup[];
  teams: [TraceTeam, TraceTeam];
  wildFlags: TraceFlag[];
  deathbringers: TraceDeathbringer[];
}

export interface TraceFrame {
  frame: number;
  pre: TraceState;
  /** Valores de rand() consumidos pela simulação do frame, em ordem. */
  rand: number[];
  post: TraceState;
}

export interface TraceHeader {
  version: number;
  seed: number;
  startFrame: number;
  maxplayers: number;
  mapTitle: string;
  mapCrc: number;
  /** Conteúdo do config/gamemod.txt usado (preset Clássico + overrides do cenário). */
  gamemod: string;
  /** Conteúdo do roteiro do cenário. */
  script: string;
}

export interface Trace {
  header: TraceHeader;
  frames: TraceFrame[];
}

export const TRACE_VERSION = 1;

/** Interpreta o conteúdo JSONL de um trace. */
export function parseTrace(jsonl: string): Trace {
  const lines = jsonl.split('\n').filter((line) => line.trim() !== '');
  const [first, ...rest] = lines;
  if (!first) throw new Error('trace vazio');
  const header = JSON.parse(first) as TraceHeader & { type: string };
  if (header.type !== 'header') throw new Error('a primeira linha do trace deve ser o cabeçalho');
  if (header.version !== TRACE_VERSION) {
    throw new Error(`versão de trace ${header.version} não suportada (esperada ${TRACE_VERSION})`);
  }
  const frames = rest.map((line, index) => {
    const record = JSON.parse(line) as TraceFrame & { type: string };
    if (record.type !== 'frame') throw new Error(`linha ${index + 2}: tipo inesperado ${record.type}`);
    return { frame: record.frame, pre: record.pre, rand: record.rand, post: record.post };
  });
  return { header, frames };
}

/** Lê um trace `.jsonl.gz` (ou `.jsonl`) do disco. */
export function loadTrace(path: string): Trace {
  const raw = readFileSync(path);
  const text = path.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return parseTrace(text);
}
