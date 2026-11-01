// SPDX-License-Identifier: GPL-2.0-or-later
// Prancha do número com a medalha (OG-532): ouro, prata e bronze nos 4 estilos sobre as 32 cores
// pessoais, nos dois times, no tamanho do jogo e ampliado 3×. Mesmo desenho do `paintNumber` com
// `medal`: letra metálica (branco no alto) com contorno escuro; o número comum ao lado, para comparar.
//   node tools/visual-compare/medal-number-sheet.mjs [saida.png]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = process.argv[2] ?? 'plan/specs/og-532-prancha-numero-medalha.png';
const fonts = 'apps/web/node_modules/@fontsource';
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(fonts, pkg, 'files', file)).toString('base64')}`;
const FACES = {
  'og-bloco': font('russo-one', 'russo-one-latin-400-normal.woff2'),
  'og-corrida': font('saira-condensed', 'saira-condensed-latin-900-normal.woff2'),
  'og-contorno': font('chakra-petch', 'chakra-petch-latin-700-normal.woff2'),
  'og-estencil': font('saira-stencil-one', 'saira-stencil-one-latin-400-normal.woff2'),
};
const manifest = JSON.parse(readFileSync('apps/web/public/assets/manifest.json', 'utf8'));
const extra = {
  player17: '#262626',
  player18: '#FFA6C9',
  player19: '#9DA8FF',
  player20: '#C2185B',
  player21: '#8DB600',
  player22: '#A8FFC8',
  player23: '#00A86B',
  player24: '#FFCBA4',
  player25: '#4682B4',
  player26: '#FFF3C4',
  player27: '#4A5D23',
  player28: '#8ECDF0',
  player29: '#B8962E',
  player30: '#E0B0FF',
  player31: '#01796F',
  player32: '#C000C0',
};
const colours = [
  ...Array.from(
    { length: 32 },
    (_, i) =>
      manifest.defaultColours[`player${String(i + 1).padStart(2, '0')}`] ??
      extra[`player${String(i + 1).padStart(2, '0')}`],
  ),
];
const medals = [['Ouro', '#FFD700'], ['Prata', '#D9D9D9'], ['Bronze', '#CD7F32']];

const page = `<!doctype html><meta charset="utf-8"><style>${Object.entries(FACES)
  .map(([f, src]) => `@font-face{font-family:${f};src:url(${src})}`)
  .join('')}</style>
<body style="margin:0;background:#0b1020"><canvas id="c"></canvas><script>
const colours = ${JSON.stringify(colours)};
const medals = ${JSON.stringify(medals)};
const STYLES = [
  { id: 'Bloco', font: 'og-bloco', skew: 0, outline: false },
  { id: 'Corrida', font: 'og-corrida', skew: -0.22, outline: false },
  { id: 'Contorno', font: 'og-contorno', skew: 0, outline: true },
  { id: 'Estêncil', font: 'og-estencil', skew: 0, outline: false },
];
const darken = (h, a) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// o mesmo desenho do jogo (paintNumber): sem medalha, contraste automático; com medalha, metálico
function player(x, cx, cy, team, colour, style, text, k, medal) {
  const R = 15 * k;
  x.fillStyle = team; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  x.fillStyle = colour; x.beginPath(); x.arc(cx, cy, R * 2 / 3, 0, 7); x.fill();
  const light = lum(colour) > 0.55;
  const size = R * 1.15; const kk = size / 17;
  let ink = light ? '#111111' : '#FFFFFF';
  const edge = medal ? '#000000' : light ? '#FFFFFF' : '#000000';
  x.save(); x.translate(cx, cy);
  if (medal) { const g = x.createLinearGradient(0, kk - size / 2, 0, kk + size / 2); g.addColorStop(0.1, '#FFFFFF'); g.addColorStop(0.45, medal); g.addColorStop(0.95, darken(medal, 0.45)); ink = g; }
  x.transform(1, 0, style.skew, 1, 0, 0);
  x.font = Math.round(size) + 'px ' + style.font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  if (style.outline) {
    x.lineWidth = 3 * kk; x.strokeStyle = edge; x.strokeText(text, 0, kk);
    x.lineWidth = 1.5 * kk; x.strokeStyle = ink; x.strokeText(text, 0, kk);
  } else {
    x.lineWidth = 2.5 * kk; x.strokeStyle = edge; x.strokeText(text, 0, kk);
    x.fillStyle = ink; x.fillText(text, 0, kk);
  }
  x.restore();
}
(async () => {
  await Promise.all(STYLES.map((s) => document.fonts.load('30px ' + s.font)));
  const teams = ['#FF0000', '#0000FF'];
  const CELL = 40, ROW = 40, LABEL = 150, BIG = 3;
  const sample = [0, 2, 9, 13, 16, 21, 25, 28];
  const W = LABEL + Math.max(colours.length * CELL, sample.length * 4 * BIG * 30) + 20;
  const H = 50 + medals.length * STYLES.length * (2 * ROW + 6) + medals.length * 14 + 40 + STYLES.length * (BIG * 34 + 20);
  const cv = document.getElementById('c'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ddd'; x.font = 'bold 13px system-ui'; x.fillText('Tamanho do jogo: número na cor da medalha sobre as 32 cores, time vermelho e azul (1 no ouro, 7 na prata, 44 no bronze)', 10, 22);
  let y = 40;
  medals.forEach(([name, m], mi) => {
    for (const s of STYLES) {
      x.fillStyle = m; x.font = 'bold 14px system-ui'; x.fillText(name + ' · ' + s.id, 10, y + ROW);
      [0, 1].forEach((t) => colours.forEach((c, i) => player(x, LABEL + i * CELL + CELL / 2, y + t * ROW + ROW / 2, teams[t], c, s, ['1', '7', '44'][mi], 1, m)));
      y += 2 * ROW + 6;
    }
    y += 14;
  });
  y += 10; x.fillStyle = '#ddd'; x.font = 'bold 13px system-ui'; x.fillText('Ampliado ' + BIG + '×: comum, ouro, prata e bronze sobre cores claras e escuras', 10, y + 10); y += 20;
  for (const s of STYLES) {
    x.fillStyle = '#7CFC7C'; x.font = 'bold 14px system-ui'; x.fillText(s.id, 10, y + BIG * 17);
    sample.forEach((ci, j) => [null, ...medals.map((m) => m[1])].forEach((m, q) => {
      player(x, LABEL + (j * 4 + q) * BIG * 30 + BIG * 17, y + BIG * 17, teams[j % 2], colours[ci], s, q === 1 ? '1' : '23', BIG, m);
    }));
    y += BIG * 34 + 20;
  }
  document.title = 'ok';
})();
</script>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 3200, height: 2400 });
  await p.setContent(page);
  await p.waitForFunction(() => document.title === 'ok', { timeout: 20_000 });
  await (await p.$('#c')).screenshot({ path: out });
  console.log(`prancha: ${out}`);
} finally {
  await browser.close();
}
