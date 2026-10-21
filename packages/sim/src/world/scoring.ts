// SPDX-License-Identifier: GPL-2.0-or-later
// Pontos de cada evento da partida (OG-342): frags, que somam ao score do ranking com o modificador
// do time, e pontos negativos (neg), sem modificador. A explicação do rating no cliente lê daqui.

/** Frags por evento (`scoreFrag`); negativos descontam do score. */
export const FRAG_POINTS = {
  kill: 1,
  carrierDefense: 1,
  flagDefense: 1,
  carrierKill: 1,
  flagTake: 1,
  flagDropOnPurpose: -1,
  capture: 3,
  assist: 3,
  teamCapture: 2,
  teamKill: -2,
  teamCarrierKill: -1,
  suicide: -1,
} as const;

/** Pontos negativos por evento (`scoreNeg`). */
export const NEG_POINTS = {
  death: 1,
  deathWithFlag: 1,
  enemyCapture: 1,
} as const;
