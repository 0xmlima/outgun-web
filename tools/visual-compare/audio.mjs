// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-067: dois jogadores no servidor de jogo; confere que os sons tocam (tiro, entrada,
// chat), o estado do áudio e a latência de saída. Uso: node audio.mjs (servidor na porta 7700 e o
// build servido em WEB_URL).
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}: ${detail}`);

async function open(name) {
  const p = await b.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.setViewport({ width: 1024, height: 768 });
  await p.goto(`${BASE}/play?name=${name}`);
  await p.waitForSelector('.game[data-status=ready]', { timeout: 20000 });
  // guarda cada som tocado
  await p.evaluate(() => {
    const host = document.querySelector('.game-host');
    window.__sounds = [];
    new MutationObserver(() => window.__sounds.push(host.dataset.lastSound)).observe(host, {
      attributeFilter: ['data-sounds'],
    });
  });
  return p;
}
const heard = (p) => p.evaluate(() => window.__sounds);
const audio = (p) => p.evaluate(() => document.querySelector('.game-host').dataset.audio ?? '');

const ana = await open('Ana');
await wait(1500);
const bia = await open('Bia');
await wait(1000);
check(
  'entrada de outro jogador',
  (await heard(ana)).includes('entergam'),
  (await heard(ana)).join(', '),
);
await ana.bringToFront();
await ana.keyboard.down('ControlLeft');
await wait(1200);
await ana.keyboard.up('ControlLeft');
check('tiro na própria sala', (await heard(ana)).includes('fire'), (await heard(ana)).join(', '));
await ana.keyboard.type('oi');
await ana.keyboard.press('Enter');
await wait(500);
check('chat', (await heard(bia)).includes('talk'), (await heard(bia)).join(', '));
const [state, base, output] = (await audio(ana)).split(',');
const dispatch = await ana.evaluate(
  () => document.querySelector('.game-host').dataset.soundDispatchMs,
);
// evento → som = disparo (síncrono no tratamento do evento) + processamento do Web Audio; a saída
// depende do dispositivo (o Chrome automatizado usa uma saída falsa de 200 ms)
check(
  'áudio liberado e atraso evento → som',
  state === 'running' && Number(base) + Number(dispatch) < 50,
  `${state}; disparo ${dispatch} ms + processamento ${base} ms (saída do dispositivo: ${output} ms)`,
);
check('sem erros na página', errs.length === 0, errs.join(' | ') || 'nenhum');
console.log(results.join('\n'));
await b.close();
