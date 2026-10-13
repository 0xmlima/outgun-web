// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-044: dois jogadores no servidor de jogo pedem troca de time (Ctrl+End) e trocam;
// prints em tools/parity/out/prints/og044-*.png. Uso: node teams.mjs (servidor na porta 7700 e o
// build servido em WEB_URL).
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
// aba em segundo plano não desenha (sem requestAnimationFrame): traz para a frente antes de ler
const meTeam = async (p) => {
  await p.bringToFront();
  await wait(300);
  return p.evaluate(() => document.querySelector('.game-host').dataset.me?.split(',')[6]);
};
const ctrlEnd = async (p) => {
  await p.bringToFront();
  await p.keyboard.down('ControlLeft');
  await p.keyboard.press('End');
  await p.keyboard.up('ControlLeft');
};

const ana = await open('Ana');
const bia = await open('Bia');
await wait(1500);
const before = [await meTeam(ana), await meTeam(bia)];
await ctrlEnd(ana);
await wait(800);
await ana.screenshot({ path: new URL('og044-pedido.png', OUT).pathname });
check(
  'sozinha no pedido: continua no time',
  (await meTeam(ana)) === before[0],
  `time ${before[0]} → ${await meTeam(ana)}`,
);
await ctrlEnd(bia);
await wait(3500); // morre na troca e renasce na base do outro time
const after = [await meTeam(ana), await meTeam(bia)];
await ana.bringToFront();
await wait(300);
await ana.screenshot({ path: new URL('og044-trocou.png', OUT).pathname });
check(
  'as duas pediram: trocaram de time',
  after[0] === before[1] && after[1] === before[0] && before[0] !== before[1],
  `times antes ${before.join(' / ')}, depois ${after.join(' / ')}`,
);
check('sem erros na página', errs.length === 0, errs.join(' | ') || 'nenhum');
console.log(results.join('\n'));
await b.close();
