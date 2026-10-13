// SPDX-License-Identifier: GPL-2.0-or-later
// Deltas do ranking (OG-084, spec plan/specs/ranking.md): `Server::refresh_team_score_modifiers`,
// `score_frag`/`score_neg` e `client_report_status` do original.

/** `minimum_positive_score_for_ranking`: abaixo disso a força do jogador é 1,0. */
export const MINIMUM_POSITIVE_SCORE = 100;

/** Ranking do jogador na temporada (vem no ticket) e se ele participa. */
export interface PlayerRating {
  score: number;
  neg: number;
  participate: boolean;
  /** Posição no leaderboard (0 = fora) e tamanho dele, para o `playerInfo`. */
  rank?: number;
  of?: number;
}

export interface ModifierPlayer {
  team: 0 | 1;
  /** Sem conta, bot ou sem ranking: 0/0 (força 1,0). */
  score: number;
  neg: number;
}

/** Força do jogador: `(score+1)/(neg+1)`, ou 1,0 com menos de 100 de score. */
export function playerStrength(score: number, neg: number): number {
  return score < MINIMUM_POSITIVE_SCORE ? 1.0 : (score + 1.0) / (neg + 1.0);
}

const bound = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** `refresh_team_score_modifiers`: [vermelho, azul]; [0, 0] se algum time está vazio. */
export function teamModifiers(players: readonly ModifierPlayer[], averageStrength: boolean): [number, number] {
  const raw = [0, 0];
  const count = [0, 0];
  for (const p of players) {
    raw[p.team]! += playerStrength(p.score, p.neg);
    count[p.team]!++;
  }
  if (!count[0] || !count[1]) return [0, 0];
  if (averageStrength) {
    raw[0]! /= count[0];
    raw[1]! /= count[1];
  }
  return [bound(raw[1]! / raw[0]!, 0.3333, 3), bound(raw[0]! / raw[1]!, 0.3333, 3)];
}

/** Acumuladores de um jogador (`fdp`, `fdn`, `delta_score`, `neg_delta_score`). */
export class RankingDeltas {
  private fdp = 0;
  private fdn = 0;

  get score(): number {
    return Math.trunc(this.fdp) || 0; // sem −0
  }

  get neg(): number {
    return Math.trunc(this.fdn) || 0;
  }

  get pending(): boolean {
    return this.score !== 0 || this.neg !== 0;
  }

  addFrag(amount: number, modifier: number): void {
    this.fdp += amount * modifier;
  }

  addNeg(amount: number): void {
    this.fdn += amount;
  }

  /**
   * `client_report_status`: sem delta inteiro não envia nada (e a fração continua acumulando);
   * com delta, devolve os inteiros e zera tudo (a fração de `fdp` se perde, como no original).
   */
  take(): { score: number; neg: number } | undefined {
    if (!this.pending) return undefined;
    const out = { score: this.score, neg: this.neg };
    this.fdp = 0;
    this.fdn = 0;
    return out;
  }
}
