// SPDX-License-Identifier: GPL-2.0-or-later
// Cores pessoais (RN-TIM-05, OG-411, D-79): as 16 do original, mais 16 da paleta aprovada pelo PO
// (prancha `plan/specs/og-411-prancha-cores.png`) e as medalhas do top 3 do "Melhor do mês" do
// mês anterior, que só quem as ganhou usa. O índice viaja no protocolo; a cor de cada índice vem
// do tema (`player01`..`player32`, `medal_*`), com o padrão abaixo para o que o tema não define.

/** Cores da paleta comum (0..31): sem repetir dentro do time. */
export const PERSONAL_COLORS = 32;
/** Medalhas: 32 ouro (1º), 33 prata (2º), 34 bronze (3º). */
export const MEDAL_COLORS = [32, 33, 34] as const;
export const ALL_COLORS = 35;
/** Sem cor (time cheio de cores ocupadas, `fav_colors` do original). */
export const NO_COLOR = 255;

export const isMedalColor = (color: number) => color >= PERSONAL_COLORS && color < ALL_COLORS;
/** Índice da cor da medalha de quem ficou em `position` (1..3). */
export const medalColor = (position: number) => MEDAL_COLORS[position - 1];

/** Chave da cor no tema. */
export function colourKey(color: number): string {
  if (color < PERSONAL_COLORS) return `player${String(color + 1).padStart(2, '0')}`;
  return ['medal_gold', 'medal_silver', 'medal_bronze'][color - PERSONAL_COLORS] ?? 'player_unknown';
}

/** Padrão das cores novas (os temas do original só definem `player01`..`player16`). */
export const EXTRA_COLOUR_DEFAULTS: Readonly<Record<string, string>> = {
  player17: '#262626', // grafite
  player18: '#FFA6C9', // rosa
  player19: '#9DA8FF', // lavanda
  player20: '#C2185B', // framboesa
  player21: '#8DB600', // abacate
  player22: '#A8FFC8', // menta
  player23: '#00A86B', // jade
  player24: '#FFCBA4', // pêssego
  player25: '#4682B4', // azul-aço
  player26: '#FFF3C4', // creme
  player27: '#4A5D23', // verde-musgo
  player28: '#8ECDF0', // azul-céu
  player29: '#B8962E', // mostarda
  player30: '#E0B0FF', // lilás
  player31: '#01796F', // pinho
  player32: '#C000C0', // fúcsia
  medal_gold: '#FFD700',
  medal_silver: '#D9D9D9',
  medal_bronze: '#CD7F32',
};

/**
 * Cores de time que um clã pode escolher (OG-407, RN-CLA-09): legíveis no boneco, na bandeira e na
 * base sobre os fundos dos temas. A chave dá o nome traduzido no cliente.
 */
export const CLAN_COLORS: Readonly<Record<string, string>> = {
  red: '#E02828',
  orange: '#F07800',
  yellow: '#F2C200',
  gold: '#B8932A',
  lime: '#7CC400',
  green: '#1E9E3A',
  teal: '#0FA89A',
  cyan: '#00AEDB',
  blue: '#2050E0',
  navy: '#1E2F80',
  purple: '#7A2BC0',
  magenta: '#C0189E',
  pink: '#F25AA8',
  wine: '#8A1E3C',
  brown: '#80542A',
  black: '#303030',
  white: '#E6E6E6',
  silver: '#8E98A6',
};
/** Cores padrão dos lados (vermelho e azul do tema de fábrica). */
export const DEFAULT_TEAM_COLOURS = ['#FF0000', '#0000FF'] as const;
/** Abaixo disto (CIEDE2000), duas cores de time se confundem na partida (D-78). */
export const TEAM_COLOUR_MIN_DISTANCE = 22;

function lab(hex: string): [number, number, number] {
  const lin = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const [r, g, b] = [1, 3, 5].map((i) => lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Diferença percebida entre duas cores `#RRGGBB` (CIEDE2000). */
export function colourDistance(a: string, b: string): number {
  const [L1, a1, b1] = lab(a);
  const [L2, a2, b2] = lab(b);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1 = (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2 = (Math.atan2(b2, a2p) / rad + 360) % 360;
  let dh = C1p * C2p === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = C2p - C1p;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  const hm = C1p * C2p === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + 360) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** Problema do par de cores do clã: fora da paleta, ou primária e secundária parecidas demais. */
export function clanColoursProblem(primary: string, secondary: string): 'unknown_color' | 'too_similar' | null {
  const known = new Set(Object.values(CLAN_COLORS));
  if (!known.has(primary) || !known.has(secondary)) return 'unknown_color';
  return colourDistance(primary, secondary) < TEAM_COLOUR_MIN_DISTANCE ? 'too_similar' : null;
}
