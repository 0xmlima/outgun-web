// SPDX-License-Identifier: GPL-2.0-or-later
// `pnpm dev:all`: sobe tudo o que o jogo precisa para rodar localmente, num terminal só.
//   1. PostgreSQL, Redis e Mailpit (apps/api/compose.yaml), conferindo que as portas foram publicadas
//   2. build dos pacotes (Turborepo, com cache) e assets do cliente, se ainda não existem
//   3. migrations + contas de teste (seed)
//   4. API (7800), game server (7700, com bots) e cliente Vite (5173), com a saída de cada um prefixada
// Ctrl+C encerra os três (os containers continuam; `docker compose -f apps/api/compose.yaml down`).
// Variáveis: CASUAL_BOTS_FILL (padrão 8), ROTATION, SKIP_BUILD=1 (pula o build).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = ['compose', '-f', join(root, 'apps/api/compose.yaml')];
const env = { ...process.env };

// Docker Desktop no macOS nem sempre põe o binário no PATH
if (process.platform === 'darwin')
  env.PATH = `${env.PATH}:/Applications/Docker.app/Contents/Resources/bin`;
// o Turborepo precisa de um `pnpm` no PATH; com Corepack sem `corepack enable`, cria um atalho
if (spawnSync('pnpm', ['--version'], { env, stdio: 'ignore' }).status !== 0) {
  const shim = join(tmpdir(), 'outgun-pnpm-shim');
  mkdirSync(shim, { recursive: true });
  writeFileSync(join(shim, 'pnpm'), '#!/bin/sh\nexec corepack pnpm "$@"\n');
  chmodSync(join(shim, 'pnpm'), 0o755);
  env.PATH = `${shim}:${env.PATH}`;
}

function step(label, cmd, args, opts = {}) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`✗ falhou: ${label}`);
    process.exit(r.status ?? 1);
  }
}
const quiet = (cmd, args) => spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8' });

// 1. dependências da API; se uma porta não foi publicada (ocupada por outro container na criação), recria
step('PostgreSQL, Redis e Mailpit (Docker)', 'docker', [...compose, 'up', '-d']);
for (const [service, port] of [
  ['postgres', 5432],
  ['redis', 6379],
]) {
  if (!quiet('docker', [...compose, 'port', service, String(port)]).stdout.trim()) {
    console.log(
      `  porta ${port} de ${service} não publicada: recriando (confira se outro container usa a ${port})`,
    );
    step(`recria ${service}`, 'docker', [...compose, 'up', '-d', '--force-recreate', service]);
  }
}
process.stdout.write('  aguardando o PostgreSQL');
for (let i = 0; ; i++) {
  if (
    quiet('docker', [...compose, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'outgun']).status ===
    0
  )
    break;
  if (i > 60) {
    console.error('\n✗ o PostgreSQL não ficou pronto em 30 s');
    process.exit(1);
  }
  process.stdout.write('.');
  spawnSync('sleep', ['0.5']);
}
console.log(' ok');

// 2. build e assets
if (!env.SKIP_BUILD)
  step('build dos pacotes (com cache)', 'pnpm', ['build', '--output-logs=errors-only']);
if (!existsSync(join(root, 'apps/web/public/assets/manifest.json')))
  step('assets do cliente (uma vez)', 'pnpm', ['assets']);

// 3. migrations + seed (idempotente)
step('migrations e contas de teste', 'pnpm', ['--filter', '@outgun/api', 'seed']);

// 4. os três serviços
const services = [
  // API em `warn`: no nível `info` ela registra cada heartbeat do game server (a cada 3 s)
  {
    name: 'api ',
    color: 36,
    args: ['--filter', '@outgun/api', 'start'],
    env: { MAILER: env.MAILER ?? 'mailpit', LOG_LEVEL: env.LOG_LEVEL ?? 'warn' },
  },
  // o game server busca as chaves dos tickets na API ao subir: espera a API responder
  {
    name: 'jogo',
    color: 33,
    args: ['--filter', '@outgun/game-server', 'start'],
    env: { CASUAL_BOTS_FILL: env.CASUAL_BOTS_FILL ?? '8' },
    waitFor: 'http://localhost:7800/health',
  },
  { name: 'web ', color: 35, args: ['--filter', '@outgun/web', 'dev'], env: {} },
];
const children = [];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500);
};
async function waitFor(url) {
  for (let i = 0; i < 120 && !stopping; i++) {
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 500));
  }
}
for (const s of services) {
  if (s.waitFor) await waitFor(s.waitFor);
  if (stopping) break;
  const child = spawn('pnpm', s.args, { cwd: root, env: { ...env, ...s.env, FORCE_COLOR: '1' } });
  const prefix = `\x1b[${s.color}m[${s.name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop();
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`${prefix}encerrou (código ${code}); parando os outros`);
    stop(code ?? 1);
  });
  children.push(child);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
console.log(`
  Jogo:     http://localhost:5173   (contas Admin, Jogador1, Jogador2 — senha outgun-dev)
  API:      http://localhost:7800/docs
  E-mails:  http://localhost:8025
  Ctrl+C encerra tudo.
`);
