// SPDX-License-Identifier: GPL-2.0-or-later
// Capturas dos estilos do HUD (OG-298 a OG-300) numa partida online de verdade com bots: sobe um game
// server e o build do cliente, entra com o estilo pedido e captura nas resoluções de conferência.
//
//   node tools/visual-compare/hud-styles-shots.mjs [modern|custom|classic] [pasta de saída]
//   HUD_CUSTOM='{...}' (layout do Personalizado) e HUD_PREFS='{"classicFragsOnTab":true}' (outras preferências)
//
// Precisa do build (`pnpm build`). Diferente do visual:check, o mapa e as naves são desenhados.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const style = process.argv[2] ?? 'modern';
const out = process.argv[3] ?? `${repo}tools/parity/out/hud-styles/`;
const extra = process.env.HUD_CUSTOM ? JSON.parse(process.env.HUD_CUSTOM) : undefined;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GS_PORT = 17760;
const WEB_PORT = 14283;
const SERVER = `ws://localhost:${GS_PORT}`;
const RESOLUTIONS = [
  [1920, 1080],
  [1680, 1050],
  [1280, 720],
  [1024, 768],
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

const start = (args, env) =>
  spawn(process.execPath, args, { cwd: repo, env: { ...process.env, ...env }, stdio: 'ignore' });
const children = [
  start(['apps/game-server/dist/main.js'], {
    PORT: String(GS_PORT),
    HEARTBEAT: '0',
    DEV_TICKETS: '1',
    ROTATION: 'outgun1',
    REPLAYS: '0',
    CASUAL_BOTS_FILL: '6',
    MAX_CONNECTIONS_PER_IP: '0',
    LOG_LEVEL: 'warn',
  }),
  start(
    [
      'apps/web/node_modules/vite/bin/vite.js',
      'preview',
      'apps/web',
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ],
    {
      CSP_CONNECT_SRC: `${SERVER} http://localhost:${GS_PORT}`,
    },
  ),
];
const stop = () => children.forEach((c) => c.exitCode === null && c.kill('SIGKILL'));
process.on('exit', stop);
async function up(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // subindo
    }
    await wait(250);
  }
  throw new Error(`sem resposta de ${url}`);
}
try {
  await up(`http://localhost:${GS_PORT}/health`);
  await up(`http://localhost:${WEB_PORT}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=metal'],
  });
  const [page] = await browser.pages();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.evaluateOnNewDocument(
    (prefs) => localStorage.setItem('outgun.prefs', JSON.stringify(prefs)),
    {
      locale: 'pt-BR',
      hudStyle: style,
      ...(extra ? { hudCustom: extra } : {}),
      ...(process.env.HUD_PREFS ? JSON.parse(process.env.HUD_PREFS) : {}),
    },
  );
  await page.goto(
    `http://localhost:${WEB_PORT}/play?server=${encodeURIComponent(SERVER)}&name=Ana`,
  );
  await page.waitForSelector('.game[data-status=ready]', { timeout: 30_000 });
  await wait(4000);
  await page.keyboard.type('vou pegar a bandeira azul');
  await page.keyboard.press('Enter');
  await wait(1500);
  for (const [w, h] of RESOLUTIONS) {
    await page.setViewport({ width: w, height: h });
    await wait(900);
    writeFileSync(
      `${out}${process.env.SHOT_PREFIX ?? style}-${w}x${h}.png`,
      await page.screenshot({ type: 'png' }),
    );
  }
  await page.setViewport({ width: 1920, height: 1080 });
  await wait(600);
  await page.keyboard.down('Tab');
  await wait(400);
  writeFileSync(
    `${out}${process.env.SHOT_PREFIX ?? style}-tab-1920x1080.png`,
    await page.screenshot({ type: 'png' }),
  );
  await page.keyboard.up('Tab');
  await page.keyboard.press('F12');
  await wait(400);
  writeFileSync(
    `${out}${process.env.SHOT_PREFIX ?? style}-f12-1920x1080.png`,
    await page.screenshot({ type: 'png' }),
  );
  await browser.close();
  console.log(errors.length ? `erros na página:\n${errors.join('\n')}` : 'sem erros na página');
} finally {
  stop();
}
