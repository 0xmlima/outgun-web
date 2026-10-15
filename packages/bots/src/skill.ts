// SPDX-License-Identifier: GPL-2.0-or-later
// Níveis de dificuldade dos bots (OG-266, RN-RKL-19): de 1 (fraco) a 5 (forte). O nível 4 é o bot
// de referência — o do original (OG-050..054), usado no Casual — e não muda nada nem consome o `Rng`
// a mais. Com `bot_ping 100` e giro tradicional (Clássico e Ranked), o bot do original já está perto
// do teto destes parâmetros: só sobra tirar o frame de atraso (nível 5). Os outros mexem só em:
// - `aimSpread`: multiplica o erro de giro da mira com giro livre (0,7 no original);
// - `aimMiss`: chance de errar a direção do tiro em 1/8 de volta com giro tradicional (0 = nunca);
// - `reactionFrames`: frames somados ao atraso do `bot_ping` (negativo encurta, mínimo 0);
// - `decideEvery`: decide a cada N frames (entre decisões, segura os controles da última).

export interface BotSkill {
  level: number;
  aimSpread: number;
  aimMiss: number;
  reactionFrames: number;
  decideEvery: number;
}

export const REFERENCE_BOT_LEVEL = 4;

export const BOT_LEVELS: readonly BotSkill[] = [
  { level: 1, aimSpread: 1.4, aimMiss: 0.35, reactionFrames: 3, decideEvery: 3 },
  { level: 2, aimSpread: 1.25, aimMiss: 0.2, reactionFrames: 2, decideEvery: 2 },
  { level: 3, aimSpread: 1.1, aimMiss: 0.08, reactionFrames: 1, decideEvery: 1 },
  { level: 4, aimSpread: 1, aimMiss: 0, reactionFrames: 0, decideEvery: 1 },
  { level: 5, aimSpread: 0.5, aimMiss: 0, reactionFrames: -1, decideEvery: 1 },
];

/** Parâmetros do nível (fora de 1..5 vale o mais próximo; não inteiro arredonda). */
export function botSkill(level: number = REFERENCE_BOT_LEVEL): BotSkill {
  const i = Math.min(BOT_LEVELS.length, Math.max(1, Math.round(Number.isFinite(level) ? level : REFERENCE_BOT_LEVEL))) - 1;
  return BOT_LEVELS[i]!;
}
