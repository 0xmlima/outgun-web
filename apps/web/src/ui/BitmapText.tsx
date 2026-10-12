// SPDX-License-Identifier: GPL-2.0-or-later
// Texto desenhado com as fontes bitmap do original, em escala inteira (`--px`) e sem suavização. O
// texto real fica num <span> visualmente oculto para leitores de tela e busca na página.
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { FALLBACK_CHAR, glyphFor, measureText } from './bitmap-font.js';
import { useMenuFont, type LoadedFont } from './fonts.js';

const tinted = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

/** Atlas da fonte pintado com `color` (os glifos convertidos são brancos sobre transparente). */
function tintedAtlas(font: LoadedFont, color: string): HTMLCanvasElement {
  let byColor = tinted.get(font.image);
  if (!byColor) tinted.set(font.image, (byColor = new Map()));
  let atlas = byColor.get(color);
  if (!atlas) {
    atlas = document.createElement('canvas');
    atlas.width = font.image.width;
    atlas.height = font.image.height;
    const ctx = atlas.getContext('2d');
    if (ctx) {
      ctx.drawImage(font.image, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, atlas.width, atlas.height);
    }
    byColor.set(color, atlas);
  }
  return atlas;
}

function cssColor(el: Element): string {
  return getComputedStyle(el).color || '#fff';
}

export function BitmapText({ text, className }: { text: string; className?: string }) {
  const font = useMenuFont();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = font ? Math.max(1, measureText(font.data, text)) : 0;
  const height = font?.data.lineHeight ?? 0;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !font) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const atlas = tintedAtlas(font, cssColor(canvas));
    let x = 0;
    for (const ch of text) {
      const g = glyphFor(font.data, ch.codePointAt(0) ?? FALLBACK_CHAR);
      if (!g) continue;
      if (g.width > 0 && g.height > 0)
        ctx.drawImage(atlas, g.x, g.y, g.width, g.height, x + g.xoffset, g.yoffset, g.width, g.height);
      x += g.xadvance;
    }
  });

  if (!font) return <span className={`btext btext-css ${className ?? ''}`}>{text}</span>;
  const style = { '--w': width, '--h': height } as CSSProperties;
  return (
    <span className={`btext ${className ?? ''}`}>
      <canvas ref={canvasRef} width={width} height={height} style={style} aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
