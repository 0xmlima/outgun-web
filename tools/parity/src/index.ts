// SPDX-License-Identifier: GPL-2.0-or-later
export * from './compare.js';
export * from './run.js';
export * from './trace.js';

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pasta dos golden traces versionados (tools/parity/traces). */
export const TRACES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'traces');

/** Nomes dos traces disponíveis (sem extensão). */
export function listTraces(): string[] {
  return readdirSync(TRACES_DIR)
    .filter((name) => name.endsWith('.jsonl.gz'))
    .map((name) => name.replace(/\.jsonl\.gz$/, ''))
    .sort();
}
export * from './sim-adapter.js';
export * from './coverage.js';
export * from './report.js';
