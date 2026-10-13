// SPDX-License-Identifier: GPL-2.0-or-later
// Sobe um PostgreSQL 16 em container para os testes de integração (ou usa TEST_DATABASE_URL, um
// servidor onde o usuário pode criar bancos). Sem Docker fora do CI, os testes de banco são pulados.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL de administração (banco postgres) ou null quando não há banco para testar. */
    pgAdminUrl: string | null;
  }
}

const IMAGE = 'postgres:16-alpine';

function findDocker(): string | undefined {
  const candidates = ['docker', '/usr/local/bin/docker', '/Applications/Docker.app/Contents/Resources/bin/docker'];
  for (const bin of candidates) {
    if (bin.includes('/') && !existsSync(bin)) continue;
    try {
      execFileSync(bin, ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe' });
      return bin;
    } catch {
      // tenta o próximo
    }
  }
  return undefined;
}

async function waitReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let ok = 0;
  // A imagem oficial reinicia o servidor ao fim da inicialização: exige 3 respostas seguidas.
  while (ok < 3) {
    if (Date.now() > deadline) throw new Error('PostgreSQL de teste não respondeu');
    const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
    try {
      await sql`SELECT 1`;
      ok++;
    } catch {
      ok = 0;
    } finally {
      await sql.end({ timeout: 1 });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

export default async function setup(project: TestProject): Promise<(() => void) | undefined> {
  if (process.env.TEST_DATABASE_URL) {
    project.provide('pgAdminUrl', process.env.TEST_DATABASE_URL);
    return undefined;
  }
  const docker = findDocker();
  if (!docker) {
    if (process.env.CI) throw new Error('testes de integração precisam de Docker ou TEST_DATABASE_URL');
    console.warn('[api] Docker indisponível: testes de banco pulados (defina TEST_DATABASE_URL).');
    project.provide('pgAdminUrl', null);
    return undefined;
  }
  const id = execFileSync(
    docker,
    ['run', '-d', '--rm', '-e', 'POSTGRES_PASSWORD=outgun', '-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data', IMAGE],
    { encoding: 'utf8' },
  ).trim();
  const stop = () => {
    execFileSync(docker, ['rm', '-f', id], { stdio: 'ignore' });
  };
  try {
    const port = execFileSync(docker, ['port', id, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').pop();
    const url = `postgres://postgres:outgun@127.0.0.1:${port}/postgres`;
    await waitReady(url, 60_000);
    project.provide('pgAdminUrl', url);
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
