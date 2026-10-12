// SPDX-License-Identifier: GPL-2.0-or-later
// Comparação campo a campo entre o estado do original e o da simulação TS.

export interface Difference {
  /** Caminho do campo, ex. `players[pid=0].vel[1]`. */
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface CompareOptions {
  /**
   * Tolerância absoluta para todos os números (padrão 1e-9). Campos inteiros (contadores, IDs)
   * diferem em pelo menos 1, então continuam exatos na prática.
   */
  tolerance?: number;
}

/** Arrays de entidades são comparados por chave, não por posição. */
const KEYS: Record<string, string> = { players: 'pid', rockets: 'id', powerups: 'id' };

function keyedPath(path: string, key: string, value: unknown): string {
  return `${path}[${key}=${String(value)}]`;
}

function numbersMatch(expected: number, actual: number, tolerance: number): boolean {
  return expected === actual || Math.abs(expected - actual) <= tolerance;
}

function compareAt(
  path: string,
  field: string,
  expected: unknown,
  actual: unknown,
  tolerance: number,
): Difference | undefined {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return numbersMatch(expected, actual, tolerance) ? undefined : { path, expected, actual };
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const key = KEYS[field];
    if (key) {
      const byKey = (items: unknown[]) =>
        new Map(items.map((item) => [(item as Record<string, unknown>)[key], item]));
      const exp = byKey(expected);
      const act = byKey(actual);
      for (const [k, item] of exp) {
        if (!act.has(k)) return { path: keyedPath(path, key, k), expected: item, actual: undefined };
        const diff = compareAt(keyedPath(path, key, k), '', item, act.get(k), tolerance);
        if (diff) return diff;
      }
      for (const [k, item] of act) {
        if (!exp.has(k)) return { path: keyedPath(path, key, k), expected: undefined, actual: item };
      }
      return undefined;
    }
    if (expected.length !== actual.length) {
      return { path: `${path}.length`, expected: expected.length, actual: actual.length };
    }
    for (let i = 0; i < expected.length; i++) {
      const diff = compareAt(`${path}[${i}]`, '', expected[i], actual[i], tolerance);
      if (diff) return diff;
    }
    return undefined;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    for (const name of Object.keys(e)) {
      const child = path ? `${path}.${name}` : name;
      if (!(name in a)) return { path: child, expected: e[name], actual: undefined };
      const diff = compareAt(child, name, e[name], a[name], tolerance);
      if (diff) return diff;
    }
    return undefined;
  }
  return Object.is(expected, actual) ? undefined : { path, expected, actual };
}

/**
 * Primeira diferença entre `expected` e `actual`, percorrendo os campos de `expected` em ordem.
 * Campos presentes só em `actual` são ignorados (a sim pode expor mais coisas), exceto entidades
 * extras em players/rockets/powerups.
 */
export function firstDifference(
  expected: unknown,
  actual: unknown,
  options: CompareOptions = {},
): Difference | undefined {
  return compareAt('', '', expected, actual, options.tolerance ?? 1e-9);
}
