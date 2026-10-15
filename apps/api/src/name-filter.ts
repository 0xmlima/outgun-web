// SPDX-License-Identifier: GPL-2.0-or-later
// Filtro de nomes proibidos (OG-275, RN-CLA-08): lista em NAME_FILTER (palavras separadas por
// vírgula). Compara sem maiúsculas, acentos, espaços nem pontuação, e acha a palavra dentro do nome
// ("xXpalavraXx" também cai).
import { foldAccents } from '@outgun/protocol';

const compact = (text: string) => foldAccents(text).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lista normalizada para `nameBlocked`. */
export function parseNameFilter(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map(compact)
    .filter((w) => w.length > 0);
}

export function nameBlocked(text: string, words: readonly string[]): boolean {
  if (words.length === 0) return false;
  const c = compact(text);
  return words.some((w) => c.includes(w));
}
