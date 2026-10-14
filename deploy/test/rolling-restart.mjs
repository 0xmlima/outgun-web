// SPDX-License-Identifier: GPL-2.0-or-later
// Deploy sem queda da API (OG-103): com a homologação no ar (deploy/staging.sh up), manda pedidos
// sem parar pelo Caddy enquanto reinicia api-1 e depois api-2 (SIGTERM → /health 503 → fecha após
// SHUTDOWN_GRACE_S → sobe de novo), como um deploy rolling. Falha se algum pedido der erro.
//   node deploy/test/rolling-restart.mjs [http://localhost:18080]
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'http://localhost:18080';
const docker = process.env.DOCKER ?? 'docker';
const compose = (...args) =>
  execFileSync(docker, ['compose', '-p', 'outgun-staging', ...args], { stdio: 'pipe' }).toString();
const paths = ['/api/rooms', '/api/leaderboard', '/api/seasons', '/api/names/check?name=Fulano'];
const results = { ok: 0, failed: 0, statuses: {} };
let running = true;

async function worker(i) {
  for (let n = i; running; n++) {
    try {
      const res = await fetch(base + paths[n % paths.length], {
        signal: AbortSignal.timeout(15_000),
      });
      await res.arrayBuffer();
      if (res.ok) results.ok++;
      else {
        results.failed++;
        results.statuses[res.status] = (results.statuses[res.status] ?? 0) + 1;
      }
    } catch (error) {
      results.failed++;
      results.statuses[error.name] = (results.statuses[error.name] ?? 0) + 1;
    }
  }
}

const workers = Array.from({ length: 8 }, (_, i) => worker(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2000);
for (const api of ['api-1', 'api-2']) {
  const started = Date.now();
  compose('restart', '--timeout', '30', api);
  // espera a instância voltar ao rodízio antes de reiniciar a outra
  for (
    let i = 0;
    i < 60 &&
    !compose('ps', '--format', '{{.Service}} {{.Health}} {{.State}}', api).includes('running');
    i++
  )
    await sleep(500);
  await sleep(3000);
  console.log(
    `${api} reiniciada em ${((Date.now() - started) / 1000).toFixed(1)} s; pedidos até agora: ${results.ok} ok, ${results.failed} com erro`,
  );
}
await sleep(2000);
running = false;
await Promise.all(workers);
console.log(
  `total: ${results.ok} pedidos ok, ${results.failed} com erro ${JSON.stringify(results.statuses)}`,
);
process.exit(results.failed === 0 && results.ok > 100 ? 0 : 1);
