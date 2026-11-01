// SPDX-License-Identifier: GPL-2.0-or-later
// Divisão da tela do jogo. Parte de `Graphics::make_layout` (src/graphics.cpp:150-230): área das salas à
// esquerda, minimapa e placar à direita, barra de indicadores embaixo; na v2 o HUD tem uma escala pela
// resolução (D-54, RN-UI-06, plan/specs/hud.md e plan/specs/hud-resolucoes/).
import { iround, ROOM_HEIGHT, ROOM_WIDTH } from '@outgun/sim';
import type { Rect } from '../render/layout.js';
import { DEFAULT_HUD_CUSTOM, type HudCustom, type HudStyle } from './hud-style.js';
import { customArrangement, modernArrangement, type Places } from './modern-layout.js';

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

/**
 * `faixa`: chat na largura toda em cima, sala embaixo à esquerda, minimapa e placar à direita (4:3).
 * `coluna`: telas largas (≥ 3:2), sala com a altura toda e chat no alto da coluna da direita (OG-295).
 * `livre`: sem minimapa e placar (F12), sala centralizada.
 * `componentes`: HUD Moderno ou Personalizado (D-55), cada componente no seu lugar (`hud`).
 * `celular`: celular em pé (experimental): sala na largura toda em cima, barra, minimapa e placar
 * lado a lado embaixo, com a mesma altura; o placar mostra um time ou o chat por vez, deslizando.
 */
export type HudMode = 'faixa' | 'coluna' | 'livre' | 'componentes' | 'celular';

export interface ScoreboardPlace {
  /** Área do placar (x1..x2, y1..y2 inclusivos). */
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Escala do texto do placar (OG-294). */
  readonly scale: number;
  /** Os dois times lado a lado. */
  readonly side: boolean;
}

export interface ScreenLayout {
  readonly screenW: number;
  readonly screenH: number;
  readonly style: HudStyle;
  readonly mode: HudMode;
  /** Lugar de cada componente no Moderno e no Personalizado (`null` no Clássico). */
  readonly hud: Places | null;
  /** TAB abre o placar completo (Moderno, Personalizado e Clássico com os frags só no TAB, OG-302). */
  readonly tabScoreboard: boolean;
  /** Escala do HUD: texto, linhas, barras e espaçamentos (RN-UI-06). */
  readonly ui: number;
  /** `scr_mul`: pixels por unidade da sala. */
  readonly mul: number;
  /** Área de jogo (salas). */
  readonly playfield: Rect;
  /** Onde o chat é escrito (mensagens e a linha de digitação). */
  readonly chat: Rect;
  /** Altura de uma linha de chat. */
  readonly lineH: number;
  /** Caracteres por linha de chat (até os 79 do original). */
  readonly chatChars: number;
  /** Lugar do minimapa (o minimapa fica centralizado nele na proporção do mapa). */
  readonly minimapPlace: Rect | null;
  readonly scoreboard: ScoreboardPlace | null;
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
  /** Celular: largura das barras de vida e energia (no resto, `scr_mul · 100`). */
  readonly barW?: number;
}

/** `scale`: arredonda `scr_mul · v`. */
export const scaleBy = (mul: number, v: number) => iround(mul * v);

/** Escala automática do HUD: pela altura (ou pela largura numa tela mais alta que 4:3), em passos de 0,5. */
export function autoHudScale(screenW: number, screenH: number): number {
  return Math.max(1, Math.round((Math.min(screenH, (screenW * 3) / 4) / 700) * 2) / 2);
}

/** Linhas reservadas no placar empilhado: legenda + 8 jogadores, por time (maxplayers 16). */
const SCOREBOARD_ROWS = 18;

/** Fonte com as medidas multiplicadas pela escala. */
export function scaledFont(font: FontMetrics, k: number): FontMetrics {
  return { height: font.height * k, width: (t) => font.width(t) * k };
}

/**
 * Divisão da tela. `full` = minimapa e placar visíveis (F12 alterna); `ui` = escala do HUD (padrão:
 * automática pela resolução).
 */
