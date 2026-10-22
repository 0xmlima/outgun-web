// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Latência do input (OG-369): sobe um game server e o `vite preview` próprios, põe um jogador numa
// partida com bots e repete sequências de teclas (diagonal, Alt + diagonal, trocas rápidas) com
// atrasos humanos entre as teclas. Mede tecla→envio e tecla→tela no cliente e a espera até o tick
// e as mudanças sobrescritas no servidor (/metrics). Grava um JSON para comparar versões.
// Também lê o tempo de CPU por quadro do cliente (`data-frame-ms`, OG-374): p50/p95/p99.
// Uso (depois de `pnpm build`): node tools/visual-compare/input-latency.mjs [--fps 30] [--bots 15] [--out arquivo.json]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GS_PORT = 17760;
const WEB_PORT = 14283;
const SERVER = `ws://localhost:${GS_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const arg = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const FPS = Number(arg('--fps', '0'));
const ROUNDS = Number(arg('--rounds', '40'));
const BOTS = arg('--bots', '4');
const OUT = arg('--out', `${repo}tools/parity/out/input-latency/latency-fps${FPS || 'max'}.json`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function up(url, child, name) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`${name} saiu (código ${child.exitCode})`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // ainda subindo
    }
    await wait(250);
  }
  throw new Error(`${name} não respondeu em ${url}`);
}

function start(cmd, args, env, name) {
  const child = spawn(cmd, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[${name}] ${d}`));
  return child;
}

for (const f of ['apps/game-server/dist/main.js', 'apps/web/dist/index.html']) {
  if (!existsSync(repo + f)) throw new Error(`falta ${f}: rode \`pnpm build\``);
}
const children = [
  start(
    process.execPath,
    ['apps/game-server/dist/main.js'],
    {
      PORT: String(GS_PORT),
      HEARTBEAT: '0',
      DEV_TICKETS: '1',
      ROTATION: 'outgun1',
      SEED: '1',
      REPLAYS: '0',
      CASUAL_BOTS_FILL: BOTS,
      MAX_CONNECTIONS_PER_IP: '0',
      LOG_LEVEL: 'warn',
      GAMEMOD: ['idlekick_time 0', 'time_limit 30'].join('|'),
    },
    'game-server',
  ),
  start(
    process.execPath,
    [
      'apps/web/node_modules/vite/bin/vite.js',
      'preview',
      'apps/web',
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ],
    { CSP_CONNECT_SRC: `${SERVER} http://localhost:${GS_PORT}` },
    'web',
  ),
];
const stop = () => children.forEach((c) => c.exitCode === null && c.kill('SIGKILL'));
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

/** Percentil "nearest rank". */
function pct(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return (
    Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] * 10) /
    10
  );
}
const summary = (v) => ({ n: v.length, p50: pct(v, 50), p95: pct(v, 95), max: pct(v, 100) });

/** Histograma do Prometheus em texto → contagem por limite (cumulativa), soma e total. */
async function histogram(name) {
  const text = await (await fetch(`http://localhost:${GS_PORT}/metrics`)).text();
  const buckets = [];
  let sum = 0;
  let count = 0;
  for (const line of text.split('\n')) {
    const b = new RegExp(`^${name}_bucket\\{[^}]*le="([^"]+)"[^}]*\\} (\\S+)`).exec(line);
    if (b) buckets.push([b[1] === '+Inf' ? Infinity : Number(b[1]) * 1000, Number(b[2])]);
    else if (line.startsWith(`${name}_sum`)) sum = Number(line.split(' ').pop());
    else if (line.startsWith(`${name}_count`)) count = Number(line.split(' ').pop());
  }
  return { buckets, sumMs: sum * 1000, count };
}
const counter = async (name) => {
  const text = await (await fetch(`http://localhost:${GS_PORT}/metrics`)).text();
  return text
    .split('\n')
    .filter((l) => l.startsWith(name) && !l.startsWith('#'))
    .reduce((a, l) => a + Number(l.split(' ').pop()), 0);
};
/** Percentil aproximado pelo limite do balde em que cai. */
function bucketPct(h, p) {
  const target = (p / 100) * h.count;
  let prev = 0;
  const merged = new Map();
  for (const [le, c] of h.buckets) merged.set(le, (merged.get(le) ?? 0) + c);
  for (const [le, c] of [...merged].sort((a, b) => a[0] - b[0])) {
    if (c >= target) return le;
    prev = c;
  }
  return prev ? Infinity : null;
}

