// SPDX-License-Identifier: GPL-2.0-or-later
// Print de uma rota do cliente web, esperando as salas ficarem prontas. Uso: node shot.mjs ROTA SAÍDA [espera_ms]
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const [url, out, wait] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.setViewport({ width: 1024, height: 768 });
await p.goto(BASE + url);
await p
  .waitForSelector('.game[data-status=ready]', { timeout: 15000 })
  .catch(() => errs.push('não ficou pronto'));
await new Promise((r) => setTimeout(r, Number(wait ?? 3000)));
await p.screenshot({ path: out });
console.log('erros', errs);
await b.close();