export function screenLayout(
  screenW: number,
  screenH: number,
  baseFont: FontMetrics,
  labels: BarLabels,
  full = true,
  ui = autoHudScale(screenW, screenH),
  style: HudStyle = 'classic',
  custom: HudCustom = DEFAULT_HUD_CUSTOM,
  fragsOnTab = false,
  phone = false,
  /** Tamanho do mapa em salas (celular: a altura do minimapa e do placar segue a proporção do mapa). */
  mapSize?: { readonly w: number; readonly h: number },
): ScreenLayout {
  if (phone) {
    style = 'classic';
    fragsOnTab = false;
  }
  if (style !== 'classic') return componentsLayout(screenW, screenH, style, custom, full, ui);
  const u = ui;
  const font = scaledFont(baseFont, u);
  const fh = font.height;
  const lineH = fh + 3 * u;
  const bottombarH = Math.round(3 * (fh + 2 * u) + 5 * u);
  const fpsH = fh + 4;
  const charW = baseFont.width('M');
  /** Altura de uma linha do placar e largura mínima dele na escala `s`. */
  const rowH = (s: number) => (baseFont.height + 2) * s;
  const boardW = (s: number) => (20 * charW + 16) * s;

  let mode: HudMode;
  let mul: number;
  let playfield: Rect;
  let chat: Rect;
  let minimapPlace: Rect | null = null;
  let scoreboard: ScoreboardPlace | null = null;

  if (phone) {
    // celular em pé: a sala na largura toda; abaixo da barra, minimapa à esquerda e placar à direita
    mode = 'celular';
    // a altura de um time do placar vem primeiro: em tela curta, a sala diminui para ele caber inteiro
    const boardH = (SCOREBOARD_ROWS / 2) * rowH(u) + 1;
    const roomMax = screenH - bottombarH - 4 * u - boardH - fpsH - 4 * u;
    mul = Math.min(screenW / ROOM_WIDTH, (0.6 * screenH) / ROOM_HEIGHT, roomMax / ROOM_HEIGHT);
    const w = Math.round(mul * ROOM_WIDTH);
    const h = Math.round(mul * ROOM_HEIGHT);
    playfield = { x: Math.trunc((screenW - w) / 2), y: 0, w, h };
    const top = h + bottombarH + 4 * u;
    const half = Math.trunc(screenW / 2);
    // minimapa e placar quase encostados nas bordas da tela
    const mmW = half - 3 * u;
    // minimapa e placar (um time ou o chat por vez) com a mesma altura: a do mapa na largura da
    // coluna, mas no mínimo a de um time do placar
    const avail = Math.max(0, screenH - fpsH - 4 * u - top);
    const mapNatural = mapSize ? Math.trunc((mmW * mapSize.h * 3) / (mapSize.w * 4)) + 1 : avail;
    const blockH = Math.min(avail, Math.max(mapNatural, boardH));
    minimapPlace = { x: u, y: top, w: mmW, h: blockH };
    chat = { x: half + 2 * u, y: top + 2 * u, w: screenW - half - 4 * u, h: blockH - 2 * u };
    scoreboard = { x1: half + u, y1: top, x2: screenW - 1 - u, y2: top + blockH - 1, scale: u, side: false };
  } else if (!full) {
    // F12: a sala o maior possível, centralizada; o chat fica com o que sobra em cima (mín. 3 mensagens)
    mode = 'livre';
    mul = Math.min(screenW / ROOM_WIDTH, (screenH - (4 * lineH + 6 * u) - bottombarH) / ROOM_HEIGHT);
    const w = Math.round(mul * ROOM_WIDTH);
    const h = Math.round(mul * ROOM_HEIGHT);
    playfield = { x: Math.trunc((screenW - w) / 2), y: screenH - bottombarH - h, w, h };
    chat = { x: 3 * u, y: 3 * u, w: screenW - 6 * u, h: playfield.y - 3 * u };
  } else if (screenW / screenH >= 1.5) {
    // tela larga (OG-295): sala com a altura toda; chat no alto da coluna, times do placar lado a lado
    mode = 'coluna';
    const minCol = Math.max(2 * boardW(u) + 8 * u + 12, 40 * charW * u + 12);
    mul = (screenH - bottombarH - 4 * u) / ROOM_HEIGHT;
    let w = Math.round(ROOM_WIDTH * mul);
    if (screenW - w < minCol) {
      w = screenW - minCol;
      mul = w / ROOM_WIDTH;
    }
    const h = Math.round(ROOM_HEIGHT * mul);
    playfield = { x: 0, y: screenH - bottombarH - h, w, h };
    const colX = w;
    const colW = screenW - colX;
    /** Maior escala do placar (lado a lado se couber) que deixe o minimapa com `minMm` de altura. */
    const fit = (avail: number, minMm: number) => {
      for (let t = 2 * u; t >= u; t -= 0.5) {
        const side = colW - 12 >= 2 * boardW(t) + 8 * u;
        if (!side && boardW(t) > colW - 12) continue;
        const need = (side ? SCOREBOARD_ROWS / 2 : SCOREBOARD_ROWS) * rowH(t) + (side ? 0 : 6 * u);
        if (avail - need >= minMm) return { s: t, side, mmH: avail - need };
      }
      return { s: u, side: false, mmH: Math.max(0, avail - SCOREBOARD_ROWS * rowH(u) - 6 * u) };
    };
    let mmY: number;
    let f: ReturnType<typeof fit>;
    if (playfield.y >= 4 * lineH + 6 * u) {
      // a sala parou pela largura (16:10): a sobra de cima vira faixa de chat na largura toda
      chat = { x: 3 * u, y: 3 * u, w: screenW - 6 * u, h: playfield.y - 3 * u };
      mmY = playfield.y;
      const avail = screenH - mmY - 8 * u - fpsH;
      f = fit(avail, 0.25 * avail);
    } else {
      const chatH = Math.round(8 * lineH + 6 * u);
      chat = { x: colX + 6 * u, y: 3 * u, w: colW - 9 * u, h: chatH - 3 * u };
      mmY = chatH + 4 * u;
      f = fit(screenH - mmY - 8 * u - fpsH, 0.2 * screenH);
    }
    const mmH = Math.round(f.mmH);
    minimapPlace = { x: colX + 4 * u, y: mmY, w: colW - 8 * u, h: mmH };
    scoreboard = { x1: colX, y1: mmY + mmH + 4 * u, x2: screenW - 1, y2: screenH - fpsH - 4 * u - 1, scale: f.s, side: f.side };
  } else {
    mode = 'faixa';
    const chatH = Math.round(Math.max(7 * lineH + 6 * u, 0.22 * screenH));
    mul = (screenH - chatH - bottombarH) / ROOM_HEIGHT;
    let w = Math.round(ROOM_WIDTH * mul);
    const minCol = boardW(u) + 12;
    if (screenW - w < minCol) {
      w = screenW - minCol;
      mul = w / ROOM_WIDTH;
    }
    const h = Math.round(ROOM_HEIGHT * mul);
    playfield = { x: 0, y: screenH - bottombarH - h, w, h };
    chat = { x: 3 * u, y: 3 * u, w: screenW - 6 * u, h: playfield.y - 3 * u };
    // minimapa começa na linha da área de jogo, na largura da coluna; o placar fica com o resto até o FPS
    const colX = w;
    const mmW = screenW - colX - 8 * u;
    const natural = Math.round(mmW * 0.5625); // mapa 4×3 salas ocupando a largura
    const avail = screenH - playfield.y - 8 * u - fpsH;
    let s = u;
    let mmH = Math.max(Math.round(mmW * 0.3), avail - SCOREBOARD_ROWS * rowH(u) - 18 * u);
    for (let t = 2 * u; t >= u; t -= 0.5) {
      const need = SCOREBOARD_ROWS * rowH(t) + 18 * u;
      if (boardW(t) <= screenW - colX - 8 * u && avail - need >= Math.min(natural, mmW * 0.42)) {
        s = t;
        mmH = avail - need;
        break;
      }
    }
    mmH = Math.round(Math.min(natural, mmH));
    minimapPlace = { x: colX + 4 * u, y: playfield.y, w: mmW, h: mmH };
    const y1 = playfield.y + mmH + 4 * u;
    scoreboard = { x1: colX, y1, x2: screenW - 1, y2: screenH - fpsH - 4 * u - 1, scale: s, side: false };
  }

  // OG-302: Clássico sem a lista de frags; a sobra vai para o chat (chat na coluna) ou fica com o minimapa
  if (fragsOnTab && scoreboard && minimapPlace) {
    const bottom = screenH - fpsH - 4 * u;
    const natural = Math.round(minimapPlace.w * 0.75);
    if (chat.x >= playfield.x + playfield.w) {
      const mmH = Math.max(0, Math.min(natural, bottom - (chat.y + 8 * lineH + 4 * u)));
      minimapPlace = { ...minimapPlace, y: bottom - mmH, h: mmH };
      chat = { ...chat, h: minimapPlace.y - 4 * u - chat.y };
    } else minimapPlace = { ...minimapPlace, h: Math.min(natural, bottom - minimapPlace.y) };
    scoreboard = null;
  }

  const indicatorsY = playfield.y + playfield.h + 5 * u;
  // celular: a barra na largura da tela (a sala pode ficar mais estreita para o placar caber)
  const bar = mode === 'celular' ? { x: 0, w: screenW } : playfield;
  const leftMargin = bar.x + 10 * u;
  const maxW = bar.x + bar.w - 5 * u - leftMargin;
  const numLen = font.width('0000');
  const healthW = Math.max(font.width(labels.health) + numLen, scaleBy(mul, 100));
  const energyW = Math.max(font.width(labels.energy) + numLen, scaleBy(mul, 100));
  const pupsW = Math.max(font.width(labels.power), font.width(labels.turbo), font.width(labels.shadow)) + numLen;
  const weaponW = font.width(labels.weapon0);
  const timeW = font.width('000:00');
  let minW = healthW + energyW + pupsW + weaponW + timeW;
  let space: number;
  let timeY: number;
  if (minW + 4 * 5 * u > maxW) {
    // o relógio vai para a segunda linha
    minW -= timeW;
    space = Math.trunc((maxW - minW) / 3);
    timeY = indicatorsY + fh + 2 * u;
  } else {
    space = Math.trunc((maxW - minW) / 4);
    timeY = indicatorsY;
  }
  // celular: vida e energia com as pontas alinhadas às do minimapa e um espaço entre elas; os itens
  // ficam à direita
  const phoneBars = mode === 'celular' && minimapPlace ? { mm: minimapPlace, w: Math.trunc((minimapPlace.w - 16 * u) / 2) } : null;
  const healthX = phoneBars ? phoneBars.mm.x : leftMargin;
  const energyX = phoneBars ? phoneBars.mm.x + phoneBars.mm.w - phoneBars.w : healthX + healthW + space;
  const pupsX = phoneBars ? phoneBars.mm.x + phoneBars.mm.w + 8 * u : energyX + energyW + space;
  const weaponX = pupsX + pupsW + space;
  const timeX = timeY === indicatorsY ? weaponX + weaponW + space + timeW : weaponX + timeW;
  return {
    screenW,
    screenH,
    style,
    mode,
    hud: null,
    tabScoreboard: fragsOnTab,
    ui: u,
    mul,
    playfield,
    chat,
    lineH,
    chatChars: Math.min(79, Math.trunc(chat.w / (charW * u))),
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
    ...(phoneBars ? { barW: phoneBars.w } : {}),
  };
}

