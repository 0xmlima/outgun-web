// SPDX-License-Identifier: GPL-2.0-or-later
// Confere que as dependências distribuídas (produção) têm licença compatível com GPL-2.0-or-later
// e que todo arquivo de código novo traz o cabeçalho SPDX. Uso: pnpm check:licenses
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Licenças que podem ser combinadas com o código GPL-2.0-or-later do Outgun. Apache-2.0 só é
// compatível com GPLv3: como o Outgun é "v2 ou posterior", a obra combinada é distribuída sob GPLv3+.
const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'GPL-2.0-or-later',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-2.1-or-later',
  'LGPL-3.0-or-later',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]);

function isAllowed(expression) {
  // Expressões "A OR B" são aceitas se qualquer opção for permitida; "A AND B" exige todas.
  const clean = expression.replace(/[()]/g, '').trim();
  if (clean.includes(' OR ')) return clean.split(' OR ').some((part) => isAllowed(part));
  if (clean.includes(' AND ')) return clean.split(' AND ').every((part) => isAllowed(part));
  return ALLOWED.has(clean);
}

const problems = [];

// 1. Dependências de produção. `pnpm licenses list` não enxerga dependências vindas do GitHub (e
// devolve vazio no pnpm 12): percorre a árvore de `pnpm ls` e lê o package.json de cada pacote.
const tree = JSON.parse(
  execFileSync('pnpm', ['ls', '--prod', '--json', '--recursive', '--depth', 'Infinity'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }),
);
const seen = new Map();
const walk = (deps) => {
  for (const [name, info] of Object.entries(deps ?? {})) {
    if (info.version?.startsWith('link:') || seen.has(info.path)) continue; // pacotes do workspace
    seen.set(info.path, name);
    walk(info.dependencies);
  }
};
for (const project of tree) walk(project.dependencies);
let packages = 0;
let skipped = 0;
for (const [path, name] of seen) {
  // Binários opcionais de outras plataformas (ex. @node-rs/argon2-linux-x64) aparecem na árvore
  // sem estar instalados; a plataforma de destino instala o seu, da mesma família de pacotes.
  if (!existsSync(join(path, 'package.json'))) {
    skipped++;
    continue;
  }
  packages++;
  const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  const license =
    typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'desconhecida');
  if (!isAllowed(license))
    problems.push(`licença não permitida: ${name}@${pkg.version} (${license})`);
}

// 2. Cabeçalho SPDX nos arquivos de código do port
const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'apps', 'packages', 'tools'],
  { cwd: repoRoot, encoding: 'utf8' },
)
  .split('\n')
  .filter((file) => /\.(ts|tsx|js|mjs|cjs|sh)$/.test(file) || file.endsWith('Dockerfile'))
  .filter((file) => existsSync(join(repoRoot, file))); // ignora arquivos apagados ainda no índice
for (const file of tracked) {
  const head = readFileSync(join(repoRoot, file), 'utf8').split('\n').slice(0, 3).join('\n');
  if (!head.includes('SPDX-License-Identifier: GPL-2.0-or-later')) {
    problems.push(`sem cabeçalho SPDX: ${file}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(
  `OK: ${packages} dependências de produção compatíveis (${skipped} opcionais de outras plataformas não instaladas); ${tracked.length} arquivos com cabeçalho SPDX.`,
);
