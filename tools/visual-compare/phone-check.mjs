// SPDX-License-Identifier: GPL-2.0-or-later
// Partes deste script rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Celular (S45, RN-UI-08, D-80): abre as telas do portal num celular emulado (toque, 360 e 412 px),
// logado como Admin, e confere que nenhuma tem rolagem lateral, que todas abrem (sem o aviso) e que
// as rotas do jogo mostram o aviso. Capturas em tools/parity/out/phone/ (para conferência local).
// Uso: com `pnpm dev:all` no ar, node tools/visual-compare/phone-check.mjs (WEB_URL, padrão
// http://localhost:5173). Sai com código 1 se algo falhar.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = process.argv[2] ?? 'tools/parity/out/phone';
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--lang=pt-BR'],
});
const failures = [];
try {
  // uma aba por tela: no `dev:all`, recarregar a mesma aba várias vezes acumula as conexões do portal
  // ao vivo (SSE) no proxy do Vite e a navegação seguinte fica na fila
  const open = async (width, height = 800) => {
    const page = await browser.newPage();
    page.on('dialog', (d) => {
      failures.push(`janela "${d.message()}" em ${page.url()}`);
      void d.dismiss();
    });
    page.on('pageerror', (e) => failures.push(`erro em ${page.url()}: ${String(e).slice(0, 200)}`));
    await page.evaluateOnNewDocument(() =>
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR'] }),
    );
    await page.emulate({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      viewport: { width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    });
    return page;
  };
  const page = await open(412, 915);
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const login = await page.evaluate(
    async () =>
      (
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'Admin', password: 'outgun-dev' }),
          credentials: 'include',
        })
      ).status,
  );
  if (login !== 200) throw new Error(`login falhou: ${login}`);
  // uma partida, uma série e um clã de verdade do banco local, se houver
  const ids = await page.evaluate(async () => {
    const get = (p) =>
      fetch(`/api${p}`, { credentials: 'include' }).then(
        (r) => (r.ok ? r.json() : null),
        () => null,
      );
    const history = await get('/players/Admin/matches?limit=20');
    const matches = history?.matches ?? [];
    const clans = await get('/clans');
    return {
      match: matches[0]?.id ?? null,
      clan: clans?.clans?.[0]?.tag ?? null,
    };
  });
  const portal = [
    '/',
    '/ranking',
    '/hall-da-fama',
    '/players',
    '/players/Admin',
    '/clans',
    '/account',
    '/admin',
    '/help',
    ...(ids.match ? [`/matches/${ids.match}`] : []),
    ...(ids.clan ? [`/clans/${encodeURIComponent(ids.clan)}`] : []),
  ];
  for (const width of [360, 412]) {
    for (const path of portal) {
      const page = await open(width);
      // telas com polling/ao vivo nunca ficam ociosas na rede: carrega e espera os dados chegarem
      await page
        .goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 15000 })
        .catch(() => console.log(`(sem "load" em ${path})`));
      await wait(1500);
      const r = await page.evaluate(() => {
        const main = document.querySelector('.app-main');
        const wide = [...document.querySelectorAll('.app-main *')].filter((e) => {
          const b = e.getBoundingClientRect();
          // o que rola dentro do próprio painel (tabelas, abas) não conta
          return b.right > innerWidth + 1 && !e.closest('.ui-table-wrap, .ui-tablist, .stats-tabs');
        });
        return {
          phone: document.documentElement.hasAttribute('data-phone'),
          notice: !!document.querySelector('.phone-notice'),
          page: document.documentElement.scrollWidth - innerWidth,
          main: main ? main.scrollWidth - main.clientWidth : 0,
          wide: wide
            .slice(0, 3)
            .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`),
        };
      });
      const name = `${width}${path.replace(/[^a-z0-9]+/gi, '-')}`;
      // sem fullPage: com celular emulado ele trava a navegação seguinte (puppeteer 25)
      if (process.env.SHOTS) await page.screenshot({ path: `${OUT}/${name}.png` });
      const bad = !r.phone || r.notice || r.page > 1 || r.main > 1 || r.wide.length > 0;
      if (bad) failures.push(`${width}px ${path}: ${JSON.stringify(r)}`);
      console.log(
        `${bad ? 'FALHA' : 'ok   '} ${width}px ${path}${r.wide.length ? ` ${r.wide.join(' ')}` : ''}`,
      );
      await page.close();
    }
    for (const path of ['/play', '/rooms', '/replays', '/options']) {
      const page = await open(width);
      await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await wait(500);
      const notice = await page.evaluate(() => !!document.querySelector('.phone-notice'));
      if (!notice) failures.push(`${width}px ${path}: sem o aviso`);
      console.log(`${notice ? 'ok   ' : 'FALHA'} ${width}px ${path} (aviso)`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(`\n${failures.length} falha(s):\n${failures.join('\n')}`);
  process.exit(1);
}
