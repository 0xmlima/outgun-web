// SPDX-License-Identifier: GPL-2.0-or-later
// Controles do jogador (`ClientControls`, src/commont.h:64-110, src/commont.cpp:134) e direção da
// arma (`GunDirection`, src/world.h:387-420). A direção é medida em oitavos de volta: 0 = direita,
// sentido horário na tela (2 = baixo, 4 = esquerda, 6 = cima); −1 = indefinida.
import { N_PI_4 } from '../constants.js';
import { iround, positiveFmod } from '../math.js';

export const CONTROL = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  run: 16,
  strafe: 32,
} as const;

const has = (controls: number, bit: number) => (controls & bit) !== 0;

export const isUp = (c: number) => has(c, CONTROL.up);
export const isDown = (c: number) => has(c, CONTROL.down);
export const isLeft = (c: number) => has(c, CONTROL.left);
export const isRight = (c: number) => has(c, CONTROL.right);
export const isRun = (c: number) => has(c, CONTROL.run);
export const isStrafe = (c: number) => has(c, CONTROL.strafe);

/** `clearModifiersIfIdle`: sem direção, correr e strafe são descartados. */
export function clearModifiersIfIdle(controls: number): number {
  const upDown = isUp(controls) !== isDown(controls);
  const leftRight = isLeft(controls) !== isRight(controls);
  return upDown || leftRight ? controls : controls & ~(CONTROL.run | CONTROL.strafe);
}

/** `ClientControls::getDirection`: −1 sem direção, senão 0..7. */
export function controlDirection(controls: number): number {
  const up = isUp(controls) && !isDown(controls);
  const down = !isUp(controls) && isDown(controls);
  if (isLeft(controls) && !isRight(controls)) return up ? 5 : down ? 3 : 4;
  if (!isLeft(controls) && isRight(controls)) return up ? 7 : down ? 1 : 0;
  return up ? 6 : down ? 2 : -1;
}

/** `GunDirection::adjust`: soma oitavos e normaliza para [0, 8). */
export function adjustGunDirection(direction: number, change: number): number {
  return positiveFmod(direction + change, 8);
}

/** `GunDirection::updateFromControls`: muda só se os controles indicam uma direção. */
export function gunDirectionFromControls(direction: number, controls: number): number {
  const d = controlDirection(controls);
  return d === -1 ? direction : d;
}

/** `GunDirection::toRad`. */
export function gunDirectionToRad(direction: number): number {
  return direction * N_PI_4;
}

/** `GunDirection::to8way`. */
export function gunDirectionTo8way(direction: number): number {
  return iround(direction) % 8;
}
