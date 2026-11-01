// SPDX-License-Identifier: GPL-2.0-or-later
// Estilos do número do jogador (OG-413, prancha `plan/specs/og-413-prancha-numeros.png`): Bloco,
// Corrida, Contorno e Estêncil, com contraste automático (número escuro sobre cor pessoal clara,
// branco sobre escura). As fontes estão em `number-fonts.css`; o desenho é o mesmo na partida e na
// prévia da Conta.
import './number-fonts.css';

export interface NumberStyle {
  readonly id: 'block' | 'race' | 'outline' | 'stencil';
  readonly label: string;
  readonly font: string;
  /** Inclinação (como o itálico das placas da F1). */
  readonly skew: number;
  /** Só o traço (sem preenchimento). */
  readonly outline: boolean;
}

export const NUMBER_STYLES: readonly NumberStyle[] = [
  { id: 'block', label: 'Block', font: 'og-bloco', skew: 0, outline: false },
  { id: 'race', label: 'Race', font: 'og-corrida', skew: -0.22, outline: false },
  { id: 'outline', label: 'Outline', font: 'og-contorno', skew: 0, outline: true },
  { id: 'stencil', label: 'Stencil', font: 'og-estencil', skew: 0, outline: false },
];

/** Carrega as 4 fontes (o canvas não espera a fonte sozinho); falhar só deixa a fonte padrão. */
export function loadNumberFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all(NUMBER_STYLES.map((s) => document.fonts.load(`32px ${s.font}`))).catch(() => undefined);
}

/** `hex` com o brilho multiplicado por `1 - amount`. */
export function darken(hex: string, amount: number): string {
  const v = [1, 3, 5].map((i) => Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * (1 - amount)));
  return `#${v.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Cor pessoal clara (número escuro por cima). */
export function lightColour(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
}

/**
 * Desenha `text` centrado em (0, 0) do `ctx` com altura de letra `size`. `light` = a cor por baixo é
 * clara. Igual à prancha aprovada pelo PO. Com `medal` (cor da medalha do pódio, OG-532), a letra
 * sai metálica (brilho branco no alto, como a medalha do OG-411) com contorno escuro, sobre qualquer cor.
 */
export function paintNumber(ctx: CanvasRenderingContext2D, text: string, style: NumberStyle, light: boolean, size: number, medal?: string): void {
  const k = size / 17; // a prancha usa letra de 17 px num boneco de raio 15
  let ink: string | CanvasGradient = light ? '#111111' : '#FFFFFF';
  const edge = medal ? '#000000' : light ? '#FFFFFF' : '#000000';
  if (medal) {
    // metálico: reflexo claro no alto, a cor no meio e um tom escuro embaixo (a prata não vira branco)
    const g = ctx.createLinearGradient(0, k - size / 2, 0, k + size / 2);
    g.addColorStop(0.1, '#FFFFFF');
    g.addColorStop(0.45, medal);
    g.addColorStop(0.95, darken(medal, 0.45));
    ink = g;
  }
  ctx.save();
  ctx.transform(1, 0, style.skew, 1, 0, 0);
  ctx.font = `${Math.round(size)}px ${style.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (style.outline) {
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = edge;
    ctx.strokeText(text, 0, k);
    ctx.lineWidth = 1.5 * k;
    ctx.strokeStyle = ink;
    ctx.strokeText(text, 0, k);
  } else {
    ctx.lineWidth = 2.5 * k;
    ctx.strokeStyle = edge;
    ctx.strokeText(text, 0, k);
    ctx.fillStyle = ink;
    ctx.fillText(text, 0, k);
  }
  ctx.restore();
}

/** Lado do quadrado (em unidades da letra) que cabe o número com o contorno: a textura usa isso. */
export const NUMBER_BOX = 2.2;
