// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro de teclado do OG-063 na demonstração local: cada ação do "Key summary" e os atalhos do
// navegador que o jogo precisa segurar. Uso: node keys.mjs (com o build servido em WEB_URL).
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 1024, height: 768 });
await p.goto(BASE + '/options'); // para existir uma página "anterior" no histórico
await p.goto(BASE + '/play?demo=1&map=coliseu'); // só o jogador local: nada empurra nem atira nele
await p.waitForSelector('.game[data-status=ready]');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const me = async () => {
  const [rx, ry, x, y, state, dir] = (
    await p.evaluate(() => document.querySelector('.game-host').dataset.me)
  ).split(',');
  return { room: `${rx},${ry}`, x: +x, y: +y, state, dir: +dir };
};
const rockets = () =>
  p.evaluate(() => Number(document.querySelector('.game-host').dataset.rockets));
const toast = () => p.evaluate(() => document.querySelector('.game-toast')?.textContent ?? '');
const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}: ${detail}`);
const hold = async (keys, ms) => {
  for (const k of keys) await p.keyboard.down(k);
  await wait(ms);
  for (const k of [...keys].reverse()) await p.keyboard.up(k);
  await wait(150);
};

await wait(600);
let a = await me();
await hold(['ArrowRight'], 700);
let c = await me();
check('Seta direita move', c.x > a.x && c.dir === 0, `x ${a.x} -> ${c.x}, arma ${c.dir}`);
a = c;
await hold(['Numpad8'], 700);
c = await me();
check('Numpad 8 move para cima', c.y < a.y && c.dir === 6, `y ${a.y} -> ${c.y}, arma ${c.dir}`);
a = await me();
await hold(['ArrowDown'], 500);
const walk = (await me()).y - a.y;
a = await me();
await hold(['ShiftLeft', 'ArrowDown'], 500);
const run = (await me()).y - a.y;
check('Shift corre', run > walk, `andando ${walk}, correndo ${run}`);
a = await me();
await hold(['AltLeft', 'ArrowLeft'], 500);
c = await me();
check(
  'Alt esquiva (arma não gira)',
  c.x < a.x && c.dir === a.dir,
  `x ${a.x} -> ${c.x}, arma ${a.dir} -> ${c.dir}`,
);
check(
  'Alt+← não volta a página',
  (await p.evaluate(() => location.pathname)) === '/play',
  await p.evaluate(() => location.pathname),
);
await hold(['ArrowUp'], 150); // mira para o meio da sala (perto da parede o foguete some na hora)
await p.keyboard.down('ControlLeft');
await wait(250);
const shots = await rockets();
await p.keyboard.press('ArrowUp'); // Ctrl+seta com o tiro apertado
await p.keyboard.up('ControlLeft');
check('Ctrl atira', shots > 0, `${shots} foguetes`);
for (const [key, label, mod] of [
  ['F1', 'In-game help'],
  ['F2', 'Map list'],
  ['F3', 'Team stats'],
  ['F4', 'Player stats'],
  ['F5', 'Server info'],
  ['F8', 'Vote map change'],
  ['Insert', 'Show more messages'],
  ['F6', 'Toggle names'],
  ['F9', 'Screenshot'],
  ['End', 'Change team', 'ControlLeft'],
  ['KeyM', 'Toggle sound', 'ControlLeft'],
]) {
  if (mod) await p.keyboard.down(mod);
  await p.keyboard.press(key);
  if (mod) await p.keyboard.up(mod);
  await wait(80);
  const text = await toast();
  check(`${mod ? 'Ctrl+' : ''}${key}`, text.startsWith(label), text);
}
await hold(['PageDown'], 200);
check(
  'Page Down (largar bandeira)',
  true,
  'tecla segurada vai para setDropKey (sem bandeira nesta demo)',
);
await p.keyboard.press('Delete');
await wait(400);
check('Delete = suicídio', (await me()).state === 'morto', (await me()).state);
await p.keyboard.press('Escape');
await wait(200);
check(
  'Esc abre o menu',
  (await p.evaluate(() => document.querySelector('.menu-caption')?.textContent)) === 'Outgun',
  'menu',
);
console.log(results.join('\n'));
console.log('erros', errs);
await b.close();
