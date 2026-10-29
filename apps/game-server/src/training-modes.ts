// SPDX-License-Identifier: GPL-2.0-or-later
// Os modos de treino (OG-493 a OG-496): quem joga, onde começa e quando a tentativa acaba (RN-TRN-04).
import type { TrainingModeDef, TrainingModeId } from './training.js';

/** Modo ainda sem regras: ninguém além de quem treina, sem fim (só o limite de tempo da tentativa). */
const pending: TrainingModeDef = {
  roster: () => [],
  place: () => new Map(),
  judge: () => null,
};

export const TRAINING_MODES: Record<TrainingModeId, TrainingModeDef> = {
  attack: pending,
  defense: pending,
  escape: pending,
  capture: pending,
};
