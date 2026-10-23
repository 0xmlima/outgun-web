// SPDX-License-Identifier: GPL-2.0-or-later
// Regras de time do servidor original como funções puras (plan/specs/times.md): time de quem entra
// (`client_connected`, src/servnet.cpp:1333), pedido de troca (`check_player_change_teams`,
// src/server.cpp:267), bot a tirar (`remove_bot`, :973), bot a mover para equilibrar
// (`server_think_after_broadcast`, :1824), `balance_teams`/`shuffle_teams` (:216) e as cores
// pessoais (`check_fav_colors`, :420).
import { randomShuffle, type Rng } from '@outgun/sim';
import { ALL_COLORS, NO_COLOR, PERSONAL_COLORS } from '@outgun/protocol';

const CLASSIC_COLORS = 16;

/** O que as regras precisam saber de cada vaga ocupada. */
export interface Slot {
  readonly bot: boolean;
  readonly dead: boolean;
  readonly hasFlag: boolean;
  readonly wantChange: boolean;
}

export type Slots = readonly (Slot | undefined)[];

export type TeamChange = { readonly kind: 'move'; readonly from: number; readonly to: number } | { readonly kind: 'swap'; readonly a: number; readonly b: number };

const teamOf = (pid: number, maxPlayers: number) => Math.trunc(pid / (maxPlayers / 2));

function counts(slots: Slots, maxPlayers: number): { total: [number, number]; humans: [number, number] } {
  const total: [number, number] = [0, 0];
  const humans: [number, number] = [0, 0];
  slots.forEach((s, pid) => {
    if (!s) return;
    const t = teamOf(pid, maxPlayers) as 0 | 1;
    total[t]++;
    if (!s.bot) humans[t]++;
  });
  return { total, humans };
}

/** Primeira vaga livre do time (`client_connected` procura a partir do primeiro pid do time). */
export function freeSlot(slots: Slots, maxPlayers: number, team: number): number {
  const size = maxPlayers / 2;
  for (let pid = team * size; pid < (team + 1) * size; pid++) if (!slots[pid]) return pid;
  return -1;
}

/**
 * RN-TIM-01: time de quem entra. Menos jogadores; empate: o time onde só ele tem humanos e bots
 * (o outro sem humanos); senão o com menos humanos; empate total: `lessScoredTeam` (força dos
 * times pelo ranking, depois o placar, depois sorteio).
 */
export function joinTeam(slots: Slots, maxPlayers: number, lessScoredTeam: () => 0 | 1): 0 | 1 {
  const { total, humans } = counts(slots, maxPlayers);
  if (total[0] < total[1]) return 0;
  if (total[0] > total[1]) return 1;
  const bots = [total[0] - humans[0], total[1] - humans[1]];
  if (humans[0] > 0 && (bots[0] as number) > 0 && humans[1] === 0) return 0;
  if (humans[1] > 0 && (bots[1] as number) > 0 && humans[0] === 0) return 1;
  if (humans[0] < humans[1]) return 0;
  if (humans[0] > humans[1]) return 1;
  return lessScoredTeam();
}

/**
 * Entrada no lobby Ranked (OG-253, RN-RKL-08): o lado com mais jogadores do mesmo clã cadastrado
 * (comparado pelo id), se tiver vaga; sem clã ou empate, a regra de sempre (RN-TIM-01).
 */
export function lobbyJoinTeam(slots: Slots, maxPlayers: number, clanOf: (pid: number) => string | null | undefined, clan: string | null | undefined, lessScoredTeam: () => 0 | 1): 0 | 1 {
  const fallback = joinTeam(slots, maxPlayers, lessScoredTeam);
  if (!clan) return fallback;
  const size = maxPlayers / 2;
  const mates: [number, number] = [0, 0];
  slots.forEach((s, pid) => {
    if (s && clanOf(pid) === clan) mates[pid < size ? 0 : 1]++;
  });
  if (mates[0] === mates[1]) return fallback;
  const best = mates[0] > mates[1] ? 0 : 1;
  return freeSlot(slots, maxPlayers, best) !== -1 ? best : fallback;
}

/** Bot preferido de uma lista: morto, depois sem bandeira, depois qualquer (ordem de pid). */
function pickBot(slots: Slots, test: (pid: number) => boolean): number {
  let noCarrier = -1;
  let any = -1;
  for (let pid = 0; pid < slots.length; pid++) {
    const s = slots[pid];
    if (!s?.bot || !test(pid)) continue;
    if (s.dead) return pid;
    if (!s.hasFlag && noCarrier === -1) noCarrier = pid;
    else if (any === -1) any = pid;
  }
  return noCarrier !== -1 ? noCarrier : any;
}

/** RN-TIM-02 (`check_player_change_teams`): o que fazer com o pedido de troca de `pid`. */
export function teamChangeFor(slots: Slots, maxPlayers: number, pid: number): TeamChange | null {
  const me = slots[pid];
  if (!me?.wantChange) return null;
  const myTeam = teamOf(pid, maxPlayers);
  const { total } = counts(slots, maxPlayers);
  const delta = (total[1 - myTeam] as number) - (total[myTeam] as number);
  const freeInOther = () => freeSlot(slots, maxPlayers, 1 - myTeam);
  // o outro time tem 2 ou mais a menos: muda sem troca
  if (delta <= -2) {
    const to = freeInOther();
    if (to !== -1) return { kind: 'move', from: pid, to };
  }
  // alguém do outro time também quer trocar
  if (delta <= 0)
    for (let other = 0; other < slots.length; other++)
      if (slots[other]?.wantChange && teamOf(other, maxPlayers) !== myTeam) return { kind: 'swap', a: pid, b: other };
  // o meu time tem um a mais: muda
  if (delta === -1) {
    const to = freeInOther();
    if (to !== -1) return { kind: 'move', from: pid, to };
  }
  // troca com um bot do outro time (bots não trocam com bots)
  if (me.bot) return null;
  const bot = pickBot(slots, (other) => teamOf(other, maxPlayers) !== myTeam);
  return bot === -1 ? null : { kind: 'swap', a: pid, b: bot };
}

