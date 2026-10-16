// SPDX-License-Identifier: GPL-2.0-or-later
// Estilos do HUD da partida (D-55, RN-UI-07): Clássico (o da S25), Moderno (sala grande e coluna do
// jogador, protótipo plan/specs/hud-moderno/) e Personalizado (posição, tamanho e visibilidade de cada
// componente, guardados como âncora para valer em qualquer resolução).

export type HudStyle = 'classic' | 'modern' | 'custom';
export const HUD_STYLES: readonly HudStyle[] = ['classic', 'modern', 'custom'];

/** Componentes do HUD Moderno e do Personalizado, na ordem da coluna. */
// a arma é o quarto quadro dos power-ups (OG-303); layouts salvos com "weapon" continuam valendo (a chave é ignorada)
export const HUD_COMPONENTS = ['score', 'minimap', 'health', 'energy', 'powerups', 'chat', 'fps'] as const;
export type HudComponent = (typeof HUD_COMPONENTS)[number];

/** Tamanho de cada componente na escala 1 (px CSS); a escala do componente multiplica os dois lados. */
export const HUD_SIZES: Readonly<Record<HudComponent, readonly [number, number]>> = {
  score: [210, 40],
  minimap: [300, 225],
  health: [220, 36],
  energy: [220, 36],
  powerups: [248, 46],
  chat: [420, 150],
  fps: [70, 16],
};

/**
 * Componente do Personalizado: âncora 0..8 (linha × 3 + coluna); deslocamento, largura, altura e escala
 * do texto em fração da altura da tela, para o HUD manter a proporção em qualquer resolução.
 */
export interface CustomComponent {
  readonly anchor: number;
  readonly dx: number;
  readonly dy: number;
  readonly w: number;
  readonly h: number;
  /** Escala do texto ÷ altura da tela (escala 1,5 em 1080 px = 1,5/1080). */
  readonly s: number;
  readonly visible: boolean;
}

export type HudRoom = 'left' | 'centre';

export interface HudCustom {
  readonly room: HudRoom;
  /** `null` enquanto o jogador não salvou no editor: vale o layout do Moderno. */
  readonly comps: Readonly<Record<HudComponent, CustomComponent>> | null;
}

export const DEFAULT_HUD_CUSTOM: HudCustom = { room: 'left', comps: null };

/** Limites da escala do texto de um componente, relativa à escala automática do HUD. */
export const CUSTOM_SCALE_MIN = 0.5;
export const CUSTOM_SCALE_MAX = 2.5;

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Layout personalizado salvo (navegador ou conta), conferido; o que vier errado volta ao Moderno. */
export function parseHudCustom(saved: unknown): HudCustom {
  if (!saved || typeof saved !== 'object') return DEFAULT_HUD_CUSTOM;
  const s = saved as Record<string, unknown>;
  const room: HudRoom = s.room === 'centre' ? 'centre' : 'left';
  if (!s.comps || typeof s.comps !== 'object') return { room, comps: null };
  const raw = s.comps as Record<string, unknown>;
  const comps = {} as Record<HudComponent, CustomComponent>;
  for (const id of HUD_COMPONENTS) {
    const c = raw[id] as Record<string, unknown> | undefined;
    const anchor = num(c?.anchor, 0, 8);
    const dx = num(c?.dx, -2, 2);
    const dy = num(c?.dy, -2, 2);
    const w = num(c?.w, 0.005, 4);
    const h = num(c?.h, 0.005, 1);
    const sc = num(c?.s, 0.0001, 0.02);
    if (!c || anchor === null || !Number.isInteger(anchor) || dx === null || dy === null || w === null || h === null || sc === null || typeof c.visible !== 'boolean') return { room, comps: null };
    comps[id] = { anchor, dx, dy, w, h, s: sc, visible: c.visible };
  }
  return { room, comps };
}
