// SPDX-License-Identifier: GPL-2.0-or-later
// Teste de carga do game server (OG-101): N salas × M jogadores headless, opcionalmente com rede
// ruim simulada, e um relatório com os RNF da seção 7 do PLAN (tick, salas por vCPU, tráfego).
//
//   node tools/load/run.mjs [--rooms 20] [--players 32] [--seconds 60] [--warmup 20] [--workers 4]
//                           [--lag 0] [--jitter 0] [--loss 0] [--map outgun1] [--server ws://host:porta]
//                           [--report arquivo.md]
//
// Sem --server, sobe um game server próprio (apps/game-server/dist, porta 17790) com as salas fixas.
import { fork, spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fractionAtMost, histogram, parseMetrics, quantile, sum } from './prom.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const { values: opt } = parseArgs({
  options: {
    rooms: { type: 'string', default: '20' },
    players: { type: 'string', default: '32' },
    seconds: { type: 'string', default: '60' },
    warmup: { type: 'string', default: '20' },
    workers: { type: 'string', default: '4' },
    lag: { type: 'string', default: '0' },
    jitter: { type: 'string', default: '0' },
    loss: { type: 'string', default: '0' },
    map: { type: 'string', default: 'outgun1' },
    server: { type: 'string' },
    report: { type: 'string', default: join(repo, 'tools/parity/out/load/report.md') },
  },
});
const rooms = Number(opt.rooms);
const perRoom = Number(opt.players);
const seconds = Number(opt.seconds);
const warmup = Number(opt.warmup);
const workers = Number(opt.workers);
const total = rooms * perRoom;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (t) => console.log(`[carga] ${t}`);

// --- game server ---
let server = opt.server;
let child;
if (!server) {
  const port = 17790;
  server = `ws://127.0.0.1:${port}`;
  mkdirSync(join(repo, 'tools/parity/out/load'), { recursive: true });
  const out = openSync(join(repo, 'tools/parity/out/load/game-server.log'), 'w');
  const ids = Array.from({ length: rooms - 1 }, (_, i) => `load-${i + 2}`);
  child = spawn(process.execPath, [join(repo, 'apps/game-server/dist/main.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      ROTATION: opt.map,
      MAX_PLAYERS: String(perRoom),
      ROOMS: ids.map((id) => `${id}:classic:${perRoom}`).join(','),
      HEARTBEAT: '0',
      REPLAYS: '0',
      DEV_TICKETS: '1',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', out, out],
  });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {
      if (i > 100) throw new Error('game server não subiu');
    }
    await sleep(100);
  }
  log(`game server na porta ${port} (pid ${child.pid})`);
}
const http = server.replace(/^ws/, 'http');
const roomIds = (await (await fetch(`${http}/rooms`)).json()).map((r) => r.id).slice(0, rooms);
if (roomIds.length < rooms)
  throw new Error(`o servidor tem ${roomIds.length} salas; preciso de ${rooms}`);

// --- clientes ---
const players = roomIds.flatMap((room, r) =>
  Array.from({ length: perRoom }, (_, i) => ({ room, name: `Carga${r}x${i}` })),
);
const latest = new Map();
const procs = Array.from({ length: workers }, (_, w) => {
  const mine = players.filter((_, i) => i % workers === w);
  const p = fork(join(here, 'worker.mjs'), [
    JSON.stringify({
      server,
      players: mine,
      rttMs: Number(opt.lag),
      jitterMs: Number(opt.jitter),
      loss: Number(opt.loss) / 100,
      seed: 1 + w * 100_000,
      rampPerTick: 8,
    }),
  ]);
  p.on('message', (m) => latest.set(w, m));
  return p;
});
const totals = () => {
  const all = [...latest.values()];
  const rejected = {};
  for (const s of all)
    for (const [k, v] of Object.entries(s.rejected)) rejected[k] = (rejected[k] ?? 0) + v;
  return {
    joined: all.reduce((a, s) => a + s.joined, 0),
    closed: all.reduce((a, s) => a + s.closed, 0),
    bytes: all.reduce((a, s) => a + s.bytes, 0),
    sentBytes: all.reduce((a, s) => a + s.sentBytes, 0),
    frames: all.reduce((a, s) => a + s.frames, 0),
    maxGapMs: Math.max(0, ...all.map((s) => s.maxGapMs)),
    rejected,
  };
};

