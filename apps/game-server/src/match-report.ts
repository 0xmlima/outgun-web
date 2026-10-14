// SPDX-License-Identifier: GPL-2.0-or-later
// Resultado da partida para a API (POST /internal/matches, OG-049): toda partida manda as
// estatísticas; só a de sala Ranked que cumpre os mínimos (RN-RNK-01) vai marcada como ranqueada.
import type { MatchResult, PlayerResult, TeamResult } from '@outgun/sim';
import type { GameMode } from '@outgun/settings';

export interface ReportPlayer {
  name: string;
  /** Conta da API; null = convidado ou bot. */
  accountId: string | null;
  bot: boolean;
}

/** Regras da partida mostradas no "Game info" do `save_stats` (OG-085). */
export interface MatchRules {
  captureLimit: number;
  winScoreDifference: number;
  /** Frames (0 = sem limite). */
  timeLimit: number;
  extraTime: number;
  extraTimePeriods: number;
  suddenDeath: boolean;
}

/** "Team stats" e "Captures" do `save_stats` (OG-085). */
export interface MatchDetails {
  reason: string;
  /** Duração do mapa (s). */
  mapTime: number;
  mapTitle: string;
  rules: MatchRules;
  teams: Omit<TeamResult, 'captures'>[];
  /** Capturas em ordem de tempo; `team` 0 = vermelho; `baseScore` = pontos de posse antes delas. */
  captures: { time: number; team: 0 | 1; capturer: string; assistant: string | null }[];
  baseScore: [number, number];
}

export interface MatchReport {
  serverMatchId: string;
  /** Replay da partida (OG-090), se gravado. */
  replayUrl?: string;
  roomId: string;
  mode: GameMode;
  ranked: boolean;
  map: string;
  redScore: number;
  blueScore: number;
  startedAt: string;
  endedAt: string;
  details: MatchDetails;
  players: {
    slot: number;
    userId?: string;
    name: string;
    team: 0 | 1;
    isBot: boolean;
    frags: number;
    kills: number;
    deaths: number;
    captures: number;
    playSeconds: number;
    scoreDelta: number;
    negDelta: number;
    stats: Record<string, number>;
  }[];
}

/** Deltas do ranking enviados fora do fim da partida (POST /internal/rating-deltas, OG-084). */
export interface DeltaReport {
  /** Idempotência: o mesmo id não é somado duas vezes. */
  deltaId: string;
  roomId: string;
  userId: string;
  scoreDelta: number;
  negDelta: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mínimos do ranking (`Server::rankingEnabled`): humanos distintos ≥ `ranking_minhumans` e
 * jogadores (humanos + bots) ≥ `ranking_minplayers`. No Ranked não há bots (D-11); humanos
 * distintos são contas distintas (o original contava clientes distintos).
 */
export function rankingMinimumsMet(players: readonly ReportPlayer[], minHumans: number, minPlayers: number): boolean {
  const humans = new Set(players.filter((p) => !p.bot && p.accountId !== null).map((p) => p.accountId));
  return humans.size >= minHumans && players.length >= minPlayers;
}

export interface ReportInput {
  serverMatchId: string;
  replayUrl?: string;
  roomId: string;
  mode: GameMode;
  /** Sala Ranked com os mínimos cumpridos. */
  ranked: boolean;
  map: string;
  result: MatchResult;
  startedAt: number;
  endedAt: number;
  /** Quem está no slot de cada resultado (quem já saiu não entra). */
  who: (pid: number) => ReportPlayer | undefined;
  rules: MatchRules;
  /** Deltas do ranking por slot (OG-084); padrão 0. */
  deltas?: (pid: number) => { score: number; neg: number };
}

function stats(p: PlayerResult): Record<string, number> {
  const { pid: _pid, team: _team, ...rest } = p;
  return rest;
}

function details(input: ReportInput): MatchDetails {
  const { result } = input;
  const name = (pid: number) => input.who(pid)?.name ?? '?';
  const captures = ([0, 1] as const)
    .flatMap((team) => result.teams[team].captures.map((c) => ({ time: c.time, team, capturer: name(c.pid), assistant: c.assistPid === -1 ? null : name(c.assistPid) })))
    .sort((a, b) => a.time - b.time || a.team - b.team);
  const teams = result.teams.map(({ captures: _c, ...rest }) => rest);
  return {
    reason: result.reason,
    mapTime: result.mapTime,
    mapTitle: result.mapTitle.slice(0, 64),
    rules: input.rules,
    teams,
    captures: captures.slice(0, 500),
    baseScore: [result.teams[0].score - result.teams[0].captures.length, result.teams[1].score - result.teams[1].captures.length],
  };
}

export function matchReport(input: ReportInput): MatchReport {
  const { result } = input;
  return {
    serverMatchId: input.serverMatchId,
    ...(input.replayUrl ? { replayUrl: input.replayUrl } : {}),
    roomId: input.roomId,
    mode: input.mode,
    ranked: input.ranked,
    map: input.map.slice(0, 64),
    redScore: result.teams[0].score,
    blueScore: result.teams[1].score,
    startedAt: new Date(input.startedAt).toISOString(),
    endedAt: new Date(Math.max(input.endedAt, input.startedAt)).toISOString(),
    details: details(input),
    players: result.players.flatMap((p) => {
      const who = input.who(p.pid);
      if (!who) return [];
      const d = input.deltas?.(p.pid) ?? { score: 0, neg: 0 };
      return [
        {
          slot: p.pid,
          ...(who.accountId && UUID.test(who.accountId) ? { userId: who.accountId } : {}),
          name: who.name.slice(0, 32),
          team: p.team,
          isBot: who.bot,
          frags: p.frags,
          kills: p.kills,
          deaths: p.deaths,
          captures: p.captures,
          playSeconds: Math.round(p.playtime),
          scoreDelta: input.ranked ? d.score : 0,
          negDelta: input.ranked ? d.neg : 0,
          stats: stats(p),
        },
      ];
    }),
  };
}
