// SPDX-License-Identifier: GPL-2.0-or-later
// Modos de treino (D-86, D-87): opções da sala de treino, compartilhadas entre o cliente, a API e o
// servidor do jogo (RN-TRN-04, RN-TRN-06).

export type TrainingModeId = 'attack' | 'defense' | 'escape' | 'capture';

export const TRAINING_MODES_LIST: readonly TrainingModeId[] = ['attack', 'defense', 'escape', 'capture'];

/** Opções da sala de treino, escolhidas na criação (OG-492). */
export interface TrainingOptions {
  mode: TrainingModeId;
  /** Bots do outro lado: defensores (Ataque), atacantes (Defesa), perseguidores (Fuga) ou a escolta máxima (Captura). */
  bots: number;
  /** Bots aliados de quem treina (só na Defesa, 0 a 2). */
  allies: number;
  /** Nível dos bots, 1 a 5; 0 = progressivo (OG-499). */
  level: number;
  /** Power-ups (desligados por padrão, RN-TRN-06). */
  powerups: boolean;
  /** Mesmo início em todas as tentativas (OG-500); o padrão é variar. */
  sameStart: boolean;
}

/** Mapas de treino (D-87): lista fixa, a mesma nos quatro modos, independente da rotação Casual. */
export const TRAINING_MAPS: readonly string[] = ['2 versus 2 (duel)', '3x3 (duel)', 'cebs park', 'pari2', 'the cover 4'];

/** Limites das opções por modo (RN-TRN-04). */
export const TRAINING_LIMITS: Record<TrainingModeId, { bots: readonly [number, number]; allies: readonly [number, number] }> = {
  attack: { bots: [1, 4], allies: [0, 0] },
  defense: { bots: [1, 5], allies: [0, 2] },
  escape: { bots: [1, 4], allies: [0, 0] },
  capture: { bots: [0, 3], allies: [0, 0] },
};

/** Opções novas de um modo: o meio dos limites, nível 3, power-ups desligados, início variado. */
export function defaultTraining(mode: TrainingModeId): TrainingOptions {
  const l = TRAINING_LIMITS[mode];
  return { mode, bots: mode === 'capture' ? 2 : Math.min(2, l.bots[1]), allies: mode === 'defense' ? 1 : 0, level: 3, powerups: false, sameStart: false };
}

/** Opções dentro dos limites do modo. */
export function clampTraining(c: TrainingOptions): TrainingOptions {
  const l = TRAINING_LIMITS[c.mode];
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, Math.trunc(v)));
  return { ...c, bots: clamp(c.bots, l.bots), allies: clamp(c.allies, l.allies), level: clamp(c.level, [0, 5]) };
}

/** Vagas da sala de treino: cabem os bots dos papéis e humanos dos dois lados (bots não ocupam vaga, OG-445). */
export const TRAINING_MAX_PLAYERS = 16;
