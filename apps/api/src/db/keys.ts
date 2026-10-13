// SPDX-License-Identifier: GPL-2.0-or-later
// Formas normalizadas usadas nas colunas *_key (unicidade sem diferenciar maiúsculas).
// O OG-082 refina a comparação de nomes (makeComparable do original).

export function usernameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase();
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}
