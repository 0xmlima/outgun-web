// SPDX-License-Identifier: GPL-2.0-or-later
// Prancha dos estilos do número (OG-413): os 4 estilos (Bloco, Corrida, Contorno, Estêncil) sobre as
// 32 cores pessoais e as medalhas, nos dois times, no tamanho do jogo (boneco sem imagem, raio 15)
// e ampliados 3×. Contraste automático: número escuro sobre cor clara, branco sobre escura.
//   node tools/visual-compare/number-sheet.mjs [saida.png]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = process.argv[2] ?? 'plan/specs/og-413-prancha-numeros.png';
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
  '#FFD700',
  '#D9D9D9',
  '#CD7F32',
];

const page = `<!doctype html><meta charset="utf-8"><style>${Object.entries(FACES)
  .map(([f, src]) => `@font-face{font-family:${f};src:url(${src})}`)
  .join('')}</style>
<body style="margin:0;background:#0b1020"><canvas id="c"></canvas><script>
const colours = ${JSON.stringify(colours)};
const STYLES = [
  { id: 'Bloco', font: 'og-bloco', skew: 0, outline: false },
  { id: 'Corrida', font: 'og-corrida', skew: -0.22, outline: false },
  { id: 'Contorno', font: 'og-contorno', skew: 0, outline: true },
  { id: 'Estêncil', font: 'og-estencil', skew: 0, outline: false },
];
const NUMBERS = ['7', '10', '44', '88'];
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// o mesmo desenho do jogo: fundo do boneco (anel do time + miolo pessoal) e o número por cima
function player(x, cx, cy, team, colour, style, text, k) {
  const R = 15 * k;
  x.fillStyle = team; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  x.fillStyle = colour; x.beginPath(); x.arc(cx, cy, R * 2 / 3, 0, 7); x.fill();
  const light = lum(colour) > 0.55;
  const ink = light ? '#111111' : '#FFFFFF';
  const edge = light ? '#FFFFFF' : '#000000';
  const size = Math.round(R * 1.15);
  x.save(); x.translate(cx, cy); x.transform(1, 0, style.skew, 1, 0, 0);
  x.font = size + 'px ' + style.font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  if (style.outline) {
    x.lineWidth = Math.max(3, 3 * k); x.strokeStyle = edge; x.strokeText(text, 0, 1);
    x.lineWidth = Math.max(1.5, 1.5 * k); x.strokeStyle = ink; x.strokeText(text, 0, 1);
  } else {
    x.lineWidth = Math.max(2.5, 2.5 * k); x.strokeStyle = edge; x.strokeText(text, 0, 1);
    x.fillStyle = ink; x.fillText(text, 0, 1);
  }
  x.restore();
}
(async () => {
  await Promise.all(STYLES.map((s) => document.fonts.load('30px ' + s.font)));
  const teams = ['#FF0000', '#0000FF'];
  const CELL = 40, ROW = 40, LABEL = 90, BIG = 3;
  const realW = colours.length * CELL;
  const W = LABEL + realW + 20, H = 40 + STYLES.length * (2 * ROW + 14) + 30 + STYLES.length * (BIG * 34 + 20);
  const cv = document.getElementById('c'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ddd'; x.font = 'bold 13px system-ui'; x.fillText('Tamanho do jogo: 32 cores + medalhas, time vermelho e azul (número 10; 88 nas medalhas)', 10, 22);
  let y = 40;
  for (const s of STYLES) {
    x.fillStyle = '#7CFC7C'; x.font = 'bold 14px system-ui'; x.fillText(s.id, 10, y + ROW);
    [0, 1].forEach((t) => colours.forEach((c, i) => player(x, LABEL + i * CELL + CELL / 2, y + t * ROW + ROW / 2, teams[t], c, s, i >= 32 ? '88' : '10', 1)));
    y += 2 * ROW + 14;
  }
  y += 10; x.fillStyle = '#ddd'; x.font = 'bold 13px system-ui'; x.fillText('Ampliado ' + BIG + '×: alguns números em cores claras e escuras', 10, y + 10); y += 20;
  const sample = [0, 2, 21, 25, 16, 13, 32];
  for (const s of STYLES) {
    x.fillStyle = '#7CFC7C'; x.font = 'bold 14px system-ui'; x.fillText(s.id, 10, y + BIG * 17);
    sample.forEach((ci, j) => NUMBERS.forEach((n, m) => { if (m > 1) return; player(x, LABEL + (j * 2 + m) * BIG * 34 + BIG * 17, y + BIG * 17, teams[(j + m) % 2], colours[ci], s, NUMBERS[(j + m) % 4], BIG); }));
    y += BIG * 34 + 20;
  }
  document.title = 'ok';
})();
</script>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 1600, height: 1400 });
  await p.setContent(page);
  await p.waitForFunction(() => document.title === 'ok', { timeout: 20_000 });
  await (await p.$('#c')).screenshot({ path: out });
  console.log(`prancha: ${out}`);
} finally {
  await browser.close();
}
