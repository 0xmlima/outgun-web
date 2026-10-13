// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-064: dois jogadores no servidor de jogo (um com rede ruim simulada), tempo até a nave
// responder a uma tecla com e sem predição, correções e prints. Uso: node online.mjs (servidor de
// jogo na porta 7700 e o build servido em WEB_URL).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const OUT = new URL('../parity/out/prints/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const LAG = Number(process.env.LAG ?? 150);
const LOSS = Number(process.env.LOSS ?? 2);

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function open(name, query, prediction = true) {
  const p = await b.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.setViewport({ width: 800, height: 600 });
  await p.goto(BASE + '/');
  await p.evaluate((prediction) => {
    const prefs = JSON.parse(localStorage.getItem('outgun.prefs') ?? '{}');
    localStorage.setItem('outgun.prefs', JSON.stringify({ ...prefs, lagPrediction: prediction }));
  }, prediction);
  await p.goto(`${BASE}/play?name=${name}${query}`);
  await p.waitForSelector('.game[data-status=ready]', { timeout: 20000 });
  return p;
}

const state = (p) =>
  p.evaluate(() => {
    const d = document.querySelector('.game-host').dataset;
    const [rx, ry, x, y, alive] = (d.me ?? '').split(',');
    return {
      room: `${rx},${ry}`,
      x: +x,
      y: +y,
      alive,
      lag: +d.lag,
      corrections: +d.corrections,
      players: +d.players,
    };
  });

/** Milissegundos entre apertar a tecla e a nave andar na tela (medido em cada quadro do navegador). */
async function responseTime(p, key) {
  await p.bringToFront();
  await wait(300);
  const start = p.evaluate(
    () =>
      new Promise((resolve) => {
        const host = document.querySelector('.game-host');
        const at = host.dataset.me;
        const t0 = performance.now();
        window.__pressed = t0;
        const tick = () => {
          if (host.dataset.me !== at && host.dataset.me.split(',')[2] !== at.split(',')[2])
            resolve(performance.now() - window.__pressed);
          else if (performance.now() - t0 > 3000) resolve(-1);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await p.evaluate(() => (window.__pressed = performance.now()));
  await p.keyboard.down(key);
  const ms = await start;
  await wait(400);
  await p.keyboard.up(key);
  await wait(2500); // a nave para (atrito) antes da próxima medida
  return ms;
}

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}: ${detail}`);

const ana = await open('Ana', '');
const bia = await open('Bia', `&lag=${LAG}&loss=${LOSS}`);
await wait(3000); // a média de atraso e o ajuste de envio convergem

const times = [];
for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft'])
  times.push(await responseTime(bia, key));
const sBia = await state(bia);
check(
  `resposta com predição (${LAG} ms, ${LOSS}% perda)`,
  times.every((t) => t > 0 && t < 150),
  `${times.map((t) => t.toFixed(0)).join(', ')} ms; atraso medido ${sBia.lag} frames`,
);

// os dois andando por 20 s: correções do jogador com rede ruim
const before = (await state(bia)).corrections;
await bia.bringToFront();
const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
for (let i = 0; i < 20; i++) {
  const k = keys[i % 4];
  await bia.keyboard.down(k);
  if (i % 3 === 0) await bia.keyboard.down('ShiftLeft');
  await wait(700 + (i % 5) * 120);
  await bia.keyboard.up('ShiftLeft');
  await bia.keyboard.up(k);
  await wait(300);
}
const after = await state(bia);
const perSecond = (after.corrections - before) / 20;
check(
  'correções de predição',
  perSecond < 1,
  `${perSecond.toFixed(2)} por segundo (${after.corrections - before} em 20 s)`,
);
// tiro: os foguetes saem do servidor como eventos e o cliente os simula
await bia.keyboard.down('ArrowRight'); // atira para o lado mais aberto da sala
await wait(150);
await bia.keyboard.up('ArrowRight');
await bia.keyboard.down('ControlLeft');
let rockets = 0;
for (let i = 0; i < 13; i++) {
  await wait(100);
  rockets = Math.max(
    rockets,
    await bia.evaluate(() => Number(document.querySelector('.game-host').dataset.rockets)),
  );
}
const shot = await state(bia);
await bia.screenshot({ path: new URL(`og064-bia-${LAG}ms.png`, OUT).pathname });
await bia.keyboard.up('ControlLeft');
check('foguetes simulados no cliente', rockets > 0, `${rockets} foguetes na tela (${shot.room})`);
await ana.bringToFront();
await wait(500);
await ana.screenshot({ path: new URL('og064-ana.png', OUT).pathname });
check(
  'dois jogadores conectados',
  (await state(ana)).alive !== undefined,
  `Ana ${JSON.stringify(await state(ana))}; Bia ${JSON.stringify(after)}`,
);

// sem predição: a nave só anda quando o servidor responde
await bia.close();
const semPred = await open('Bia', `&lag=${LAG}&loss=0`, false);
await wait(3000);
const t2 = [];
for (const key of ['ArrowRight', 'ArrowLeft']) t2.push(await responseTime(semPred, key));
check(
  'resposta sem predição (comparação)',
  t2.every((t) => t > LAG),
  `${t2.map((t) => t.toFixed(0)).join(', ')} ms`,
);

check('sem erros na página', errs.length === 0, errs.join(' | ') || 'nenhum');
console.log(results.join('\n'));
await b.close();
