// SPDX-License-Identifier: GPL-2.0-or-later
// Emblema do clã como imagem (OG-489): o SVG do protocolo num canvas, para o PDF (OG-485), o chão
// da base (OG-486), o PNG para baixar e a imagem do confronto da série.
import { DEFAULT_EMBLEM, emblemSvg } from '@outgun/protocol';
import type { EmblemClan } from './Emblem.js';

/** SVG do emblema do clã (o padrão se nunca escolheu; neutro sem cores). */
export const clanEmblemSvg = (clan: EmblemClan) => emblemSvg(clan.emblem ?? DEFAULT_EMBLEM, clan.tag, clan.colors?.primary ?? null, clan.colors?.secondary ?? null);

/** Um SVG desenhado num canvas quadrado de `size` px. */
export async function svgCanvas(svg: string, size: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

/** "Baixar PNG" do emblema na página do clã, em 128 ou 512 px. */
export async function downloadEmblem(clan: EmblemClan, size: 128 | 512): Promise<void> {
  downloadCanvas(await svgCanvas(clanEmblemSvg(clan), size), `emblema-${clan.tag.toLowerCase()}-${size}.png`);
}

export interface MatchupSide {
  readonly clan: EmblemClan | null;
  /** Nome do clã, ou "Vermelho"/"Azul". */
  readonly label: string;
  readonly score: number;
}

/** Imagem do confronto (1200 × 630): os dois emblemas, os nomes e o placar da série. */
export async function matchupImage(red: MatchupSide, blue: MatchupSide, caption: string): Promise<HTMLCanvasElement> {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px: number) => `700 ${px}px Inter, system-ui, sans-serif`;
  const sides = [
    [red, W * 0.22],
    [blue, W * 0.78],
  ] as const;
  for (const [side, x] of sides) {
    if (side.clan) ctx.drawImage(await svgCanvas(clanEmblemSvg(side.clan), 300), x - 150, 110, 300, 300);
    ctx.fillStyle = '#eef2f8';
    ctx.font = font(side.label.length > 16 ? 34 : 44);
    ctx.fillText(side.label, x, 470, 420);
  }
  ctx.font = font(120);
  ctx.fillText(`${red.score} – ${blue.score}`, W / 2, 260);
  ctx.font = font(48);
  ctx.fillStyle = '#a3b0c4';
  ctx.fillText('×', W / 2, 380);
  ctx.font = font(30);
  ctx.fillText(caption, W / 2, 570, W - 80);
  return canvas;
}
