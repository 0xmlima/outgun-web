// SPDX-License-Identifier: GPL-2.0-or-later
// Prévia do HUD Moderno e do Personalizado para o editor (OG-300): uma cena fixa desenhada em canvas 2D,
// com as cores do tema padrão, sem PixiJS (a tela do editor não baixa o jogo).
import type { Rect } from '../render/layout.js';
import { HUD_COMPONENTS, type HudComponent } from './hud-style.js';
import type { Place, Places } from './modern-layout.js';

const C = {
  ground: '#104000',
  wall: '#30c000',
  red: '#ff0000',
  redL: '#ff5544',
  redD: '#660000',
  blue: '#0000ff',
  blueL: '#4455ff',
  blueD: '#000066',
  pole: '#ffff00',
  health: ['#ff0000', '#ffff00', '#ff00ff'],
  energy: ['#0000ff', '#00ff00', '#7d64ff'],
  pups: ['#00ffff', '#ffff00', '#ff00ff'],
  weapon: ['#00ff00', '#0000ff', '#ff0000', '#ffff00'],
  info: '#33dd55',
};
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const RW = 472;
const RH = 354;

/** Textos da prévia já traduzidos. */
export interface PreviewTexts {
  readonly health: string;
  readonly energy: string;
  readonly weapon: string;
  readonly pups: readonly [string, string, string];
  readonly chat: readonly { who?: string; team?: 0 | 1; text: string }[];
}

const WALLS = [
  [0, 0, 196, 12],
  [276, 0, 196, 12],
  [0, 342, 150, 12],
  [230, 342, 242, 12],
  [0, 0, 12, 137],
  [0, 217, 12, 137],
  [460, 0, 12, 354],
  [150, 110, 64, 40],
  [296, 206, 80, 30],
  [92, 250, 12, 60],
];
const PLAYERS = [
  { x: 118, y: 196, team: 0, col: '#ffff00' },
  { x: 252, y: 86, team: 0, col: '#00ffff' },
  { x: 360, y: 160, team: 1, col: '#ff8800' },
  { x: 404, y: 292, team: 1, col: '#ffffff' },
];

function text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left'): number {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(t, x, y);
  return ctx.measureText(t).width;
}

function room(ctx: CanvasRenderingContext2D, r: Rect): void {
  const m = r.w / RW;
  ctx.fillStyle = C.ground;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = C.wall;
  for (const [x, y, w, h] of WALLS) ctx.fillRect(r.x + x! * m, r.y + y! * m, w! * m, h! * m);
  for (const p of PLAYERS) {
    const cx = r.x + p.x * m;
    const cy = r.y + p.y * m;
    ctx.beginPath();
    ctx.arc(cx, cy, 15 * m, 0, 7);
    ctx.fillStyle = p.team ? C.blue : C.red;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 11 * m, 0, 7);
    ctx.fillStyle = p.col;
    ctx.fill();
  }
}

function minimap(ctx: CanvasRenderingContext2D, p: Place): void {
  const n = 6;
  let w = p.w;
  let h = (p.w * RH) / RW;
  if (h > p.h) [h, w] = [p.h, (p.h * RW) / RH];
  const x0 = p.x + (p.w - w) / 2;
  const y0 = p.y + (p.h - h) / 2;
  const cw = w / n;
  const ch = h / n;
  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = C.redD;
  ctx.fillRect(x0 + cw, y0 + ch, cw, ch);
  ctx.fillStyle = '#2d2d8a';
  ctx.fillRect(x0 + 4 * cw, y0 + 4 * ch, cw, ch);
  const ww = Math.max(1.5, cw * 0.08);
  ctx.fillStyle = '#2f9e2f';
  ctx.fillRect(x0, y0, w, ww);
  ctx.fillRect(x0, y0 + h - ww, w, ww);
  ctx.fillRect(x0, y0, ww, h);
  ctx.fillRect(x0 + w - ww, y0, ww, h);
  for (let i = 1; i < n; i++)
    for (let j = 1; j < n; j++) {
      const a = cw * 0.22;
      ctx.fillRect(x0 + i * cw - a, y0 + j * ch - ww / 2, 2 * a, ww);
      ctx.fillRect(x0 + i * cw - ww / 2, y0 + j * ch - a, ww, 2 * a);
    }
}

