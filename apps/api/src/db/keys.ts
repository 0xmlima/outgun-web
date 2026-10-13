// SPDX-License-Identifier: GPL-2.0-or-later
// Formas normalizadas usadas nas colunas *_key (unicidade). Nomes: comparableName (OG-082, spec
// plan/specs/names.md) = makeComparable do original com acentos dobrados.
import { comparableName } from '@outgun/protocol';

export function usernameKey(name: string): string {
  return comparableName(name);
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}
