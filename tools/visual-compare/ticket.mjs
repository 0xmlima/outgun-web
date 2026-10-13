// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-083: entrada na partida com o ticket da API. Precisa da API (porta 7800, com o seed),
// do servidor de jogo com DEV_TICKETS=0 (só aceita tickets da API) e do build em `vite preview`.
// Prints em tools/parity/out/prints/og083-*.png. Uso: node ticket.mjs
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
const errs = [];
const check = (name, ok, detail = '') =>
  results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? `: ${detail}` : ''}`);

async function page() {
  const ctx = await b.createBrowserContext(); // contexto próprio: cookies separados
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 960, height: 720 });
  await p.goto(BASE + '/');
  await p.evaluate(() => localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })));
  return p;
}
/** Espera a partida ficar pronta ou aparecer um erro; devolve o texto visível. */
async function play(p, query) {
  await p.goto(`${BASE}/play?${query}`);
  await p
    .waitForFunction(
      () =>
        document.querySelector('.game[data-status=ready]') ||
        /exigem|pertence|banido|cheia|inválido|erro/i.test(document.body.innerText),
      { timeout: 20000 },
    )
    .catch(() => {});
  await wait(1500);
  const ready = Boolean(await p.$('.game[data-status=ready]'));
  return { ready, text: await p.evaluate(() => document.body.innerText) };
}
const players = async () => (await (await fetch(`${GAME}/health`)).json()).players;

// 1. Conta: o nome em jogo é o da conta, entrando pelo ticket JWT.
const user = await page();
const name = `Tk${String(Date.now()).slice(-6)}`;
const reg = await user.evaluate(async (name) => {
  const r = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: name,
      email: `${name}@outgun.local`,
      password: 'senha-ticket-1',
    }),
  });
  await fetch('/api/account/clan-tag', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clanTag: 'TK' }),
  });
  return r.status;
}, name);
check('cadastro pela API', reg === 201, String(reg));
const before = await players();
let r = await play(user, 'sala=main&name=ignorado');
check('logado entra com ticket (servidor sem tickets dev)', r.ready, r.text.slice(0, 80));
check('servidor contou o jogador', (await players()) === before + 1);
await user.screenshot({ path: new URL('og083-1-logado.png', OUT).pathname });

// 2. Convidado com nome livre entra (marcado com *).
const guest = await page();
r = await play(guest, 'sala=main&name=Visita');
check('convidado com nome livre entra', r.ready, r.text.slice(0, 80));

// 3. Convidado com o nome de uma conta é recusado pela API.
const impostor = await page();
r = await play(impostor, `sala=main&name=${name.toUpperCase()}`);
check(
  'convidado não usa nome registrado',
  !r.ready && r.text.includes('Este nome pertence a uma conta'),
  r.text.slice(0, 120),
);
await impostor.screenshot({ path: new URL('og083-2-nome-registrado.png', OUT).pathname });

// 4. Convidado não entra no Ranked.
const rankedGuest = await page();
r = await play(rankedGuest, 'sala=ranked&name=Visita2');
check(
  'convidado não entra no Ranked',
  !r.ready && r.text.includes('Partidas ranqueadas exigem uma conta'),
  r.text.slice(0, 120),
);
await rankedGuest.screenshot({ path: new URL('og083-3-ranked-convidado.png', OUT).pathname });

check('sem erros na página', errs.length === 0, errs.join(' / '));
console.log(results.join('\n'));
await b.close();
process.exit(results.some((x) => x.startsWith('FALHA')) ? 1 : 0);
