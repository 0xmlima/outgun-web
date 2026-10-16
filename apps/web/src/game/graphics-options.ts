// SPDX-License-Identifier: GPL-2.0-or-later
// Opções gráficas avançadas do original que o desenho da partida consulta (OG-070,
// plan/specs/opcoes-graficas.md). Padrões = `config/client.cfg` distribuído (D-05).
import type { EmphasizeFlags, HudScale, MinimapPlayers, NeighborMarkers, ViewOverBorder } from '../app/prefs.js';
import { DEFAULT_HUD_CUSTOM, type HudCustom, type HudStyle } from './hud/hud-style.js';

export interface GraphicsOptions {
  readonly scroll: boolean;
  readonly lessTransparency: boolean;
  readonly minimapPlayers: MinimapPlayers;
  readonly highlightReturnedFlags: boolean;
  readonly emphasizeFlags: EmphasizeFlags;
  readonly oldFlagPositions: boolean;
  readonly spawnHighlight: boolean;
  readonly neighborMarkers: NeighborMarkers;
  readonly boxVisibleArea: boolean;
  readonly viewOverBorder: ViewOverBorder;
  readonly repeatMap: boolean;
  readonly mapInfoMode: boolean;
  readonly underlineAccounts: boolean;
  readonly stayDeadInMenus: boolean;
  /** Tema cuja imagem `background` cobre a tela fora das salas (`''` = nenhum) e "Prefer main theme background". */
  readonly backgroundTheme: string;
  readonly preferThemeBackground: boolean;
  /** Escala do HUD (OG-296): `auto` = pela resolução. */
  readonly hudScale: HudScale;
  /** Estilo do HUD e layout do Personalizado (D-55). */
  readonly hudStyle: HudStyle;
  readonly hudCustom: HudCustom;
  /** Clássico com os frags só no TAB (OG-302). */
  readonly classicFragsOnTab: boolean;
}

export const DEFAULT_GRAPHICS: GraphicsOptions = {
  scroll: false,
  lessTransparency: false,
  minimapPlayers: 'fade',
  highlightReturnedFlags: false,
  emphasizeFlags: 'never',
  oldFlagPositions: false,
  spawnHighlight: true,
  neighborMarkers: 'never',
  boxVisibleArea: true,
  viewOverBorder: 'mapWraps',
  repeatMap: false,
  mapInfoMode: false,
  underlineAccounts: true,
  stayDeadInMenus: true,
  backgroundTheme: '',
  preferThemeBackground: true,
  hudScale: 'auto',
  hudStyle: 'classic',
  hudCustom: DEFAULT_HUD_CUSTOM,
  classicFragsOnTab: false,
};

/** Escala fixa escolhida nas Opções, ou `undefined` para a automática. */
export function hudScaleValue(scale: HudScale): number | undefined {
  return scale === 'auto' ? undefined : Number(scale);
}

/** `calculateVisibilities`: frames sem notícia até o jogador sumir do minimapa e início do esmaecimento. */
export function minimapFade(mode: MinimapPlayers): { max: number; start: number } {
  return mode === 'hideEarly' ? { max: 12, start: 12 } : mode === 'hideLate' ? { max: 20, start: 20 } : { max: 20, start: 10 };
}

/** `Menu_graphics::emphasizeFlag`. */
export function emphasizeFlag(mode: EmphasizeFlags, visibleRooms: number): boolean {
  return mode !== 'never' && (visibleRooms >= 2 || mode === 'always');
}

/** `Menu_graphics::showNeighborMarkers` (no jogo). */
export function showNeighborMarkers(mode: NeighborMarkers, visibleRooms: number): boolean {
  return mode === 'always' || (mode === 'oneRoom' && visibleRooms < 2);
}
