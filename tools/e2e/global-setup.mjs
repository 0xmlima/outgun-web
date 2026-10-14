// SPDX-License-Identifier: GPL-2.0-or-later
// Antes dos testes (ambiente próprio do E2E): o seed cria as contas de desenvolvimento, entre elas
// o Admin (senha outgun-dev) que o teste do painel usa (OG-087). Idempotente.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  if (process.env.E2E_BASE_URL) return;
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  execFileSync(process.execPath, [`${repo}apps/api/dist/cli.js`, 'seed'], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ?? 'postgres://outgun:outgun@localhost:55433/outgun',
    },
    stdio: 'inherit',
  });
}
