// SPDX-License-Identifier: GPL-2.0-or-later
// Divisão da tela do jogo como `Graphics::make_layout` (src/graphics.cpp:150-230): área das salas à
// esquerda, minimapa e placar à direita, barra de indicadores embaixo (plan/specs/hud.md).
import { iround, ROOM_HEIGHT, ROOM_WIDTH } from '@outgun/sim';
import type { Rect } from '../render/layout.js';

/** Medidas da fonte do jogo (`text_height`, `text_length`). */
export interface FontMetrics {
  readonly height: number;
  width(text: string): number;
}

/** Legendas da barra de baixo já traduzidas (a largura depende do idioma). */
export interface BarLabels {
  readonly health: string;
  readonly energy: string;
  readonly power: string;
  readonly turbo: string;
  readonly shadow: string;
  /** "Weapon 0" traduzido. */
  readonly weapon0: string;
}

export interface ScreenLayout {
  readonly screenW: number;
  readonly screenH: number;
  /** `scr_mul`: pixels por unidade da tela de 640 de largura. */
  readonly mul: number;
  /** Área de jogo (salas). */
  readonly playfield: Rect;
  /** Lugar do minimapa (o minimapa fica centralizado nele na proporção do mapa). */
  readonly minimapPlace: Rect | null;
  /** Placar (x1..x2, y1..y2 inclusivos). */
  readonly scoreboard: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Linha de cima da barra de baixo. */
  readonly indicatorsY: number;
  readonly healthX: number;
  readonly energyX: number;
  readonly pupsX: number;
  /** Fim (à direita) dos valores dos power-ups. */
  readonly pupsValX: number;
  readonly weaponX: number;
  /** Fim (à direita) do relógio. */
  readonly timeX: number;
  readonly timeY: number;
}

/** `scale`: arredonda `scr_mul · v`. */
export const scaleBy = (mul: number, v: number) => iround(mul * v);

/**
 * `make_layout`. `full` = minimapa e placar visíveis (o padrão; a tecla do original alterna).
 */
export function screenLayout(screenW: number, screenH: number, font: FontMetrics, labels: BarLabels, full = true): ScreenLayout {
  let mul = full ? screenW / 640 : screenW / ROOM_WIDTH;
  const bottombarH = 3 * (font.height + 2) + 5;
  // a janela é baixa demais para a área de jogo e uma linha de mensagem
  if (screenH < mul * ROOM_HEIGHT + bottombarH + font.height) mul = (screenH - bottombarH - font.height) / ROOM_HEIGHT;
  const scale = (v: number) => scaleBy(mul, v);
  const playfieldX = full ? 0 : Math.trunc((screenW - scale(ROOM_WIDTH)) / 2);
  const playfieldY = screenH - scale(ROOM_HEIGHT) - bottombarH;
  const playfieldW = Math.ceil(mul * ROOM_WIDTH);
  const playfieldH = Math.ceil(mul * ROOM_HEIGHT);

  let minimapPlace: Rect | null = null;
  let scoreboard: ScreenLayout['scoreboard'] = null;
  if (full) {
    const w = screenW - playfieldW - 4; // margem de 2 de cada lado
    const x = screenW - w - 2;
    let y: number;
    let h: number;
    if (x > font.width('M') * 80) {
      // cabe à direita das mensagens: começa no alto
      y = 4;
      h = scale(100) + playfieldY - 4;
    } else {
      y = playfieldY;
      h = scale(100);
    }
    const extra = screenH - 450 - (y + h); // 450 = altura máxima do placar + linha do FPS
    if (extra > 0) h += extra;
    minimapPlace = { x, y, w, h };
    scoreboard = { x1: playfieldX + playfieldW, y1: y + h, x2: screenW - 1, y2: screenH - 1 };
  }

  const indicatorsY = playfieldY + playfieldH + 5;
  const leftMargin = Math.min(10, scale(10));
  const scoreboardX1 = scoreboard?.x1 ?? playfieldX + playfieldW;
  const maxW = scoreboardX1 - 5 - leftMargin;
  const numLen = font.width('0000');
  const healthW = Math.max(font.width(labels.health) + numLen, scale(100));
  const energyW = Math.max(font.width(labels.energy) + numLen, scale(100));
  const pupsW = Math.max(font.width(labels.power), font.width(labels.turbo), font.width(labels.shadow)) + numLen;
  const weaponW = font.width(labels.weapon0);
  const timeW = font.width('000:00');
  let minW = healthW + energyW + pupsW + weaponW + timeW;
  let space: number;
  let timeY: number;
  if (minW + 4 * 5 > maxW) {
    // o relógio vai para a segunda linha
    minW -= timeW;
    space = Math.trunc((maxW - minW) / 3);
    timeY = indicatorsY + font.height + 2;
  } else {
    space = Math.trunc((maxW - minW) / 4);
    timeY = indicatorsY;
  }
  const healthX = leftMargin;
  const energyX = healthX + healthW + space;
  const pupsX = energyX + energyW + space;
  const weaponX = pupsX + pupsW + space;
  const timeX = timeY === indicatorsY ? weaponX + weaponW + space + timeW : weaponX + timeW;
  return {
    screenW,
    screenH,
    mul,
    playfield: { x: playfieldX, y: playfieldY, w: playfieldW, h: playfieldH },
    minimapPlace,
    scoreboard,
    indicatorsY,
    healthX,
    energyX,
    pupsX,
    pupsValX: pupsX + pupsW,
    weaponX,
    timeX,
    timeY,
  };
}

/** Linhas de mensagem que cabem acima das salas (`chat_lines`) ou na tela toda com Insert (`chat_max_lines`). */
export function chatLines(layout: ScreenLayout, roomsY0: number, fontHeight: number, all: boolean): number {
  const bottom = all ? layout.playfield.y + scaleBy(layout.mul, ROOM_HEIGHT) : roomsY0;
  return Math.max(1, Math.trunc(bottom / (fontHeight + 3)));
}
