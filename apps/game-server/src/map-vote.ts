// SPDX-License-Identifier: GPL-2.0-or-later
// Rotação e votação de mapas do servidor original como funções puras (plan/specs/votacao-mapas.md):
// próximo mapa (`server_next_map`, src/server.cpp:565-650), saída por voto (`check_map_exit`,
// :775-795), anúncio "x/y votos" (:1597-1618) e a ordem da rotação (`reset_settings`, :853-857).
import { randomShuffle, type Rng } from '@outgun/sim';

export interface Voter {
  readonly bot: boolean;
  readonly wantExit: boolean;
  /** Mapa votado (índice na rotação) ou −1. */
  readonly mapVote: number;
  /** Mapas que o jogador não quer (`negativeMapVotes`). */
  readonly negative: ReadonlySet<number>;
}

export interface RotationMap {
  /** Frame em que o mapa começou pela última vez (0 = nunca). */
  readonly lastGame: number;
}

/** Votos de cada mapa (`maprot[m].votes`): todos os jogadores, bots inclusive, contam no voto por mapa. */
export function mapVotes(voters: readonly Voter[], maps: number): number[] {
  const votes = new Array<number>(maps).fill(0);
  for (const v of voters) if (v.mapVote >= 0 && v.mapVote < maps) votes[v.mapVote] = (votes[v.mapVote] as number) + 1;
  return votes;
}

/**
 * RN-VOT-03 (`server_next_map`): o mais votado; empate → o jogado há mais tempo; ainda empatado →
 * sorteio, tirando o atual. Sem votos: o seguinte da lista, pulando para o com menos votos
 * negativos (dá a volta e para no primeiro sem nenhum).
 */
export function nextMap(maps: readonly RotationMap[], votes: readonly number[], current: number, frame: number, negative: (map: number) => number, rng: Rng): number {
  const winners: number[] = [];
  let maxVotes = 0;
  let longest = frame;
  maps.forEach((m, i) => {
    const v = votes[i] ?? 0;
    if (v < maxVotes) return;
    if (v > maxVotes) {
      maxVotes = v;
      winners.length = 0;
      longest = m.lastGame;
    }
    if (m.lastGame > longest) return;
    if (m.lastGame < longest) {
      winners.length = 0;
      longest = m.lastGame;
    }
    winners.push(i);
  });
  if (maxVotes === 0) {
    let pick = (current + 1) % maps.length;
    const first = pick;
    let least = Infinity;
    for (let map = pick; least > 0; ) {
      const n = negative(map);
      if (n < least) {
        least = n;
        pick = map;
      }
      map = (map + 1) % maps.length;
      if (map === first) break;
    }
    return pick;
  }
  if (winners.length > 1 && winners.includes(current)) winners.splice(winners.indexOf(current), 1);
  return winners[rng.rand() % winners.length] as number;
}

/** Quem conta como "sair" e quantos humanos (RN-VOT-02: bots não votam para sair). */
function exitCount(voters: readonly Voter[], requireSpecific: boolean): { yes: number; humans: number } {
  let yes = 0;
  let humans = 0;
  for (const v of voters) {
    if (v.bot) continue;
    humans++;
    if (v.wantExit && (!requireSpecific || v.mapVote !== -1)) yes++;
  }
  return { yes, humans };
}

/** `check_map_exit`: troca quando "sair" > contra, depois do bloqueio (ou com todos a favor). */
export function shouldExit(voters: readonly Voter[], requireSpecific: boolean, mapTime: number, voteBlockTime: number): boolean {
  const { yes, humans } = exitCount(voters, requireSpecific);
  const no = humans - yes;
  return yes > no && (mapTime >= voteBlockTime || no === 0);
}

/** Estado do anúncio "x/y votos para trocar de mapa" (`data_map_change_info`). */
export interface VoteAnnouncer {
  votes: number;
  needed: number;
  nextFrame: number;
}

/** Anúncio a cada 5 s no máximo, quando os votos (ou o necessário, havendo votos) mudam. */
export function announce(a: VoteAnnouncer, voters: readonly Voter[], requireSpecific: boolean, frame: number, mapTime: number, voteBlockTime: number): { votes: number; needed: number; voteBlockSeconds: number } | null {
  if (frame < a.nextFrame) return null;
  const { yes, humans } = exitCount(voters, requireSpecific);
  const needed = Math.trunc(humans / 2) + 1;
  if (yes === a.votes && (needed === a.needed || yes === 0)) return null;
  a.votes = yes;
  a.needed = needed;
  a.nextFrame = frame + 5 * 10;
  return { votes: yes, needed, voteBlockSeconds: mapTime < voteBlockTime ? Math.trunc((voteBlockTime - mapTime + 5) / 10) : 0 };
}

/** RN-VOT-04 (`random_maprot`): 0 = em ordem; 1 = embaralhada; 2 = primeiro mapa sorteado. */
export function initialRotation(count: number, mode: 0 | 1 | 2, rng: Rng): { order: number[]; first: number } {
  const order = Array.from({ length: count }, (_, i) => i);
  if (mode === 1) randomShuffle(order, rng);
  return { order, first: mode === 2 ? rng.rand() % count : 0 };
}