function bar(ctx: CanvasRenderingContext2D, p: Place, label: string, value: number, cols: readonly string[]): void {
  const top = 18 * p.s;
  text(ctx, label.toUpperCase(), p.x, p.y + top - 13 * p.s, 10 * p.s, 600, '#aaaaaa');
  text(ctx, String(value), p.x + p.w, p.y + top - 18 * p.s, 16 * p.s, 800, '#ffffff', 'right');
  const by = p.y + top + 2 * p.s;
  const bh = p.y + p.h - by;
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(p.x, by, p.w, bh);
  cols.forEach((c, i) => {
    const f = Math.min(Math.max(value - 100 * i, 0), 100) / 100;
    if (f <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect(p.x, by, p.w * f, bh);
  });
}

const DRAW: Record<HudComponent, (ctx: CanvasRenderingContext2D, p: Place, t: PreviewTexts) => void> = {
  score(ctx, p) {
    const cw = p.w * 0.32;
    const side = (p.w - cw) / 2;
    ctx.fillStyle = C.redD;
    ctx.fillRect(p.x, p.y, side, p.h);
    ctx.fillStyle = C.blueD;
    ctx.fillRect(p.x + side + cw, p.y, side, p.h);
    ctx.fillStyle = C.red;
    ctx.fillRect(p.x, p.y, side, Math.max(2, 3 * p.s));
    ctx.fillStyle = C.blue;
    ctx.fillRect(p.x + side + cw, p.y, side, Math.max(2, 3 * p.s));
    const big = p.h * 0.62;
    text(ctx, '2', p.x + side / 2, p.y + (p.h - big * 1.2) / 2, big, 800, '#ffffff', 'center');
    text(ctx, '1', p.x + side + cw + side / 2, p.y + (p.h - big * 1.2) / 2, big, 800, '#ffffff', 'center');
    text(ctx, '7:42', p.x + p.w / 2, p.y + (p.h - p.h * 0.5) / 2, p.h * 0.42, 600, '#33ff33', 'center');
  },
  minimap,
  health: (ctx, p, t) => bar(ctx, p, t.health, 132, C.health),
  energy: (ctx, p, t) => bar(ctx, p, t.energy, 86, C.energy),
  powerups(ctx, p, t) {
    const gap = 5 * p.s;
    const w = (p.w - 3 * gap) / 4;
    const items: [string, string, boolean, string][] = [
      [t.pups[0], '\u2014', false, C.pups[0]!],
      [t.pups[1], '23', true, C.pups[1]!],
      [t.pups[2], '\u2014', false, C.pups[2]!],
      [t.weapon, '2', true, C.weapon[1]!],
    ];
    items.forEach(([name, value, on, col], i) => {
      const x = p.x + i * (w + gap);
      ctx.fillStyle = on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)';
      ctx.fillRect(x, p.y, w, p.h);
      ctx.strokeStyle = on ? col : '#2b2b2b';
      ctx.lineWidth = Math.max(1, 1.5 * p.s);
      ctx.strokeRect(x + 0.75, p.y + 0.75, w - 1.5, p.h - 1.5);
      text(ctx, name.toUpperCase(), x + w / 2, p.y + 5 * p.s, 9.5 * p.s, 600, on ? col : '#666666', 'center');
      text(ctx, value, x + w / 2, p.y + p.h - 23 * p.s, 16 * p.s, 800, on ? '#ffffff' : '#555555', 'center');
    });
  },
  chat(ctx, p, t) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    const lh = Math.round(20 * p.s);
    t.chat.forEach((m, i) => {
      const y = p.y + i * lh + 3 * p.s;
      if (m.who) {
        const w = text(ctx, `${m.who}: `, p.x, y, 13 * p.s, 700, m.team ? C.blueL : C.redL);
        text(ctx, m.text, p.x + w, y, 13 * p.s, 500, '#eeeeee');
      } else text(ctx, m.text, p.x, y, 13 * p.s, 500, C.info);
    });
    ctx.restore();
  },
  fps(ctx, p) {
    text(ctx, 'FPS: 60', p.x + p.w, p.y + p.h - 14 * p.s, 11 * p.s, 600, '#5a5a5a', 'right');
  },
};

/** Desenha a cena: fundo preto, a sala e cada componente no seu lugar. */
export function drawPreview(ctx: CanvasRenderingContext2D, W: number, H: number, r: Rect, places: Places, t: PreviewTexts): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  room(ctx, r);
  for (const id of HUD_COMPONENTS) {
    const p = places[id];
    if (p) DRAW[id](ctx, p, t);
  }
}
