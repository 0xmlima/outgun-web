// SPDX-License-Identifier: GPL-2.0-or-later
/**
 * Duração de um frame da simulação, em segundos. O servidor original simula a 10 frames/s
 * (`frame / 10.` em src/world.cpp; `timeLeft = .1` em ServerWorld::regenerateHealthOrEnergy).
 * Constantes completas e unidades: card OG-004.
 */
export const FRAME_SECONDS = 0.1;

export const FRAMES_PER_SECOND = 10;

export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * FRAMES_PER_SECOND);
}
