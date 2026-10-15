// SPDX-License-Identifier: GPL-2.0-or-later
// Partes deste script rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Capturas da pausa do Ranked numa partida online de verdade (OG-264, RN-UI-05): três contas do seed
// (Admin, Jogador1, Jogador2) entram na sala `ranked` e passam pela pausa do time, pela retomada, pela
// queda (com volta pela conta, em outro navegador) e pelo voto do bot substituto depois do "Sair da partida". Para o PO conferir o overlay; não compara nada.
//
//   pnpm dev:all                              (outro terminal: API, game server e cliente)
//   node tools/visual-compare/pause-shots.mjs [--web http://localhost:5173]
//
// Saída em tools/parity/out/visual/pausa/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${repo}tools/parity/out/visual/pausa/`;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WEB = process.argv.includes('--web')
  ? process.argv[process.argv.indexOf('--web') + 1]
  : 'http://localhost:5173';
const PASSWORD = 'outgun-dev';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const browsers = [];
async function enter(username) {
  // um navegador por jogador: aba em segundo plano não desenha e o cliente cai
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browsers.push(browser);
  const [page] = await browser.pages();
  page.on('dialog', (d) => void d.accept()); // "sair da partida?" do Ranked: o jogador confirma
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() =>
    localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })),
  );
  await page.goto(WEB);
  const status = await page.evaluate(
    async (u, p) =>
      (
        await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        })
      ).status,
    username,
    PASSWORD,
  );
  if (status !== 200) throw new Error(`login de ${username}: ${status}`);
  await page.goto(`${WEB}/play?sala=ranked`);
  await page.waitForSelector('.game[data-status=ready]', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[data-me]')?.dataset.me, {
    timeout: 15_000,
  });
  return { username, browser, page };
}
const team = (p) =>
  p.page.evaluate(() => document.querySelector('[data-me]')?.dataset.me?.split(',')[6]);
async function shot(p, name) {
  await wait(400);
  writeFileSync(`${OUT}${name}.png`, await p.page.screenshot({ type: 'png' }));
  console.log(`captura: ${name}.png (${p.username})`);
}

try {
  const players = [];
  for (const u of ['Admin', 'Jogador1', 'Jogador2']) players.push(await enter(u));
  await wait(3000);
  const teams = await Promise.all(players.map(team));
  // quem sai precisa de um colega humano para votar: dois do mesmo time
  const pairTeam = teams.find((t, i) => teams.indexOf(t) !== i);
  if (pairTeam === undefined) throw new Error(`times sem dupla: ${teams.join(',')}`);
  const [leaver, mate] = players.filter((_, i) => teams[i] === pairTeam);
  const enemy = players.find((_, i) => teams[i] !== pairTeam);

  await shot(mate, '00-jogando-sem-pausa');
  // pausa do time (tecla P) e a retomada pelo mesmo time
  await mate.page.keyboard.press('KeyP');
  await wait(2500);
  await shot(mate, '01-pausa-do-time');
  await shot(enemy, '02-pausa-vista-pelo-adversario');
  await mate.page.keyboard.press('KeyP');
  await wait(800);
  await shot(enemy, '03-retomando');
  await wait(4000);

  // queda: o navegador do jogador some sem fechar a conexão; depois ele volta pela mesma conta
  leaver.browser.process()?.kill('SIGKILL');
  browsers.splice(browsers.indexOf(leaver.browser), 1);
  await wait(3000);
  await shot(mate, '04-queda');
  const back = await enter(leaver.username);
  await wait(1500);
  await shot(mate, '05-voltou-retomando');
  await wait(4000);

  // saída voluntária (sai da tela do jogo): voto do time desfalcado
  // "Sair da partida" pelo menu (Esc): a tela do jogo desmonta e fecha a conexão com 1000 (saída voluntária)
  await back.page.keyboard.press('Escape');
  await wait(600);
  const left = await back.page.evaluate(() => {
    // o rótulo é desenhado em canvas (fonte bitmap): "Sair da partida" é sempre o último item
    const item = [...document.querySelectorAll('[role=menu] [role=menuitem]')].at(-1);
    if (item instanceof HTMLElement) item.click();
    return item !== undefined;
  });
  if (!left) throw new Error('o menu do jogo não abriu');
  await wait(2500);
  await shot(mate, '06-voto-do-time');
  await shot(enemy, '07-voto-visto-pelo-adversario');
  await mate.page.keyboard.press('Digit1');
  await wait(1500);
  await shot(mate, '08-bot-entrou-retomando');
  await wait(4000);
  await mate.page.keyboard.down('Tab');
  await shot(mate, '09-placar-com-bot');
  await mate.page.keyboard.up('Tab');
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
}
