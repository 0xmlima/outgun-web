// SPDX-License-Identifier: GPL-2.0-or-later
// Versão do jogo: a do package.json da raiz, igual em todos os pacotes do monorepo. Cada sprint
// aprovada da v2 sobe o número do meio (S19 = 2.19.0; correção sem sprint, o último) e ganha a tag
// `v<versão>`.
//   node tools/dev/version.mjs 2.20.0   grava a versão na raiz e em todos os pacotes
//   node tools/dev/version.mjs --check  falha se algum pacote estiver diferente da raiz (pnpm verify)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const files = [
  'package.json',
  ...['apps', 'packages', 'tools'].flatMap((dir) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, dir, d.name, 'package.json')))
      .map((d) => join(dir, d.name, 'package.json')),
  ),
];
const read = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));

const arg = process.argv[2];
if (arg === '--check') {
  const want = read('package.json').version;
  const wrong = files.filter((f) => read(f).version !== want);
  if (!want || wrong.length > 0) {
    console.error(
      `Versão diferente da raiz (${want ?? 'sem versão'}) em: ${wrong.join(', ')}. Rode: node tools/dev/version.mjs ${want ?? '<versão>'}`,
    );
    process.exit(1);
  }
  console.log(`OK: ${files.length} package.json na versão ${want}.`);
} else if (/^\d+\.\d+\.\d+$/.test(arg ?? '')) {
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    const pkg = JSON.parse(text);
    if (pkg.version === arg) continue;
    // mantém a ordem das chaves: "version" logo depois de "name" quando ainda não existe
    const out =
      pkg.version !== undefined
        ? { ...pkg, version: arg }
        : Object.fromEntries(
            Object.entries(pkg).flatMap(([k, v]) =>
              k === 'name'
                ? [
                    [k, v],
                    ['version', arg],
                  ]
                : [[k, v]],
            ),
          );
    writeFileSync(join(root, f), `${JSON.stringify(out, null, 2)}\n`);
  }
  console.log(`Versão ${arg} gravada em ${files.length} package.json.`);
} else {
  console.error('Uso: node tools/dev/version.mjs <x.y.z> | --check');
  process.exit(1);
}
