// SPDX-License-Identifier: GPL-2.0-or-later
// Cartão do estilo para compartilhar (OG-478): PNG quadrado com o radar, o arquétipo, o nick, o clã
// (tag, nome e cor) e a temporada; também a comparação jogador x jogador (OG-472). Cores fixas,
// iguais no tema claro e no escuro.
import { axisAngle, radarPoint, STYLE_AXES, type StyleAxisValue } from './style-radar.js';

export interface CardSide {
  readonly name: string;
  readonly clan?: { readonly tag: string; readonly name: string; readonly color: string | null } | null | undefined;
  /** Texto do arquétipo já traduzido; null sem radar. */
  readonly archetype: string | null;
  readonly axes: readonly StyleAxisValue[];
}

export interface CardTexts {
  /** Rótulos dos eixos, na ordem de STYLE_AXES. */
  readonly axes: readonly string[];
  /** Temporada (ou "Sempre") e formato. */
  readonly period: string;
  /** Endereço do jogo no rodapé. */
  readonly site: string;
}

const BG = '#0b1020';
const PANEL = '#121a2b';
const RING = '#2e3d58';
const TEXT = '#eef2f8';
const MUTED = '#a3b0c4';
const COLORS = ['#7fa8ff', '#ff7a7a'];

export const CARD_SIZE = 1080;

export function styleCard(sides: readonly CardSide[], texts: CardTexts): HTMLCanvasElement {
  const S = CARD_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const font = (px: number, weight = 700) => `${weight} ${px}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = PANEL;
  ctx.fillRect(40, 40, S - 80, S - 80);
  ctx.textBaseline = 'middle';

  // cabeçalho: um lado (nick, clã e arquétipo) ou os dois, frente a frente
  const colorOf = (i: number) => (sides.length === 1 ? (sides[0]!.clan?.color ?? COLORS[0]!) : COLORS[i]!);
  sides.slice(0, 2).forEach((s, i) => {
    const two = sides.length > 1;
    const x = two ? (i === 0 ? 90 : S - 90) : S / 2;
    ctx.textAlign = two ? (i === 0 ? 'left' : 'right') : 'center';
    ctx.fillStyle = colorOf(i);
    ctx.font = font(two ? 52 : 64);
    ctx.fillText(s.name, x, 120, two ? S / 2 - 120 : S - 160);
    ctx.font = font(30, 500);
    ctx.fillStyle = MUTED;
    const clan = s.clan ? `${s.clan.tag} · ${s.clan.name}` : '';
    ctx.fillText([clan, s.archetype].filter(Boolean).join('  ·  '), x, 178, two ? S / 2 - 120 : S - 160);
  });
  if (sides.length > 1) {
    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = font(44);
    ctx.fillText('×', S / 2, 120);
  }

  // radar: anéis, raios, rótulos e as séries
  const cx = S / 2;
  const cy = 570;
  const r = 280;
  const ring = (v: number, dashed: boolean) => {
    ctx.beginPath();
    STYLE_AXES.forEach((_, i) => {
      const p = radarPoint(i, v, r, cx, cy);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.setLineDash(dashed ? [10, 10] : []);
    ctx.strokeStyle = RING;
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  [25, 50, 75, 100].forEach((v) => ring(v, v === 50));
  ctx.setLineDash([]);
  STYLE_AXES.forEach((_, i) => {
    const p = radarPoint(i, 100, r, cx, cy);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = RING;
    ctx.stroke();
    const a = (axisAngle(i) * Math.PI) / 180;
    const cos = Math.cos(a);
    ctx.textAlign = Math.abs(cos) < 0.2 ? 'center' : cos > 0 ? 'left' : 'right';
    ctx.fillStyle = MUTED;
    ctx.font = font(30, 500);
    ctx.fillText(texts.axes[i] ?? '', cx + (r + 30) * cos, cy + (r + 30) * Math.sin(a));
  });
  sides.slice(0, 2).forEach((s, n) => {
    if (s.axes.length === 0) return;
    ctx.beginPath();
    STYLE_AXES.forEach((axis, i) => {
      const p = radarPoint(i, s.axes.find((x) => x.axis === axis)?.percentile ?? 0, r, cx, cy);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colorOf(n);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colorOf(n);
    ctx.lineWidth = 5;
    ctx.stroke();
  });

  // rodapé
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = font(30, 500);
  ctx.fillText(texts.period, S / 2, S - 130, S - 160);
  ctx.fillStyle = TEXT;
  ctx.font = font(34);
  ctx.fillText(texts.site, S / 2, S - 80, S - 160);
  return canvas;
}

/** Compartilha o PNG pela folha do sistema quando houver (celular); senão, baixa o arquivo. */
export async function shareCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) return;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
