// SPDX-License-Identifier: GPL-2.0-or-later
// Uso: pnpm parity [--report ARQUIVO.md]   (sai com erro se algum trace coberto divergir)
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parityReport, reportMarkdown } from './report.js';

const rows = parityReport();
const markdown = reportMarkdown(rows);
console.log(markdown);
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : undefined;
if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, markdown);
}
// No GitHub Actions o relatório aparece no resumo da execução.
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
const failed = rows.filter((r) => r.status === 'divergência' || r.status === 'sem cobertura');
process.exit(failed.length > 0 ? 1 : 0);
