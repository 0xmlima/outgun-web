// SPDX-License-Identifier: GPL-2.0-or-later
// Os modos de treino (OG-493 a OG-496): quem joga, onde começa e quando a tentativa acaba (RN-TRN-04).
import { attackMode } from './training-attack.js';
import { captureMode } from './training-capture.js';
import { defenseMode } from './training-defense.js';
import { escapeMode } from './training-escape.js';
import type { TrainingModeDef, TrainingModeId } from './training.js';

export const TRAINING_MODES: Record<TrainingModeId, TrainingModeDef> = {
  attack: attackMode,
  defense: defenseMode,
  escape: escapeMode,
  capture: captureMode,
};
