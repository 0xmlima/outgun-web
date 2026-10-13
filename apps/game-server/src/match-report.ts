// SPDX-License-Identifier: GPL-2.0-or-later
// Resultado da partida para a API (POST /internal/matches, OG-049): toda partida manda as
// estatísticas; só a de sala Ranked que cumpre os mínimos (RN-RNK-01) vai marcada como ranqueada.
import type { MatchResult, PlayerResult } from '@outgun/sim';
import type { GameMode } from '@outgun/settings';

export interface ReportPlayer {
  name: string;
  /** Conta da API; null = convidado ou bot. */
  accountId: string | null;
  bot: boolean;
}

export interface MatchReport {
  serverMatchId: string;
  roomId: string;
  mode: GameMode;
  ranked: boolean;
  map: string;
  redScore: number;
  blueScore: number;
  startedAt: string;
  endedAt: string;
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
  /** Deltas do ranking por slot (OG-084); padrão 0. */
  deltas?: (pid: number) => { score: number; neg: number };
}

function stats(p: PlayerResult): Record<string, number> {
  const { pid: _pid, team: _team, ...rest } = p;
  return rest;
}

export function matchReport(input: ReportInput): MatchReport {
  const { result } = input;
  return {
    serverMatchId: input.serverMatchId,
    roomId: input.roomId,
    mode: input.mode,
    ranked: input.ranked,
    map: input.map.slice(0, 64),
    redScore: result.teams[0].score,
    blueScore: result.teams[1].score,
    startedAt: new Date(input.startedAt).toISOString(),
    endedAt: new Date(Math.max(input.endedAt, input.startedAt)).toISOString(),
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
