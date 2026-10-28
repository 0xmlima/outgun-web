// SPDX-License-Identifier: GPL-2.0-or-later
// Radar de estilo (OG-470, RN-RAD-01): eixos, rótulos, unidades e a geometria do SVG, sem React.

/** Ordem fixa: Abates no alto, duelo à direita, bandeira embaixo, time à esquerda. */
export const STYLE_AXES = ['kills', 'accuracy', 'survival', 'flag', 'defense', 'team'] as const;
export type StyleAxis = (typeof STYLE_AXES)[number];
export type Archetype = 'shooter' | 'runner' | 'wall' | 'support' | 'survivor' | 'joker';

/** Um eixo como a API devolve (OG-469). */
export interface StyleAxisValue {
  readonly axis: StyleAxis;
  readonly percentile: number;
  readonly value: number;
}

/** Radar de um período como a API devolve; `axes` null = sem radar (RN-RAD-03). */
export interface StyleRadarData {
  readonly games: number;
  readonly lowSample: boolean;
  readonly axes: readonly StyleAxisValue[] | null;
  readonly archetype: Archetype | null;
  readonly population: number;
}

/** Chaves do `t()` (inglês; pt-BR em `@outgun/i18n`). */
export const AXIS_LABELS: Record<StyleAxis, string> = {
  kills: 'Killing',
  accuracy: 'Accuracy',
  survival: 'Survival',
  flag: 'Flag',
  defense: 'Defense',
  team: 'Teamwork',
};

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  shooter: 'Shooter',
  runner: 'Runner',
  wall: 'Wall',
  support: 'Support',
  survivor: 'Survivor',
  joker: 'Joker',
};

/** Valor bruto na unidade do eixo: por 10 min, porcentagem ou tempo médio de vida. */
export function axisValueText(axis: StyleAxis, value: number, locale = 'pt-BR'): string {
  if (axis === 'accuracy') return `${Math.round(value * 100)}%`;
  if (axis === 'survival') {
    const s = Math.round(value);
    return s >= 60 ? `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  }
  return `${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10 min`;
}

/** Ângulo do eixo i em graus (tela, y para baixo): o primeiro no alto e os outros a cada 60°. */
export function axisAngle(i: number): number {
  return -90 + (360 / STYLE_AXES.length) * i;
}

/** Ponto do eixo i com percentil v (0–100) num radar de raio r centrado em (cx, cy). */
export function radarPoint(i: number, v: number, r: number, cx: number, cy: number): { x: number; y: number } {
  const a = (axisAngle(i) * Math.PI) / 180;
  const d = (Math.max(0, Math.min(100, v)) / 100) * r;
  return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) };
}

/** Polígono (atributo `points`) dos percentis na ordem fixa; eixo ausente = 0. */
export function radarPolygon(axes: readonly StyleAxisValue[], r: number, cx: number, cy: number): string {
  return STYLE_AXES.map((axis, i) => {
    const p = radarPoint(i, axes.find((a) => a.axis === axis)?.percentile ?? 0, r, cx, cy);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ');
}