let browser;
try {
  await up(`http://localhost:${GS_PORT}/health`, children[0], 'game server');
  await up(WEB, children[1], 'web');
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const [page] = await browser.pages();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((fpsLimit) => {
    globalThis.__outgunInputLatency = { send: [], render: [] };
    localStorage.setItem(
      'outgun.prefs',
      JSON.stringify({ locale: 'pt-BR', fpsLimit, lagPrediction: true, lagPredictionAmount: 10 }),
    );
  }, FPS);
  await page.goto(`${WEB}/play?server=${encodeURIComponent(SERVER)}&name=Medidor`);
  await page.waitForSelector('.game[data-status=ready]', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[data-me]')?.dataset.me, {
    timeout: 15_000,
  });
  await wait(2000);
  const waitsBefore = await histogram('outgun_input_tick_wait_seconds');
  const overwrittenBefore = await counter('outgun_input_overwritten_total');

  // atrasos humanos entre as teclas de um "mesmo" movimento (ms)
  const gap = () => 8 + Math.random() * 32;
  const kb = page.keyboard;
  const scenarios = {
    // ↑ e depois → (diagonal), segura, solta → e depois ↑
    diagonal: async () => {
      await kb.down('ArrowUp');
      await wait(gap());
      await kb.down('ArrowRight');
      await wait(250);
      await kb.up('ArrowRight');
      await wait(gap());
      await kb.up('ArrowUp');
    },
    // Alt (esquiva) e diagonal com a seta antes do Alt
    altDiagonal: async () => {
      await kb.down('ArrowDown');
      await wait(gap());
      await kb.down('Alt');
      await wait(gap());
      await kb.down('ArrowLeft');
      await wait(250);
      await kb.up('ArrowLeft');
      await wait(gap());
      await kb.up('ArrowDown');
      await wait(gap());
      await kb.up('Alt');
    },
    // trocas rápidas de lado (← → ← →), como no desvio
    zigzag: async () => {
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight']) {
        await kb.down(k);
        await wait(40 + Math.random() * 40);
        await kb.up(k);
      }
    },
  };
  const results = {};
  for (const [name, run] of Object.entries(scenarios)) {
    await page.evaluate(() => {
      globalThis.__outgunInputLatency.send.length = 0;
      globalThis.__outgunInputLatency.render.length = 0;
    });
    for (let i = 0; i < ROUNDS; i++) {
      await wait(Math.random() * 100); // fase aleatória em relação ao tick
      await run();
      await wait(300);
    }
    await wait(1500); // a amostra do cliente sai a cada segundo
    const probe = await page.evaluate(() => globalThis.__outgunInputLatency);
    results[name] = { keyToSend: summary(probe.send), keyToScreen: summary(probe.render) };
    console.log(name, JSON.stringify(results[name]));
  }
  const waitsAfter = await histogram('outgun_input_tick_wait_seconds');
  const waits = {
    buckets: waitsAfter.buckets.map(([le, c], i) => [le, c - (waitsBefore.buckets[i]?.[1] ?? 0)]),
    sumMs: waitsAfter.sumMs - waitsBefore.sumMs,
    count: waitsAfter.count - waitsBefore.count,
  };
  const server = {
    changesApplied: waits.count,
    tickWaitAvgMs: waits.count ? Math.round((waits.sumMs / waits.count) * 10) / 10 : null,
    tickWaitP50BucketMs: bucketPct(waits, 50),
    tickWaitP95BucketMs: bucketPct(waits, 95),
    overwritten: (await counter('outgun_input_overwritten_total')) - overwrittenBefore,
  };
  console.log('servidor', JSON.stringify(server));
  const [p50, p95, p99] = (await page.evaluate(() => document.querySelector('[data-frame-ms]')?.dataset.frameMs ?? '')).split(',').map(Number);
  const frameMs = { p50, p95, p99 };
  console.log('quadro (ms de CPU)', JSON.stringify(frameMs));
  const report = {
    date: new Date().toISOString(),
    fpsLimit: FPS || 'sem limite',
    rounds: ROUNDS,
    bots: Number(BOTS),
    version: JSON.parse(readFileSync(`${repo}package.json`, 'utf8')).version,
    client: results,
    server,
    frameMs,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`gravado em ${OUT}`);
} finally {
  await browser?.close();
  stop();
}
