// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Compara o cliente web (build servido em WEB_URL, `pnpm --filter @outgun/web preview`) com os prints
// do original gerados por refshots.sh: lado a lado em tools/parity/out/prints/og061/ e % de pixels
// diferentes em relatorio.md. Na vista de uma sala, o replay do original não mostra necessariamente a
// sala (0,0): testa todas e fica com a mais parecida. Uso: node compare.mjs [filtro]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '../parity/out');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';

const only = process.argv[2];
const maps = {
  coliseu: [3, 3, 3],
  '6_askelta': [4, 4, 4],
  sisso: [4, 4, 3],
  arena: [3, 3, 2],
  outgun1: [6, 6, 6],
};
const themes = { default: '', Ice: 'Ice', Grass: 'Grass' };
const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const cmp = await b.newPage();
await cmp.setViewport({ width: 1532, height: 600, deviceScaleFactor: 1 });
await cmp.setContent(
  `<body style="margin:0;background:#222"><canvas id=c width=1532 height=600></canvas></body>`,
);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
mkdirSync(R + '/prints/og061', { recursive: true });

// Diferença: % de pixels com algum canal diferindo > 40 (tolera o desvio de cor da captura).
const diff = (orig, web) =>
  cmp.evaluate(
    async (orig, web) => {
      const load = (src) =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = src;
        });
      const [a, w] = await Promise.all([
        load('data:image/png;base64,' + orig),
        load('data:image/png;base64,' + web),
      ]);
      const c = document.createElement('canvas');
      c.width = 756;
      c.height = 567;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(a, 0, 167, 756, 567, 0, 0, 756, 567);
      const A = x.getImageData(0, 0, 756, 567).data;
      x.drawImage(w, 0, 0);
      const W = x.getImageData(0, 0, 756, 567).data;
      let bad = 0;
      for (let i = 0; i < A.length; i += 4)
        if (
          Math.abs(A[i] - W[i]) > 40 ||
          Math.abs(A[i + 1] - W[i + 1]) > 40 ||
          Math.abs(A[i + 2] - W[i + 2]) > 40
        )
          bad++;
      return (100 * bad) / (756 * 567);
    },
    orig,
    web,
  );

const shot = async (url) => {
  await p.bringToFront(); // aba em segundo plano não recebe requestAnimationFrame
  await p.setViewport({ width: 756, height: 567, deviceScaleFactor: 1 });
  await p.goto(url);
  await p.addStyleTag({ content: '.game-overlay{display:none!important}' });
  await p.waitForSelector('.game[data-status=ready]');
  await new Promise((r) => setTimeout(r, 250));
  return p.screenshot({ encoding: 'base64' });
};

const report = [];
for (const [map, [size, w, h]] of Object.entries(maps))
  for (const [tname, theme] of Object.entries(themes))
    for (const kind of ['sala', 'mapa']) {
      const label = `${map}-${tname}-${kind}`;
      if (only && !label.includes(only)) continue;
      const orig = readFileSync(`${R}/og061-ref/${label}.png`).toString('base64');
      let best = { d: Infinity, web: '', room: '' };
      const rooms =
        kind === 'mapa'
          ? [null]
          : Array.from({ length: w * h }, (_, i) => `${i % w},${Math.floor(i / w)}`);
      for (const room of rooms) {
        const url = `${BASE}/play?map=${map}&theme=${theme}&rooms=${kind === 'mapa' ? size : 1}${room ? `&room=${room}` : ''}`;
        const web = await shot(url);
        const d = await diff(orig, web);
        if (d < best.d) best = { d, web, room: room ?? 'todas' };
      }
      await cmp.evaluate(
        async (orig, web, label) => {
          const c = document.getElementById('c').getContext('2d');
          c.fillStyle = '#222';
          c.fillRect(0, 0, 1532, 600);
          const load = (src) =>
            new Promise((res) => {
              const i = new Image();
              i.onload = () => res(i);
              i.src = src;
            });
          const [a, w] = await Promise.all([
            load('data:image/png;base64,' + orig),
            load('data:image/png;base64,' + web),
          ]);
          c.drawImage(a, 0, 167, 756, 567, 0, 30, 756, 567);
          c.drawImage(w, 776, 30);
          c.fillStyle = '#fff';
          c.font = '16px sans-serif';
          c.fillText('Original (cliente 1.0.3 no oráculo): ' + label, 6, 20);
          c.fillText('Outgun Web', 782, 20);
        },
        orig,
        best.web,
        `${label} (sala ${best.room})`,
      );
      await cmp.screenshot({ path: `${R}/prints/og061/${label}.png` });
      report.push(`| ${map} | ${tname} | ${kind} | ${best.room} | ${best.d.toFixed(2)}% |`);
      console.log(report.at(-1));
    }
writeFileSync(
  `${R}/prints/og061/relatorio.md`,
  ['| Mapa | Tema | Vista | Sala | Pixels diferentes |', '|---|---|---|---|---:|', ...report].join(
    '\n',
  ) + '\n',
);
console.log('erros', errs.slice(0, 5));
await b.close();
