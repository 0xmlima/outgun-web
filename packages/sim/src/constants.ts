// SPDX-License-Identifier: GPL-2.0-or-later
// Constantes do Outgun original. Cada valor cita a origem; não introduza números mágicos de
// gameplay fora deste arquivo ou das settings (packages/settings).

/** Largura de uma sala em pixels lógicos (`plw`, src/commont.h:282). */
export const ROOM_WIDTH = 472;
/** Altura de uma sala em pixels lógicos (`plh`, src/commont.h:282). */
export const ROOM_HEIGHT = 354;

/** Raio do jogador (src/commont.h:284). */
export const PLAYER_RADIUS = 15;
/** Somado a PLAYER_RADIUS para o escudo (src/commont.h:285). */
export const SHIELD_RADIUS_ADD = 9;
/** Raio do foguete normal (src/commont.h:286). */
export const ROCKET_RADIUS = 4;
/** Raio do foguete com power-up power (src/commont.h:286). */
export const POWER_ROCKET_RADIUS = 6;
/** Raio de toque de power-ups (src/world.h:39). */
export const POWERUP_RADIUS = 15;
/** Raio de toque de bandeiras (src/world.h:39). */
export const FLAG_RADIUS = 15;
/**
 * Deslocamento lateral dos foguetes paralelos (`WorldBase::shot_deltax`, src/world.h:894):
 * `PLAYER_RADIUS + ROCKET_RADIUS - 2`.
 */
export const SHOT_DELTA_X = PLAYER_RADIUS + ROCKET_RADIUS - 2;

/** Máximo absoluto de jogadores numa sala (src/commont.h:308). */
export const MAX_PLAYERS = 32;
/** Máximo de foguetes simultâneos; IDs cabem num byte (src/commont.h:312). */
export const MAX_ROCKETS = 256;
/** Máximo de power-ups no chão ao mesmo tempo (src/commont.h:313). */
export const MAX_POWERUPS = 32;
/** Tamanho máximo do nome do jogador (`maxPlayerNameLength`, src/commont.h:53). */
export const MAX_PLAYER_NAME_LENGTH = 15;
/** Tamanho máximo de uma mensagem de chat (`max_chat_message_length`, src/commont.h:54). */
export const MAX_CHAT_MESSAGE_LENGTH = 200;

/** Duração de um frame em segundos: o servidor simula a 10 frames/s (`timeLeft = .1`, src/world.cpp:3091). */
export const FRAME_SECONDS = 0.1;
/** Frames por segundo da simulação. */
export const FRAMES_PER_SECOND = 10;

/**
 * π e frações (src/commont.h:315-317). O original escreve 21 dígitos; o compilador os arredonda para
 * o double mais próximo, que é exatamente o valor abaixo (igual a Math.PI, Math.PI / 2, Math.PI / 4).
 */
export const N_PI = 3.141592653589793;
export const N_PI_2 = 1.5707963267948966;
export const N_PI_4 = 0.7853981633974483;
