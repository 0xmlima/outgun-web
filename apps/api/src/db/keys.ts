// SPDX-License-Identifier: GPL-2.0-or-later
// Formas normalizadas usadas nas colunas *_key (unicidade). Nomes: comparableName (OG-082, spec
// plan/specs/names.md) = makeComparable do original com acentos dobrados.
import { comparableName, foldAccents } from '@outgun/protocol';

export function usernameKey(name: string): string {
  return comparableName(name);
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export const ACCENTED = 'áàâãäåéèêëíìîïóòôõöúùûüýÿçñ';
export const PLAIN = 'aaaaaaeeeeiiiiooooouuuuyycn';
/** Minúsculas sem acento (o mesmo `translate` do SQL da busca por clã). */
export function fold(text: string): string {
  return [...text.toLowerCase()].map((c) => PLAIN[ACCENTED.indexOf(c)] ?? c).join('');
}

/** Nome e tag de clã: únicos sem diferença de maiúsculas e acentos (D-47). */
export function clanKey(text: string): string {
  return foldAccents(text.trim()).toLowerCase();
}
