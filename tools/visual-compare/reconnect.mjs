// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-047: a conexão de um jogador cai no meio da partida e o cliente volta sozinho à
// mesma vaga (mesmo pid e time), sem o servidor tirá-lo da sala. Precisa do servidor de jogo (7700)
// e do build em `vite preview` (a API é opcional). Uso: node reconnect.mjs
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const GAME = process.env.GAME_URL ?? 'http://localhost:7700';
const OUT = new URL('../parity/out/prints/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') =>
  results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? `: ${detail}` : ''}`);

async function open(name) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  // guarda os WebSockets da página para o roteiro poder derrubar a conexão
  await p.evaluateOnNewDocument(() => {
    const Native = window.WebSocket;
    window.__sockets = [];
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.__sockets.push(this);
      }
    };
  });
  await p.setViewport({ width: 960, height: 720 });
  await p.goto(BASE + '/');
  await p.evaluate(() => localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })));
  await p.goto(`${BASE}/play?name=${name}`);
  await p.waitForSelector('.game[data-status=ready]', { timeout: 20000 });
  return p;
}
const state = (p) =>
  p.evaluate(() => {
    const host = document.querySelector('.game-host');
    return {
      pid: host.dataset.pid,
      team: host.dataset.me?.split(',')[6],
      reconnects: host.dataset.reconnects ?? '0',
    };
  });
const players = async () => (await (await fetch(`${GAME}/health`)).json()).players;

const ana = await open('Ana');
const bia = await open('Bia');
await wait(1000);
await ana.bringToFront();
await wait(300);
const before = await state(ana);
check('dois jogadores', (await players()) === 2);

// queda: a conexão de Ana fecha sem ela sair do jogo
await ana.evaluate(() => window.__sockets.at(-1).close(4999, 'queda simulada'));
await wait(400);
const status = await ana.evaluate(() => document.querySelector('.game-hint')?.textContent ?? '');
await ana.screenshot({ path: new URL('og047-1-reconectando.png', OUT).pathname });
check('cliente avisa e tenta voltar', status.includes('Reconectando'), status);
check('servidor guarda a vaga', (await players()) === 2);
await ana
  .waitForFunction(() => document.querySelector('.game-host')?.dataset.reconnects === '1', {
    timeout: 10000,
  })
  .catch(() => {});
await wait(1500);
await ana.bringToFront();
await wait(300);
const after = await state(ana);
check(
  'voltou à mesma vaga e time',
  after.reconnects === '1' && after.pid === before.pid && after.team === before.team,
  `${JSON.stringify(before)} → ${JSON.stringify(after)}`,
);
check('continua com 2 jogadores', (await players()) === 2);
check('partida pronta de novo', Boolean(await ana.$('.game[data-status=ready]')));
await ana.screenshot({ path: new URL('og047-2-de-volta.png', OUT).pathname });

console.log(results.join('\n'));
await b.close();
void bia;
process.exit(results.some((x) => x.startsWith('FALHA')) ? 1 : 0);
