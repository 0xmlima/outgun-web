// SPDX-License-Identifier: GPL-2.0-or-later
// Leitura dos eventos da partida (OG-362) para os marcos (OG-391/398/399), do ponto de vista de
// uma conta. Puro; o formato dos eventos é o de `match_events` (apps/api/src/db/schema.ts).

/** Abate: `[t, 'kill', matador, vítima, salaX, salaY, vítima com bandeira (0/1), causa]`; bandeira: `[t, tipo, jogador, bandeira (0, 1, 2 selvagem)]`. t em décimos. */
export type MilestoneEvent = readonly [number, 'kill', number, number, number, number, 0 | 1, string] | readonly [number, 'take' | 'drop' | 'return' | 'capture', number, number];

export interface MilestoneEvents {
  /** Índices (em `teams`) que são a conta; pode ser mais de um na mesma partida. */
  me: readonly number[];
  /** Time de cada índice de jogador dos eventos. */
  teams: readonly number[];
  log: readonly MilestoneEvent[];
}

/** Janela do multi-kill em décimos (OG-363); a API usa a mesma. */
export const MULTI_KILL_WINDOW = 40;
export const WILD_FLAG = 2;

type Kill = { t: number; killer: number; victim: number; carrier: boolean; cause: string };

export function kills(e: MilestoneEvents): Kill[] {
  return e.log.flatMap((x) => (x[1] === 'kill' ? [{ t: x[0], killer: x[2], victim: x[3], carrier: x[6] === 1, cause: x[7] }] : []));
}

/** Abate num inimigo (sem suicídio nem fogo amigo nem "ninguém"). */
export function enemyKill(e: MilestoneEvents, k: Kill): boolean {
  return k.killer >= 0 && k.victim >= 0 && k.killer !== k.victim && e.teams[k.killer] !== undefined && e.teams[k.killer] !== e.teams[k.victim];
}

/** Maior sequência de abates da conta em inimigos, cada um até `MULTI_KILL_WINDOW` depois do anterior. */
export function longestKillChain(e: MilestoneEvents): number {
  const me = new Set(e.me);
  let best = 0;
  let chain = 0;
  let last = -Infinity;
  for (const k of kills(e)) {
    if (!me.has(k.killer) || !enemyKill(e, k)) continue;
    chain = k.t - last <= MULTI_KILL_WINDOW ? chain + 1 : 1;
    last = k.t;
    best = Math.max(best, chain);
  }
  return best;
}

/** A conta capturou a bandeira selvagem. */
export function capturedWildFlag(e: MilestoneEvents): boolean {
  const me = new Set(e.me);
  return e.log.some((x) => x[1] === 'capture' && me.has(x[2]) && x[3] === WILD_FLAG);
}

/** Placar (time da conta, adversário) depois de cada captura, em ordem. */
export function scoreline(e: MilestoneEvents, team: number): { t: number; own: number; other: number }[] {
  const out: { t: number; own: number; other: number }[] = [];
  let own = 0;
  let other = 0;
  for (const x of e.log) {
    if (x[1] !== 'capture') continue;
    const side = e.teams[x[2]];
    if (side === undefined) continue;
    if (side === team) own++;
    else other++;
    out.push({ t: x[0], own, other });
  }
  return out;
}

/** Maior desvantagem do time da conta em algum momento. */
export function worstDeficit(e: MilestoneEvents, team: number): number {
  return Math.max(0, ...scoreline(e, team).map((s) => s.other - s.own));
}
