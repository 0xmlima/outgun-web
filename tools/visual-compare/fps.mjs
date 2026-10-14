// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Mede quadros por segundo do renderer (requestAnimationFrame por 3 s), inclusive trocando de sala
// (cada sala nova é pintada e vira textura). Uso: node fps.mjs (com o build servido em WEB_URL).
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: (process.env.CHROME_ARGS ?? '--use-angle=metal --enable-gpu --ignore-gpu-blocklist').split(
    ' ',
  ),
});
const p = await b.newPage();
// sair de /play pede confirmação (beforeunload): aceita para ir à próxima medição
p.on('dialog', (d) => void d.accept());
await p.setViewport({ width: 1280, height: 960, deviceScaleFactor: 2 });
for (const [label, url, keys] of [
  ['1 sala, Ice, troca de sala a cada 250 ms', '/play?map=outgun1&theme=Ice&rooms=1', true],
  ['6x6 salas, Ice', '/play?map=outgun1&theme=Ice&rooms=6', false],
  ['1 sala, sem tema', '/play?map=coliseu&theme=&rooms=1', true],
  // OG-062: 32 jogadores com arma no máximo e energia cheia (chega aos 256 foguetes da sim)
  [
    '32 jogadores, 256 foguetes, Metal',
    '/play?map=coliseu&rooms=3&demo=32&stress=1&theme=Metal',
    false,
  ],
  [
    '32 jogadores, 256 foguetes, sem tema',
    '/play?map=coliseu&rooms=3&demo=32&stress=1&theme=',
    false,
  ],
]) {
  await p.goto(BASE + url);
  await p.waitForSelector('.game[data-status=ready]');
  // aquecimento: worker de pintura e pré-pintura das salas vizinhas logo após carregar o mapa
  await new Promise((r) => setTimeout(r, 2000));
  const measure = p.evaluate(
    () =>
      new Promise((res) => {
        const t = [];
        let last = performance.now();
        const end = last + 3000;
        const f = (now) => {
          t.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(f);
          else res(t);
        };
        requestAnimationFrame(f);
      }),
  );
  if (keys)
    for (let i = 0; i < 12; i++) {
      await p.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowDown');
      await new Promise((r) => setTimeout(r, 250));
    }
  const t = (await measure).slice(1).sort((a, b) => a - b);
  const rockets = await p.evaluate(
    () => document.querySelector('.game-host')?.dataset.rockets ?? '-',
  );
  const avg = t.reduce((a, b) => a + b, 0) / t.length;
  console.log(
    `${label}: ${(1000 / avg).toFixed(1)} fps médios, p95 ${t[Math.floor(t.length * 0.95)].toFixed(1)} ms, pior ${t.at(-1).toFixed(1)} ms, foguetes ${rockets}`,
  );
}
await b.close();
