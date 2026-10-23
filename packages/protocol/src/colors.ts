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
