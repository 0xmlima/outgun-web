// SPDX-License-Identifier: GPL-2.0-or-later
// Valida mapas do Outgun com o parser do port (mesmas regras e mensagens do original).
// Uso: pnpm map:check [pasta ou arquivo...]   (padrão: maps cmaps)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMapFile } from '../../packages/content/dist/index.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const targets = process.argv.slice(2);
const inputs =
  targets.length > 0 ? targets : [join(repoRoot, '_legacy/maps'), join(repoRoot, '_legacy/cmaps')];

const files = inputs.flatMap((input) =>
  statSync(input).isDirectory()
    ? readdirSync(input)
        .filter((name) => name.endsWith('.txt'))
        .sort()
        .map((name) => join(input, name))
    : [input],
);

let failures = 0;
for (const file of files) {
  const name = relative(repoRoot, file) || file;
  const result = parseMapFile(name, readFileSync(file));
  if (result.ok) {
    const { title, width, height, crc, teams, wildFlags } = result.map;
    const flags = `${teams[0].flags.length}/${teams[1].flags.length}/${wildFlags.length}`;
    console.log(
      `ok    ${name}  "${title}" ${width}x${height} bandeiras(v/a/s) ${flags} crc ${crc}`,
    );
  } else {
    failures++;
    console.log(`ERRO  ${name}`);
    for (const error of result.errors) console.log(`      ${error}`);
  }
}
console.log(`\n${files.length - failures} de ${files.length} mapas válidos.`);
process.exit(failures > 0 ? 1 : 0);