/** `remove_bot`: bot que sai para dar lugar a um humano (do time maior, morto, sem bandeira...). */
export function botToRemove(slots: Slots, maxPlayers: number): number {
  const { total } = counts(slots, maxPlayers);
  const team = total[0] > total[1] ? 0 : total[1] > total[0] ? 1 : -1;
  const inTeam = (pid: number) => team === -1 || teamOf(pid, maxPlayers) === team;
  for (const test of [(s: Slot) => s.dead, (s: Slot) => !s.hasFlag, () => true]) {
    const pid = slots.findIndex((s, i) => s?.bot && inTeam(i) && test(s));
    if (pid !== -1) return pid;
  }
  return slots.findIndex((s) => s?.bot);
}

/** `server_think_after_broadcast`: com diferença de 2 ou mais, um bot do time maior pede troca. */
export function botToRebalance(slots: Slots, maxPlayers: number): number {
  const { total } = counts(slots, maxPlayers);
  const diff = total[0] - total[1];
  if (diff > -2 && diff < 2) return -1;
  const bigger = diff > 0 ? 0 : 1;
  return pickBot(slots, (pid) => teamOf(pid, maxPlayers) === bigger);
}

/** `balance_teams`: muda jogadores sorteados do time maior até a diferença ser no máximo 1. */
export function balanceMoves(slots: Slots, maxPlayers: number, rng: Rng): { from: number; to: number }[] {
  const occupied = slots.map((s) => s !== undefined);
  const team: number[][] = [[], []];
  occupied.forEach((o, pid) => o && (team[teamOf(pid, maxPlayers)] as number[]).push(pid));
  const moves: { from: number; to: number }[] = [];
  let diff = (team[0] as number[]).length - (team[1] as number[]).length;
  const bigger = diff > 0 ? 0 : 1;
  const big = team[bigger] as number[];
  while (diff > 1 || diff < -1) {
    const victim = rng.rand() % big.length;
    const size = maxPlayers / 2;
    for (let to = (1 - bigger) * size; to < (2 - bigger) * size; to++)
      if (!occupied[to]) {
        const from = big[victim] as number;
        moves.push({ from, to });
        occupied[to] = true;
        occupied[from] = false;
        (team[1 - bigger] as number[]).push(from);
        big.splice(victim, 1);
        break;
      }
    diff = (team[0] as number[]).length - (team[1] as number[]).length;
  }
  return moves;
}

/** `shuffle_teams`: embaralha os jogadores e troca os do vermelho que caíram no azul. */
export function shuffleSwaps(slots: Slots, maxPlayers: number, rng: Rng): [number, number][] {
  const players = slots.flatMap((s, pid) => (s ? [pid] : []));
  if (players.length <= 2) return [];
  randomShuffle(players, rng);
  const size = maxPlayers / 2;
  const swaps: [number, number][] = [];
  for (let i = 0, pi = 0; i < size; i++)
    if (slots[i]) {
      const target = players[pi] as number;
      if (target >= size) swaps.push([i, target]);
      pi++;
    }
  return swaps;
}

/**
 * Cores pessoais por time, sem repetir dentro do time (RN-TIM-05): as 32 da paleta (OG-411; o
 * original tinha 16) e as 3 medalhas, que só entram pelas favoritas de quem tem direito.
 */
export const COLORS = ALL_COLORS;
export { NO_COLOR };

export class ColorPool {
  private readonly used: [boolean[], boolean[]] = [new Array<boolean>(COLORS).fill(false), new Array<boolean>(COLORS).fill(false)];

  constructor(private readonly rng: Rng) {}

  release(team: number, color: number): void {
    if (color < COLORS) (this.used[team as 0 | 1] as boolean[])[color] = false;
  }

  /**
   * `check_fav_colors`: a primeira favorita livre (mantém a atual se ela vem antes); sem favorita
   * livre, mantém a atual ou sorteia uma livre.
   */
  assign(team: number, current: number, favorites: readonly number[]): number {
    const used = this.used[team as 0 | 1] as boolean[];
    for (const col of favorites) {
      if (col >= COLORS) continue;
      if (current === col) return current;
      if (!used[col]) {
        if (current < COLORS) used[current] = false;
        used[col] = true;
        return col;
      }
    }
    if (current < COLORS) return current;
    // sorteio só na paleta comum (medalha nunca sai por acaso): primeiro nas 16 do original, com o
    // mesmo sorteio dele; as novas só se as 16 estiverem ocupadas (com 16 por time, nunca)
    const order = randomShuffle(Array.from({ length: CLASSIC_COLORS }, (_, i) => i), this.rng);
    let free = order.find((c) => !used[c]);
    if (free === undefined) free = Array.from({ length: PERSONAL_COLORS - CLASSIC_COLORS }, (_, i) => CLASSIC_COLORS + i).find((c) => !used[c]);
    if (free === undefined) return NO_COLOR;
    used[free] = true;
    return free;
  }
}
