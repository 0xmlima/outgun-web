// SPDX-License-Identifier: GPL-2.0-or-later
// Helpers numéricos com a mesma semântica do C++ original. Números JS são doubles IEEE 754, como
// `double` em C++; o que muda são as conversões para inteiro, reproduzidas aqui.
import { FRAMES_PER_SECOND } from './constants.js';

/**
 * `static_cast<int>(double)`: trunca em direção a zero. Fora da faixa de int o C++ é indefinido;
 * aqui o valor é apenas truncado (não acontece em jogo).
 */
export function truncToInt(value: number): number {
  return Math.trunc(value);
}

/** `iround` (src/utility.cpp:133): arredonda metade para longe de zero via truncamento. */
export function iround(value: number): number {
  return value >= 0 ? Math.trunc(value + 0.5) : Math.trunc(value - 0.5);
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** `iround_bound` (src/utility.cpp:140): como iround, mas satura nos limites de int. */
export function iroundBound(value: number): number {
  if (value <= INT_MIN) return INT_MIN;
  if (value >= INT_MAX) return INT_MAX;
  return iround(value);
}

/** `sqr` (src/utility.h:355). */
export function sqr(value: number): number {
  return value * value;
}

/**
 * `positiveModulo` (src/utility.h:363) para inteiros: resultado em [0, modulus). Usado na troca de
 * sala (mundo toroidal) e na distância entre salas.
 */
export function positiveModulo(value: number, modulus: number): number {
  if (!(modulus > 0)) throw new RangeError(`modulus deve ser positivo: ${modulus}`);
  return value >= 0 ? value % modulus : modulus - 1 - ((-value - 1) % modulus);
}

/**
 * `positiveFmod` (src/utility.cpp:156): `fmod(modulus + fmod(val, modulus), modulus)`. O operador
 * `%` do JS em doubles é exatamente o `fmod` do C.
 */
export function positiveFmod(value: number, modulus: number): number {
  if (!(modulus > 0)) throw new RangeError(`modulus deve ser positivo: ${modulus}`);
  return (modulus + (value % modulus)) % modulus;
}

/**
 * Segundos → frames, como o original converte settings de tempo (ex. `iround_bound(t * 10.)` em
 * ServerWorld::resetPlayer, src/world.cpp:2250).
 */
export function secondsToFrames(seconds: number): number {
  return iroundBound(seconds * FRAMES_PER_SECOND);
}

/** Frames → segundos (`frame / 10.` no original). */
export function framesToSeconds(frames: number): number {
  return frames / FRAMES_PER_SECOND;
}
