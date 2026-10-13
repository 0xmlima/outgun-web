// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-065: dois jogadores no servidor de jogo, chat (normal e de time), movimento e tiro;
// prints do HUD em tools/parity/out/prints/og065-*.png. Uso: node hud.mjs (servidor na porta 7700 e
// o build servido em WEB_URL).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const OUT = new URL('../parity/out/prints/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W ?? 1024);
const H = Number(process.env.H ?? 768);

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function open(name, locale) {
  const p = await b.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.setViewport({ width: W, height: H });
  await p.goto(BASE + '/');
  await p.evaluate((locale) => {
    const prefs = JSON.parse(localStorage.getItem('outgun.prefs') ?? '{}');
    localStorage.setItem('outgun.prefs', JSON.stringify({ ...prefs, locale }));
  }, locale);
  await p.goto(`${BASE}/play?name=${name}`);
  await p.waitForSelector('.game[data-status=ready]', { timeout: 20000 });
  return p;
}

const ana = await open('Ana', 'pt-BR');
const bia = await open('Bia', 'en');
await wait(1500);
await ana.bringToFront();
await ana.keyboard.type('oi pessoal');
await ana.keyboard.press('Enter');
await bia.bringToFront();
await bia.keyboard.type('.so pro time azul');
await bia.keyboard.press('Enter');
// Bia anda e atira
for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft']) {
  await bia.keyboard.down(k);
  await bia.keyboard.down('ControlLeft');
  await wait(700);
  await bia.keyboard.up('ControlLeft');
  await bia.keyboard.up(k);
}
await bia.keyboard.type('digitando...');
await wait(300);
await bia.screenshot({ path: new URL(`og065-bia-${W}x${H}.png`, OUT).pathname });
await bia.keyboard.press('Escape'); // limpa o texto sem abrir o menu
await ana.bringToFront();
await ana.keyboard.down('ArrowUp');
await wait(600);
await ana.keyboard.up('ArrowUp');
await wait(500);
await ana.screenshot({ path: new URL(`og065-ana-${W}x${H}.png`, OUT).pathname });
await ana.keyboard.press('F12');
await wait(400);
await ana.screenshot({ path: new URL(`og065-ana-sem-placar-${W}x${H}.png`, OUT).pathname });
const menuOpen = await bia.evaluate(() => Boolean(document.querySelector('.menu, [role=menu]')));
console.log(`Esc limpou o chat sem abrir o menu: ${!menuOpen}`);
console.log(`erros: ${errs.join(' | ') || 'nenhum'}`);
await b.close();
