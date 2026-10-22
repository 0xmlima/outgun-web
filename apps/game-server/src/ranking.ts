// SPDX-License-Identifier: GPL-2.0-or-later
// Rating de habilidade no game server (OG-350, D-65/D-66): o ticket traz o OpenSkill da conta e a
// força dos times para quem entra (RN-TIM-01) é a soma dos μ. O ranking por score/neg do original
// (modificador de time e deltas, OG-084, spec plan/specs/ranking.md) foi descontinuado.

/** Rating de habilidade da conta (vem no ticket). */
export interface PlayerSkill {
  mu: number;
  /** Valor exibido (RN-SKL-04). */
  value: number;
  /** Posição entre as contas com rating (1 = melhor) e quantas são. */
  rank: number;
  of: number;
}

/** μ de quem ainda não tem rating (conta nova, convidado ou bot): o inicial do OpenSkill. */
export const DEFAULT_MU = 25;

/** Soma dos μ de cada time: [vermelho, azul]. */
export function teamStrength(players: readonly { team: 0 | 1; mu?: number | undefined }[]): [number, number] {
  const sum: [number, number] = [0, 0];
  for (const p of players) sum[p.team] += p.mu ?? DEFAULT_MU;
  return sum;
}