log(
  `${total} jogadores em ${rooms} salas (${workers} processos); rede: RTT ${opt.lag} ms, jitter ${opt.jitter} ms, perda ${opt.loss}%`,
);
for (let t = 0; t < warmup; t += 2) {
  await sleep(2000);
  log(`aquecendo: ${totals().joined}/${total} na partida`);
}
const scrape = async () => parseMetrics(await (await fetch(`${http}/metrics`)).text());
const before = await scrape();
const startTotals = totals();
const startAt = performance.now();
let worstGap = 0;
for (let t = 0; t < seconds; t += 2) {
  await sleep(2000);
  const now = totals();
  worstGap = Math.max(worstGap, now.maxGapMs);
  log(
    `${Math.round((performance.now() - startAt) / 1000)} s: ${now.joined} na partida, maior intervalo entre frames ${now.maxGapMs.toFixed(0)} ms`,
  );
}
const after = await scrape();
const endTotals = totals();
const elapsed = (performance.now() - startAt) / 1000;

for (const p of procs) p.send('stop');
await sleep(500);
child?.kill('SIGTERM');

// --- relatório ---
const tick = histogram(after, 'outgun_tick_duration_seconds', before);
const roomTick = histogram(after, 'outgun_room_tick_duration_seconds', before);
const lateness = histogram(after, 'outgun_tick_lateness_seconds', before);
const cpu =
  (sum(after, 'process_cpu_seconds_total') - sum(before, 'process_cpu_seconds_total')) / elapsed;
const skipped =
  sum(after, 'outgun_ticks_skipped_total') - sum(before, 'outgun_ticks_skipped_total');
const sentPerClient =
  (sum(after, 'outgun_ws_sent_bytes_total') - sum(before, 'outgun_ws_sent_bytes_total')) /
  elapsed /
  endTotals.joined;
const recvPerClient = (endTotals.bytes - startTotals.bytes) / elapsed / endTotals.joined;
const upPerClient = (endTotals.sentBytes - startTotals.sentBytes) / elapsed / endTotals.joined;
const framesPerClient = (endTotals.frames - startTotals.frames) / elapsed / endTotals.joined;
const ms = (s) => `${(s * 1000).toFixed(2)} ms`;
const kb = (b) => `${(b / 1024).toFixed(2)} KB/s`;
const ok = (cond) => (cond ? '✅' : '❌');
const roomP95 = quantile(roomTick, 0.95);
const lines = [
  `# Carga do game server — ${rooms} salas × ${perRoom} jogadores`,
  '',
  `- Data: ${new Date().toISOString()}; máquina: ${process.platform} ${process.arch}, Node ${process.version}`,
  `- Mapa: ${opt.map}; preset Clássico; ${endTotals.joined} de ${total} jogadores na partida no fim (recusas: ${JSON.stringify(endTotals.rejected)}; quedas: ${endTotals.closed})`,
  `- Rede simulada nos clientes: RTT ${opt.lag} ms, jitter ${opt.jitter} ms, perda ${opt.loss}%`,
  `- Medição: ${elapsed.toFixed(0)} s depois de ${warmup} s de aquecimento; ${tick.count} ticks`,
  '',
  '| Medida | Valor | RNF | |',
  '|---|---|---|---|',
  `| Tick de uma sala (simulação + serialização), p50 / p95 / p99 | ${ms(quantile(roomTick, 0.5))} / ${ms(roomP95)} / ${ms(quantile(roomTick, 0.99))} | p95 < 5 ms com 32 jogadores | ${ok(perRoom < 32 || roomP95 < 0.005)} |`,
  `| Ticks de sala até 5 ms | ${(fractionAtMost(roomTick, 0.005) * 100).toFixed(1)}% | | |`,
  `| Tick do processo (todas as salas), p50 / p95 / p99 | ${ms(quantile(tick, 0.5))} / ${ms(quantile(tick, 0.95))} / ${ms(quantile(tick, 0.99))} | < 100 ms (10 Hz); alerta em p95 > 20 ms | ${ok(quantile(tick, 0.95) < 0.02)} |`,
  `| Atraso do tick p99 / ticks descartados | ${ms(quantile(lateness, 0.99))} / ${skipped} | 0 descartados | ${ok(skipped === 0)} |`,
  `| CPU do game server | ${(cpu * 100).toFixed(0)}% de 1 núcleo | ≥ 20 salas cheias por vCPU | ${ok(rooms < 20 || (cpu < 1 && skipped === 0))} |`,
  `| Tráfego servidor → cliente (medido no servidor / nos clientes) | ${kb(sentPerClient)} / ${kb(recvPerClient)} | < 10 KB/s por cliente | ${ok(Math.max(sentPerClient, recvPerClient) < 10240)} |`,
  `| Tráfego cliente → servidor | ${kb(upPerClient)} | | |`,
  `| Frames recebidos por cliente / maior intervalo entre frames | ${framesPerClient.toFixed(2)}/s / ${worstGap.toFixed(0)} ms | 10/s | ${ok(framesPerClient > 9.5)} |`,
  '',
];
const report = lines.join('\n');
mkdirSync(dirname(opt.report), { recursive: true });
writeFileSync(opt.report, report);
console.log('\n' + report);
log(`relatório em ${opt.report}`);
process.exit(0);
