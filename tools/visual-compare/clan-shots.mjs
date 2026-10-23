// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Capturas da S43 para o PO (RN-UI-05): partida online de verdade com 4 jogadores (um navegador cada)
// e tickets de desenvolvimento com clã, número e medalha (`dev:Nome|clan=...|n=..|medal=..`):
// DK x DT, DK x azul padrão e clã x clã com a mesma primária (o azul usa a secundária). Saída em
// tools/parity/out/prints/og409-*.png. Precisa do build (`pnpm build`) e do Chrome.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${repo}tools/parity/out/prints/`;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GS_PORT = 17760;
const WEB_PORT = 14283;
const SERVER = `ws://localhost:${GS_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const start = (args, env) =>
  spawn(process.execPath, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
async function up(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // subindo
    }
    await wait(250);
  }
  throw new Error(`sem resposta em ${url}`);
}

const DK = 'DK:#1E9E3A:#E6E6E6';
const DT = 'DT:#F07800:#303030';
const XG = 'XG:#1E9E3A:#F25AA8';
// por lado: [ticket, cores favoritas]; quem entra cai num lado sorteado no empate, então cada jogador
// entra com o ticket do lado que ainda tem vaga e, se cair no outro, sai e entra com o daquele lado
const SCENARIOS = [
  {
    name: 'dk-x-dt',
    red: [
      [`Bia|clan=${DK}|n=7|style=3`, [20]],
      [`Caio|clan=${DK}|n=99|style=2`, [3]],
    ],
    blue: [
      [`Ana|clan=${DT}|n=10|medal=1`, [32]],
      [`Duda|clan=${DT}|n=44|style=1`, [26]],
    ],
  },
  {
    name: 'dk-x-azul',
    red: [
      [`Bia|clan=${DK}|n=23`, [24]],
      [`Caio|clan=${DK}`, [0]],
    ],
    blue: [
      ['Ana|n=10|style=1', [17]],
      ['Duda|n=23|style=2', [22]],
    ],
  },
  {
    name: 'mesma-primaria',
    red: [
      [`Bia|clan=${DK}|n=8`, [21]],
      [`Caio|clan=${DK}`, [2]],
    ],
    blue: [
      [`Ana|clan=${XG}|n=1|style=2`, [30]],
      [`Duda|clan=${XG}|n=88|style=3`, [19]],
    ],
  },
];

const errors = [];
for (const sc of SCENARIOS.filter((x) => !process.env.ONLY || x.name.includes(process.env.ONLY))) {
  const children = [
    start(['apps/game-server/dist/main.js'], {
      PORT: String(GS_PORT),
      HEARTBEAT: '0',
      DEV_TICKETS: '1',
      ROTATION: 'outgun1',
      SEED: '1',
      REPLAYS: '0',
      CASUAL_BOTS_FILL: '0',
      MAX_CONNECTIONS_PER_IP: '0',
      LOG_LEVEL: 'warn',
      GAMEMOD: [
        'pups_min 0',
        'pups_max 0',
        'idlekick_time 0',
        'time_limit 1',
        'extra_time 0',
        'capture_limit 0',
        'game_end_delay 2',
      ].join('|'),
    }),
    start(
      [
        'apps/web/node_modules/vite/bin/vite.js',
        'preview',
        'apps/web',
        '--port',
        String(WEB_PORT),
        '--strictPort',
      ],
      {
        CSP_CONNECT_SRC: `${SERVER} http://localhost:${GS_PORT}`,
        API_URL: 'http://127.0.0.1:9',
      } /* sem API: o cliente usa o ticket de desenvolvimento, mesmo com uma API local no ar */,
    ),
  ];
  const browsers = [];
  try {
    await up(`http://localhost:${GS_PORT}/health`);
    await up(WEB);
    const pages = { red: [], blue: [] };
    const join = async ([ticket, colors]) => {
      const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        args: [
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--force-color-profile=srgb',
        ],
      });
      const [page] = await browser.pages();
      page.on('pageerror', (e) => errors.push(`${sc.name}: ${e.message}`));
      if (process.env.VERBOSE)
        page.on('console', (m) => m.type() === 'error' && console.error(`console: ${m.text()}`));
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(
        (favoriteColors) =>
          localStorage.setItem(
            'outgun.prefs',
            JSON.stringify({ locale: 'pt-BR', favoriteColors, randomColor: false }),
          ),
        colors,
      );
      await page.goto(
        `${WEB}/play?server=${encodeURIComponent(SERVER)}&name=${encodeURIComponent(ticket)}`,
      );
      await page.waitForSelector('.game[data-status=ready]', { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('[data-me]')?.dataset.me, {
        timeout: 30_000,
      });
      const team =
        (await page.evaluate(
          () => document.querySelector('[data-me]').dataset.me.split(',')[6],
        )) === '0'
          ? 'red'
          : 'blue';
      return { browser, page, team };
    };
    const meTeam = async (page) =>
      (await page.evaluate(() => document.querySelector('[data-me]').dataset.me.split(',')[6])) ===
      '0'
        ? 'red'
        : 'blue';
    // vermelho, azul, vermelho, azul na ordem de pedido; quem cair do lado errado pede troca (Ctrl+End)
    for (const [want, entry] of [
      ['blue', sc.blue[0]],
      ['red', sc.red[0]],
      ['blue', sc.blue[1]],
      ['red', sc.red[1]],
    ]) {
      const p = await join(entry);
      browsers.push(p.browser);
      for (let tries = 0; (await meTeam(p.page)) !== want && tries < 4; tries++) {
        await p.page.bringToFront();
        await p.page.keyboard.down('Control');
        await p.page.keyboard.press('End');
        await p.page.keyboard.up('Control');
        await wait(2500);
      }
      if (process.env.VERBOSE)
        console.log(
          `${sc.name}: ${entry[0].split('|')[0]} quis ${want}, ficou em ${await meTeam(p.page)}`,
        );
      pages[want].push(p.page);
    }
    // a identidade vale a partir da rodada seguinte (D-78): espera a partida de 1 minuto virar
    await wait(70_000);
    const ana = pages.blue[0];
    await ana.bringToFront();
    await wait(3000);
    writeFileSync(`${OUT}og409-${sc.name}-partida.png`, await ana.screenshot({ type: 'png' }));
    // F4: as tabelas dos jogadores com a tag no lugar de Time vermelho/azul
    await ana.keyboard.press('F4');
    await wait(800);
    writeFileSync(`${OUT}og409-${sc.name}-f4.png`, await ana.screenshot({ type: 'png' }));
    await ana.keyboard.press('F4');
    console.log(`capturas: ${sc.name}`);
  } finally {
    for (const b of browsers) await b.close().catch(() => undefined);
    for (const c of children) c.kill('SIGKILL');
    await wait(500);
  }
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
