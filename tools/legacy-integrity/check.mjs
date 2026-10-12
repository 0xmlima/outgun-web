// SPDX-License-Identifier: GPL-2.0-or-later
// Garante que os arquivos do Outgun original (referência do port) não foram alterados nem removidos.
// Uso: pnpm check:legacy
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const manifest = readFileSync(join(here, 'checksums.sha256'), 'utf8');

const problems = [];
let checked = 0;
for (const line of manifest.split('\n')) {
  if (!line.trim()) continue;
  const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
  if (!match) {
    problems.push(`linha inválida no manifesto: ${line}`);
    continue;
  }
  const [, expected, file] = match;
  let actual;
  try {
    actual = createHash('sha256')
      .update(readFileSync(join(repoRoot, file)))
      .digest('hex');
  } catch {
    problems.push(`removido: ${file}`);
    continue;
  }
  if (actual !== expected) problems.push(`alterado: ${file}`);
  checked++;
}

if (problems.length > 0) {
  console.error('Arquivos do Outgun original foram modificados (devem ficar intocados):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`OK: ${checked} arquivos do Outgun original intactos.`);
