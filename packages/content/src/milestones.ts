// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos do jogador (OG-213, RN-SOC-03): catálogo versionado e o cálculo a partir do histórico de
// partidas com conta. Puro: a API lê as partidas, chama `milestonesFrom` e grava o que faltar (o
// mesmo cálculo serve ao fim de cada partida e ao preenchimento retroativo, por isso é idempotente).
import type { Bilingual } from './privacy.js';

/** Partida de uma conta, na ordem em que terminou. Kills em bots já descontados. */
export interface MilestoneMatch {
  matchId: string;
  endedAt: string;
  /** 1 vitória, 0 empate, -1 derrota. */
  result: 1 | 0 | -1;
  kills: number;
  captures: number;
  shots: number;
  hits: number;
}

export interface Milestone {
  readonly id: string;
  readonly name: Bilingual;
  readonly description: Bilingual;
}

export interface Achieved {
  id: string;
  matchId: string;
  endedAt: string;
}

/** Tiros mínimos numa partida para valer o marco de precisão (1 em 1 não é pontaria). */
export const ACCURACY_MIN_SHOTS = 20;

const b = (pt: string, en: string): Bilingual => ({ 'pt-BR': pt, en });

/** Na ordem em que aparecem no perfil. Ids são estáveis (gravados no banco): nunca renomear. */
export const MILESTONES: readonly Milestone[] = [
  { id: 'first_match', name: b('Estreia', 'Debut'), description: b('Jogou a primeira partida', 'Played the first match') },
  { id: 'matches_10', name: b('Frequentador', 'Regular'), description: b('10 partidas', '10 matches') },
  { id: 'matches_100', name: b('Veterano', 'Veteran'), description: b('100 partidas', '100 matches') },
  { id: 'matches_1000', name: b('Lenda', 'Legend'), description: b('1000 partidas', '1000 matches') },
  { id: 'first_capture', name: b('Primeira captura', 'First capture'), description: b('Capturou a primeira bandeira', 'Captured the first flag') },
  { id: 'captures_50', name: b('Ladrão de bandeiras', 'Flag thief'), description: b('50 capturas', '50 captures') },
  { id: 'kills_100', name: b('Atirador', 'Gunner'), description: b('100 kills em jogadores', '100 kills on players') },
  { id: 'kills_1000', name: b('Pistoleiro', 'Gunslinger'), description: b('1000 kills em jogadores', '1000 kills on players') },
  { id: 'kills_10000', name: b('Outgunner', 'Outgunner'), description: b('10000 kills em jogadores', '10000 kills on players') },
  { id: 'accuracy_50', name: b('Mira certeira', 'Sharpshooter'), description: b(`Precisão de 50% ou mais numa partida (mínimo de ${ACCURACY_MIN_SHOTS} tiros)`, `50% accuracy or better in a match (at least ${ACCURACY_MIN_SHOTS} shots)`) },
  { id: 'win_streak_10', name: b('Imbatível', 'Unstoppable'), description: b('10 vitórias seguidas', '10 wins in a row') },
  { id: 'beta', name: b('Pioneiro', 'Pioneer'), description: b('Jogou o beta', 'Played the beta') },
];

const total = (field: 'kills' | 'captures' | 'one', threshold: number) => ({ field, threshold });
const TOTALS: Readonly<Record<string, ReturnType<typeof total>>> = {
  first_match: total('one', 1),
  matches_10: total('one', 10),
  matches_100: total('one', 100),
  matches_1000: total('one', 1000),
  first_capture: total('captures', 1),
  captures_50: total('captures', 50),
  kills_100: total('kills', 100),
  kills_1000: total('kills', 1000),
  kills_10000: total('kills', 10000),
};

/**
 * Marcos que o histórico `matches` (ordem de término) concede, com a partida da conquista.
 * `beta`: as partidas foram jogadas durante o beta (marco na primeira delas).
 */
export function milestonesFrom(matches: readonly MilestoneMatch[], o: { beta?: boolean } = {}): Achieved[] {
  const found = new Map<string, Achieved>();
  const give = (id: string, m: MilestoneMatch) => {
    if (!found.has(id)) found.set(id, { id, matchId: m.matchId, endedAt: m.endedAt });
  };
  const sums = { one: 0, kills: 0, captures: 0 };
  let streak = 0;
  for (const m of matches) {
    sums.one++;
    sums.kills += Math.max(0, m.kills);
    sums.captures += m.captures;
    for (const [id, t] of Object.entries(TOTALS)) if (sums[t.field] >= t.threshold) give(id, m);
    if (m.shots >= ACCURACY_MIN_SHOTS && m.hits * 2 >= m.shots) give('accuracy_50', m);
    streak = m.result > 0 ? streak + 1 : 0;
    if (streak >= 10) give('win_streak_10', m);
    if (o.beta) give('beta', m);
  }
  const order = new Map(MILESTONES.map((x, i) => [x.id, i]));
  return [...found.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
}
