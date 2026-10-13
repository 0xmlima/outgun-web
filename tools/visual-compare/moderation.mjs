// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro do OG-046: um admin (conta Admin do seed) silencia e expulsa um convidado pelo chat; a
// ação vai para a auditoria da API. Precisa da API (7800, com seed), do servidor de jogo (7700) e do
// build em `vite preview`. Prints em tools/parity/out/prints/og046-*.png. Uso: node moderation.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const GAME = process.env.GAME_URL ?? 'http://localhost:7700';
/** Comando que lista a auditoria (ex.: docker exec <container> psql ...). */
const AUDIT_CMD = process.env.AUDIT_CMD;
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

async function player(query, login) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 960, height: 720 });
  await p.goto(BASE + '/');
  await p.evaluate(() => localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })));
  if (login) {
    await p.evaluate(async () => {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'Admin', password: 'outgun-dev' }),
      });
    });
  }
  await p.goto(`${BASE}/play?${query}`);
  await p.waitForSelector('.game[data-status=ready]', { timeout: 20000 });
  return p;
}
const type = async (p, text) => {
  await p.bringToFront();
  await p.keyboard.type(text);
  await p.keyboard.press('Enter');
  await wait(600);
};
const players = async () => (await (await fetch(`${GAME}/health`)).json()).players;

const victim = await player('sala=main&name=Alvo');
const admin = await player('sala=main', true);
check('dois jogadores na sala', (await players()) === 2);

await type(admin, '/list');
await admin.screenshot({ path: new URL('og046-1-list.png', OUT).pathname });
await type(admin, '/mute 1');
await victim.bringToFront();
await wait(500);
await victim.screenshot({ path: new URL('og046-2-silenciado.png', OUT).pathname });
await type(victim, 'oi?');
await type(admin, '/unmute 1');
await type(admin, '/kick 1 teste do roteiro');
await victim.bringToFront();
await wait(5500);
await victim.screenshot({ path: new URL('og046-3-contagem.png', OUT).pathname });
await wait(5500);
check('alvo desconectado depois de 10 s', (await players()) === 1, `jogadores: ${await players()}`);
await admin.bringToFront();
await admin.screenshot({ path: new URL('og046-4-admin.png', OUT).pathname });

if (AUDIT_CMD) {
  await wait(1500);
  const rows = execFileSync('sh', ['-c', AUDIT_CMD], { encoding: 'utf8' }).trim();
  check(
    'auditoria na API: mute, unmute e kick com autor, alvo e motivo',
    /Admin\|mute\|Alvo\*/.test(rows) &&
      /Admin\|unmute\|Alvo\*/.test(rows) &&
      /Admin\|kick\|Alvo\*\|teste do roteiro/.test(rows),
    rows.replace(/\n/g, ' / '),
  );
}
console.log(results.join('\n'));
await b.close();
process.exit(results.some((x) => x.startsWith('FALHA')) ? 1 : 0);