/** Altura de uma linha do chat do HUD Moderno na escala `s`. */
export const modernLineH = (s: number) => Math.round(20 * s);

/** Largura de um caractere da Inter no corpo do chat (13 px na escala 1), com folga para maiúsculas, para quebrar as linhas. */
const MODERN_CHAR_W = 8;

/**
 * Moderno e Personalizado (D-55): a sala e os componentes vêm de `modern-layout.ts`; os campos do
 * Clássico que o resto do cliente usa (chat, minimapa, área de jogo) apontam para os componentes.
 * F12 esconde só o minimapa.
 */
function componentsLayout(screenW: number, screenH: number, style: HudStyle, custom: HudCustom, full: boolean, u: number): ScreenLayout {
  const { room, places } = style === 'custom' ? customArrangement(screenW, screenH, u, custom, full) : modernArrangement(screenW, screenH, u, full);
  const chat = places.chat ?? { x: 0, y: 0, w: 0, h: 0, s: u };
  return {
    screenW,
    screenH,
    style,
    mode: 'componentes',
    hud: places,
    tabScoreboard: true,
    ui: u,
    mul: room.w / ROOM_WIDTH,
    playfield: room,
    chat: { x: chat.x, y: chat.y, w: chat.w, h: chat.h },
    lineH: modernLineH(chat.s),
    chatChars: Math.max(10, Math.min(79, Math.trunc(chat.w / (MODERN_CHAR_W * chat.s)))),
    minimapPlace: places.minimap ?? null,
    scoreboard: null,
    indicatorsY: 0,
    healthX: 0,
    energyX: 0,
    pupsX: 0,
    pupsValX: 0,
    weaponX: 0,
    timeX: 0,
    timeY: 0,
  };
}

/** Linhas de mensagem no chat (sem a de digitação); com Insert, até o fim da área de jogo. */
export function chatLines(layout: ScreenLayout, all: boolean): number {
  if (layout.mode === 'componentes') return Math.max(1, Math.trunc(layout.chat.h / layout.lineH) - 1);
  const bottom = all && layout.mode !== 'celular' ? layout.playfield.y + layout.playfield.h : layout.chat.y + layout.chat.h;
  return Math.max(1, Math.trunc((bottom - layout.chat.y) / layout.lineH) - 1);
}
