// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-045: dois jogadores votam para sair do mapa (F8) e o servidor troca para o próximo
// da rotação; prints em tools/parity/out/prints/og045-*.png. Uso: node vote.mjs (servidor na porta
// 7700 com 2+ mapas na rotação e o build servido em WEB_URL).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const OUT = new URL('../parity/out/prints/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}: ${detail}`);

async function open(name) {
  const p = await b.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.setViewport({ width: 1024, height: 768 });
  await p.goto(BASE + '/');
  await p.evaluate(() => localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })));
  await p.goto(`${BASE}/play?name=${name}`);
  await p.waitForSelector('.game[data-status=ready]', { timeout: 20000 });
  return p;
}
const mapOf = (p) => p.evaluate(() => document.querySelector('.game')?.dataset.map ?? '');

const ana = await open('Ana');
const bia = await open('Bia');
await wait(1000);
const before = await mapOf(ana);
await ana.bringToFront();
await ana.keyboard.press('F8');
await wait(1200);
await ana.screenshot({ path: new URL('og045-voto.png', OUT).pathname });
await bia.bringToFront();
await bia.keyboard.press('F8');
await wait(1500);
await bia.screenshot({ path: new URL('og045-placar.png', OUT).pathname });
await wait(6000); // placar de fim (5 s) e o mapa novo
await ana.bringToFront();
await wait(500);
const after = await mapOf(ana);
await ana.screenshot({ path: new URL('og045-mapa-novo.png', OUT).pathname });
check(
  'a maioria votou: o mapa trocou',
  before !== '' && after !== '' && before !== after,
  `${before} → ${after}`,
);
check('sem erros na página', errs.length === 0, errs.join(' | ') || 'nenhum');
console.log(results.join('\n'));
await b.close();
