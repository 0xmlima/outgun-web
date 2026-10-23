// SPDX-License-Identifier: GPL-2.0-or-later
// Stats que dependem do momento (OG-363, RN-LDB-03), a partir dos eventos da ranqueada (OG-362):
// multi-kill, troca e primeiro abate. Só abates em inimigos contam. Calculados ao gravar a partida e
// somados aos `stats` de cada jogador, onde o leaderboard os lê.
import { MULTI_KILL_WINDOW } from '@outgun/content';
import type { MatchEvent } from './db/schema.js';

/** Janelas em décimos de segundo (propostas ao PO na revisão do OG-363). */
export { MULTI_KILL_WINDOW };
export const TRADE_WINDOW = 30;

export interface MomentStats {
  /** Sequências de 2+ abates, cada um até `MULTI_KILL_WINDOW` depois do anterior; a sequência conta 1. */
  multiKills: number;
  /** Abates no inimigo que matou um aliado até `TRADE_WINDOW` antes. */
  trades: number;
  /** Primeiro abate da partida e o primeiro depois de cada captura (abre a disputa). */
  firstKills: number;
}

/** Stats de cada jogador dos eventos (pelo índice em `teams`, o time de cada um). */
export function momentStats(events: readonly MatchEvent[], teams: readonly number[]): MomentStats[] {
  const out = teams.map(() => ({ multiKills: 0, trades: 0, firstKills: 0 }));
  const lastKill = new Map<number, { t: number; chain: number }>();
  const kills: { t: number; killer: number; victim: number }[] = [];
  let open = true;
  for (const e of events) {
    if (e[1] === 'capture') open = true;
    if (e[1] !== 'kill') continue;
    const [t, , killer, victim] = e;
    if (killer < 0 || victim < 0 || killer === victim || teams[killer] === undefined || teams[killer] === teams[victim]) continue;
    const s = out[killer]!;
    if (open) s.firstKills++;
    open = false;
    const prev = lastKill.get(killer);
    const chain = prev && t - prev.t <= MULTI_KILL_WINDOW ? prev.chain + 1 : 1;
    if (chain === 2) s.multiKills++;
    lastKill.set(killer, { t, chain });
    // troca: a vítima matou, há pouco, um aliado de quem a matou agora
    if (kills.some((k) => k.killer === victim && k.victim !== killer && teams[k.victim] === teams[killer] && t - k.t <= TRADE_WINDOW)) s.trades++;
    kills.push({ t, killer, victim });
  }
  return out;
}
