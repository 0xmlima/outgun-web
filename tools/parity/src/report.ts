// SPDX-License-Identifier: GPL-2.0-or-later
// Relatório de paridade: roda os traces cobertos contra a sim TS e lista os pendentes.
import { join } from 'node:path';
import { COVERAGE } from './coverage.js';
import { listTraces, TRACES_DIR } from './index.js';
import { formatFailure, runParity } from './run.js';
import { SimTraceAdapter } from './sim-adapter.js';
import { loadTrace } from './trace.js';

export interface ReportRow {
  trace: string;
  card: string;
  status: 'ok' | 'divergência' | 'pendente' | 'externo' | 'sem cobertura';
  detail: string;
}

export function parityReport(): ReportRow[] {
  const rows: ReportRow[] = [];
  const known = new Set(COVERAGE.map((c) => c.trace));
  for (const entry of COVERAGE) {
    if (!entry.select || entry.modes.length === 0) {
      rows.push({ trace: entry.trace, card: entry.card, status: entry.external ? 'externo' : 'pendente', detail: entry.note ?? '' });
      continue;
    }
    const trace = loadTrace(join(TRACES_DIR, `${entry.trace}.jsonl.gz`));
    const details: string[] = [];
    let ok = true;
    for (const mode of entry.modes) {
      const result = runParity(trace, new SimTraceAdapter(), { mode, select: entry.select, checkRandCount: false });
      if (result.failure) {
        ok = false;
        details.push(`${mode}: ${formatFailure(entry.trace, result).replace(/\n\s*/g, ' | ')}`);
      } else details.push(`${mode}: ${result.framesChecked} frames`);
    }
    rows.push({ trace: entry.trace, card: entry.card, status: ok ? 'ok' : 'divergência', detail: details.join('; ') });
  }
  for (const name of listTraces()) {
    if (!known.has(name)) rows.push({ trace: name, card: '?', status: 'sem cobertura', detail: 'trace sem entrada em coverage.ts' });
  }
  return rows;
}

export function reportMarkdown(rows: ReportRow[]): string {
  const icon = { ok: '✅', divergência: '❌', pendente: '⏳', externo: '🔗', 'sem cobertura': '⚠️' } as const;
  const lines = [
    '## Paridade com o Outgun original',
    '',
    `${rows.filter((r) => r.status === 'ok').length} de ${rows.length} traces idênticos na sim; ${rows.filter((r) => r.status === 'externo').length} conferidos em outro pacote; ${rows.filter((r) => r.status === 'pendente').length} pendentes.`,
    '',
    '| Trace | Card | Status | Detalhe |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.trace} | ${r.card} | ${icon[r.status]} ${r.status} | ${r.detail.replace(/\|/g, '\\|')} |`),
  ];
  return `${lines.join('\n')}\n`;
}
