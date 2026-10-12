// SPDX-License-Identifier: GPL-2.0-or-later
// Paridade da simulação TS com os golden traces, conforme a tabela de cobertura (OG-100).
import { describe, expect, it } from 'vitest';
import { COVERAGE, listTraces, parityReport } from './index.js';

describe('paridade da sim TS com o original', () => {
  const rows = parityReport();

  it('todo trace gravado está na tabela de cobertura', () => {
    expect(listTraces().filter((t) => !COVERAGE.some((c) => c.trace === t))).toEqual([]);
  });

  for (const row of rows.filter((r) => r.status !== 'pendente' && r.status !== 'externo')) {
    it(`${row.trace} (${row.card})`, () => {
      expect(row.status, row.detail).toBe('ok');
    });
  }
});
