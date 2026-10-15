// SPDX-License-Identifier: GPL-2.0-or-later
// Formatos e séries do Ranked (OG-250, RN-RKL-01..03, D-41): atributos da sala sobre o mesmo preset
// travado. A série só agrupa jogos; cada jogo é uma ranqueada normal.

export const RANKED_FORMATS = ['3x3', '4x4', '5x5'] as const;
export type RankedFormat = (typeof RANKED_FORMATS)[number];

export const SERIES_LENGTHS = [1, 3, 5] as const;
export type SeriesBestOf = (typeof SERIES_LENGTHS)[number];

export interface RankedRoomFormat {
  format: RankedFormat;
  bestOf: SeriesBestOf;
}

export function isRankedFormat(value: unknown): value is RankedFormat {
  return typeof value === 'string' && (RANKED_FORMATS as readonly string[]).includes(value);
}

export function isSeriesBestOf(value: unknown): value is SeriesBestOf {
  return typeof value === 'number' && (SERIES_LENGTHS as readonly number[]).includes(value);
}

/** Jogadores por time (N do NxN). */
export function formatTeamSize(format: RankedFormat): number {
  return Number(format[0]);
}

/** Tamanho da sala: 2 × N (RN-RKL-01). */
export function formatPlayers(format: RankedFormat): number {
  return 2 * formatTeamSize(format);
}

/** Vitórias para levar a série: ⌈N/2⌉ (RN-RKL-02). */
export function seriesWinsNeeded(bestOf: SeriesBestOf): number {
  return Math.ceil(bestOf / 2);
}

/** Placar de uma série, por lado (0 = vermelho, 1 = azul). */
export interface SeriesScore {
  bestOf: SeriesBestOf;
  /** Jogos disputados (empates contam como jogo, sem ponto para ninguém). */
  games: number;
  wins: [number, number];
}

export function newSeries(bestOf: SeriesBestOf): SeriesScore {
  return { bestOf, games: 0, wins: [0, 0] };
}

/** Acaba quando um lado tem a maioria ou depois de N jogos (empates incluídos). */
export function seriesOver(s: SeriesScore): boolean {
  const need = seriesWinsNeeded(s.bestOf);
  return s.wins[0] >= need || s.wins[1] >= need || s.games >= s.bestOf;
}

/** Vencedor da série encerrada (null = em andamento ou empatada depois de N jogos). */
export function seriesWinner(s: SeriesScore): 0 | 1 | null {
  if (!seriesOver(s) || s.wins[0] === s.wins[1]) return null;
  return s.wins[0] > s.wins[1] ? 0 : 1;
}

/** Soma um jogo (`winner` null = empate). Série já encerrada não muda. */
export function recordSeriesGame(s: SeriesScore, winner: 0 | 1 | null): SeriesScore {
  if (seriesOver(s)) return s;
  const wins: [number, number] = [s.wins[0], s.wins[1]];
  if (winner !== null) wins[winner]++;
  return { bestOf: s.bestOf, games: s.games + 1, wins };
}
