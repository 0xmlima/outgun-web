// SPDX-License-Identifier: GPL-2.0-or-later
// Dono do canvas do jogo. O React só monta o elemento e desenha overlays por cima; o desenho e o
// laço de quadros ficam aqui (o renderer PixiJS entra no OG-061, a conexão no OG-064).
import { ROOM_HEIGHT, ROOM_WIDTH } from '@outgun/content';

export interface GameHost {
  /** Para o laço e solta o canvas. */
  destroy(): void;
}

/** Proporção da área de jogo do original (472×354). */
export const PLAYFIELD_ASPECT = ROOM_WIDTH / ROOM_HEIGHT;

export function mountGame(canvas: HTMLCanvasElement): GameHost {
  const ctx = canvas.getContext('2d');
  let frame = 0;

  const resize = () => {
    const ratio = devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
  };

  const draw = () => {
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = '#000015';
    ctx.fillRect(0, 0, width, height);
    // Área de jogo centralizada com a proporção do original, até o renderer existir.
    const w = Math.min(width, height * PLAYFIELD_ASPECT);
    const h = w / PLAYFIELD_ASPECT;
    ctx.strokeStyle = '#4040b0';
    ctx.lineWidth = Math.max(1, devicePixelRatio);
    ctx.strokeRect((width - w) / 2 + 0.5, (height - h) / 2 + 0.5, w - 1, h - 1);
    frame = requestAnimationFrame(draw);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  frame = requestAnimationFrame(draw);

  return {
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
