// SPDX-License-Identifier: GPL-2.0-or-later
// Estatísticas derivadas e resultado da partida (`Statistics`, `Team`, src/world.h:266-360 e 692-760;
// `WorldBase::save_stats`, src/world.cpp:3752). A pontuação em si acontece em `ServerSim` e sai pelos
// hooks `scoreFrag`/`scoreNeg`; aqui ficam as contas que o placar (F3/F4), o ranking (OG-084) e o
// histórico de partidas (OG-085) usam.
import { PLAYER_RADIUS } from '../constants.js';
import { CarriedFlag, type GameOverReason, type PlayerState, type PlayerStats, type TeamState, type WorldState } from './state.js';

/** Distância em "unidades Outgun" (um diâmetro de jogador). */
export const toOutgunUnits = (pixels: number): number => pixels / (2 * PLAYER_RADIUS);

/** `Statistics::accuracy`: acertos / tiros (0 sem tiros). */
export const accuracy = (s: { shots: number; hits: number }): number => (s.shots === 0 ? 0 : s.hits / s.shots);

/** `Statistics::lifetime`: tempo vivo acumulado, contando a vida atual. */
export const lifetime = (s: PlayerStats, time: number): number => (s.dead ? s.lifetime : s.lifetime + (time - s.spawnTime));

/** `Statistics::average_lifetime`: por vida (mortes + 1). */
export const averageLifetime = (s: PlayerStats, time: number): number => lifetime(s, time) / (s.deaths + 1);

/** `Statistics::playtime`: desde que entrou na partida. */
export const playtime = (s: PlayerStats, time: number): number => time - s.startTime;

/** `Statistics::speed`: unidades Outgun por segundo vivo. */
export function speed(s: PlayerStats, time: number): number {
  const lt = lifetime(s, time);
  return lt === 0 ? 0 : toOutgunUnits(s.movement) / lt;
}

/** `Statistics::flag_carrying_time`: inclui a posse atual. */
export const flagCarryingTime = (s: PlayerStats, time: number): number =>
  s.carriedFlag === CarriedFlag.None ? s.flagCarryingTime : s.flagCarryingTime + (time - s.flagTakeTime);

/** `Statistics::finish_stats`: encerra a vida e a posse de bandeira em andamento (fim de partida). */
export function finishStats(s: PlayerStats, time: number): void {
  if (!s.dead) {
    s.dead = true;
    s.lifetime += time - s.spawnTime;
  }
  if (s.carriedFlag !== CarriedFlag.None) {
    s.carriedFlag = CarriedFlag.None;
    s.flagCarryingTime += time - s.flagTakeTime;
  }
}

/** `compare_players`: vermelhos antes dos azuis, depois por frags (ordenação estável). */
export function comparePlayers(a: PlayerState, b: PlayerState): number {
  if (a.team !== b.team) return a.team - b.team;
  return b.stats.frags - a.stats.frags;
}

export interface PlayerResult {
  pid: number;
  team: 0 | 1;
  frags: number;
  captures: number;
  assists: number;
  kills: number;
  deaths: number;
  suicides: number;
  deathbringerKills: number;
  deathbringerDeaths: number;
  consecutiveKills: number;
  consecutiveDeaths: number;
  flagsTaken: number;
  flagsDropped: number;
  flagsReturned: number;
  carriersKilled: number;
  /** Segundos com bandeira. */
  flagCarryingTime: number;
  shots: number;
  hits: number;
  accuracy: number;
  shotsTaken: number;
  /** Segundos vivo, por vida e em jogo. */
  lifetime: number;
  averageLifetime: number;
  playtime: number;
  /** Unidades Outgun e unidades por segundo vivo. */
  movement: number;
  speed: number;
}

export interface TeamResult {
  /** Capturas + pontos de posse (`points`). */
  score: number;
  kills: number;
  deaths: number;
  suicides: number;
  flagsTaken: number;
  flagsDropped: number;
  flagsReturned: number;
  shots: number;
  hits: number;
  accuracy: number;
  shotsTaken: number;
  movement: number;
  captures: { time: number; pid: number; assistPid: number }[];
}

/** Resultado da partida (equivalente estruturado de `save_stats`), base do OG-084/OG-085. */
export interface MatchResult {
  reason: GameOverReason;
  /** Duração do mapa em segundos inteiros (`getMapTime() / 10`). */
  mapTime: number;
  mapTitle: string;
  mapCrc: number;
  /** Vencedor pelo placar; null = empate. */
  winner: 0 | 1 | null;
  teams: [TeamResult, TeamResult];
  /** Na ordem do placar do original (`compare_players`). */
  players: PlayerResult[];
}

function teamResult(t: TeamState): TeamResult {
  return {
    score: t.score,
    kills: t.kills,
    deaths: t.deaths,
    suicides: t.suicides,
    flagsTaken: t.flagsTaken,
    flagsDropped: t.flagsDropped,
    flagsReturned: t.flagsReturned,
    shots: t.shots,
    hits: t.hits,
    accuracy: accuracy(t),
    shotsTaken: t.shotsTaken,
    movement: toOutgunUnits(t.movement),
    captures: t.captures.map((c) => ({ ...c })),
  };
}

function playerResult(pl: PlayerState, time: number): PlayerResult {
  const s = pl.stats;
  return {
    pid: pl.pid,
    team: pl.team,
    frags: s.frags,
    captures: s.captures,
    assists: s.assists,
    kills: s.kills,
    deaths: s.deaths,
    suicides: s.suicides,
    deathbringerKills: s.dbKills,
    deathbringerDeaths: s.dbDeaths,
    consecutiveKills: s.consKills,
    consecutiveDeaths: s.consDeaths,
    flagsTaken: s.flagsTaken,
    flagsDropped: s.flagsDropped,
    flagsReturned: s.flagsReturned,
    carriersKilled: s.carriersKilled,
    flagCarryingTime: flagCarryingTime(s, time),
    shots: s.shots,
    hits: s.hits,
    accuracy: accuracy(s),
    shotsTaken: s.shotsTaken,
    lifetime: lifetime(s, time),
    averageLifetime: averageLifetime(s, time),
    playtime: playtime(s, time),
    movement: toOutgunUnits(s.movement),
    speed: speed(s, time),
  };
}

/**
 * Fim de partida (`server_next_map`): fecha as estatísticas de todos (`finish_stats`) e monta o
 * resultado. Muda o estado dos jogadores, como no original; chamado antes do reinício do mapa.
 */
export function finishMatch(world: WorldState, reason: GameOverReason, time: number): MatchResult {
  const players = world.players.filter((p): p is PlayerState => p !== undefined);
  for (const pl of players) finishStats(pl.stats, time);
  const [red, blue] = world.teams;
  return {
    reason,
    mapTime: Math.trunc(world.mapTime() / 10),
    mapTitle: world.map.title,
    mapCrc: world.map.crc,
    winner: red.score === blue.score ? null : red.score > blue.score ? 0 : 1,
    teams: [teamResult(red), teamResult(blue)],
    // Array.prototype.sort é estável, como o stable_sort do original
    players: [...players].sort(comparePlayers).map((pl) => playerResult(pl, time)),
  };
}
