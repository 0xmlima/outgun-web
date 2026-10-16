// SPDX-License-Identifier: GPL-2.0-or-later
// Texto do HUD Moderno e do Personalizado em Inter (D-35, D-55). Cada tamanho vira uma fonte bitmap
// instalada no tamanho final, desenhada sem escala (lição do OG-205: o atlas dinâmico mede numa base de
// 100 px; a altura e as larguras daqui já convertem para o tamanho de verdade).
import { BitmapFontManager, type BitmapFont } from 'pixi.js';
import { registerFontSize } from '../render/draw-list.js';
import type { FontMetrics } from './screen-layout.js';

export type FaceWeight = 500 | 600 | 800;

const FAMILY = ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'];
/** ASCII, Latin-1 (pt-BR, fi, it) e a pontuação tipográfica que o chat pode trazer. */
const CHARS: (string | string[])[] = [[' ', '~'], ['¡', 'ÿ'], '…–—•·'];

/** Espera a Inter (servida pelo site, `ui/tokens.css`) antes de instalar qualquer atlas; sem ela, cai numa sem serifa. */
export async function loadInter(): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  try {
    await Promise.all(([500, 600, 800] as const).map((w) => document.fonts.load(`${w} 16px Inter`)));
    return document.fonts.check('500 16px Inter');
  } catch {
    return false;
  }
}

export class HudFace implements FontMetrics {
  readonly height: number;
  private readonly k: number;
  constructor(
    readonly name: string,
    private readonly font: BitmapFont,
    readonly size: number,
  ) {
    this.k = size / font.baseMeasurementFontSize;
    this.height = Math.round(font.lineHeight * this.k);
    registerFontSize(name, size);
  }
  width(text: string): number {
    let w = 0;
    for (const ch of text) w += this.font.chars[ch]?.xAdvance ?? this.font.chars['?']?.xAdvance ?? 0;
    return w * this.k;
  }
}

/** Fontes por peso e tamanho (px inteiros), instaladas na primeira vez que o HUD pede. */
export class HudFaces {
  private readonly faces = new Map<string, HudFace>();
  constructor(private readonly resolution: number) {}

  get(weight: FaceWeight, px: number): HudFace {
    const size = Math.max(6, Math.round(px));
    const name = `hud-inter-${weight}-${size}`;
    let face = this.faces.get(name);
    if (!face) {
      const font = BitmapFontManager.install({
        name,
        style: { fontFamily: FAMILY, fontWeight: String(weight) as '500' | '600' | '800', fontSize: size, fill: '#ffffff' },
        chars: CHARS,
        resolution: this.resolution,
      });
      face = new HudFace(name, font, size);
      this.faces.set(name, face);
    }
    return face;
  }

  destroy(): void {
    for (const name of this.faces.keys()) BitmapFontManager.uninstall(name);
    this.faces.clear();
  }
}
