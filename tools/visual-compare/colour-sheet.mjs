// SPDX-License-Identifier: GPL-2.0-or-later
// Prancha das cores pessoais (OG-411): cada cor no boneco dos dois times, montado como no jogo
// (máscaras do tema e `combine_sprite`, `apps/web/src/game/render/sprites.ts`) e no desenho sem
// imagem (círculos), sobre um fundo escuro, a grama e o metal. As medalhas do top 3 com o brilho.
//   node tools/visual-compare/colour-sheet.mjs [saida.png]  (lê apps/web/public/assets)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = process.argv[2] ?? 'plan/specs/og-411-prancha-cores.png';
const assets = 'apps/web/public/assets';
const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8'));
const uri = (file) =>
  `data:image/png;base64,${readFileSync(join(assets, file)).toString('base64')}`;
const g = (theme, name) => uri(manifest.graphics[theme].graphics[name].file);

const C = manifest.defaultColours;
const current = Array.from({ length: 16 }, (_, i) => C[`player${String(i + 1).padStart(2, '0')}`]);
const names = [
  'verde',
  'amarelo',
  'branco',
  'magenta',
  'ciano',
  'laranja',
  'vermelho claro',
  'azul claro',
  'verde escuro',
  'cinza',
  'petróleo',
  'roxo',
  'marrom',
  'marinho',
  'vinho',
  'cinza escuro',
];
const added = [
  ['grafite', '#262626'],
  ['rosa', '#FFA6C9'],
  ['lavanda', '#9DA8FF'],
  ['framboesa', '#C2185B'],
  ['abacate', '#8DB600'],
  ['menta', '#A8FFC8'],
  ['jade', '#00A86B'],
  ['pêssego', '#FFCBA4'],
  ['azul-aço', '#4682B4'],
  ['creme', '#FFF3C4'],
  ['verde-musgo', '#4A5D23'],
  ['azul-céu', '#8ECDF0'],
  ['mostarda', '#B8962E'],
  ['lilás', '#E0B0FF'],
  ['pinho', '#01796F'],
  ['fúcsia', '#C000C0'],
];
const medals = [
  ['ouro (1º)', '#FFD700'],
  ['prata (2º)', '#D9D9D9'],
  ['bronze (3º)', '#CD7F32'],
];
const rows = [
  ...current.map((c, i) => [`${i + 1}. ${names[i]}`, c, false, false]),
  ...added.map(([n, c], i) => [`${17 + i}. ${n} (nova)`, c, true, false]),
  ...medals.map(([n, c]) => [n, c, true, true]),
];

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0b1020;font:13px system-ui;color:#ddd">
<canvas id="c"></canvas><script>
const rows = ${JSON.stringify(rows)};
const team = ['${C.team_red_basic}', '${C.team_blue_basic}'];
const src = { base: '${g('Metal', 'player')}', team: '${g('Metal', 'player_team')}', personal: '${g('Metal', 'player_personal')}', grass: '${g('Grass', 'floor_normal1')}', metal: '${g('Metal', 'background')}' };
const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const SZ = 44, ROW = 50, LABEL = 190, CELL = 52;
(async () => {
  const img = Object.fromEntries(await Promise.all(Object.entries(src).map(async ([k, s]) => [k, await load(s)])));
  const px = (im) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 128, 128); return x.getImageData(0, 0, 128, 128); };
  const [B, T, P] = [px(img.base), px(img.team), px(img.personal)];
  const overlay = (d, a, col, sheen) => { const [r, g, b] = rgb(col); for (let i = 0; i < d.length; i += 4) { const k = a[i]; if (!k) continue; let [cr, cg, cb] = [r, g, b]; if (sheen) { const y = Math.floor(i / 4 / 128) / 128, s = Math.max(0, 0.55 - y) * 0.9; cr += (255 - cr) * s; cg += (255 - cg) * s; cb += (255 - cb) * s; } d[i] = (cr * k + d[i] * (256 - k)) >> 8; d[i + 1] = (cg * k + d[i + 1] * (256 - k)) >> 8; d[i + 2] = (cb * k + d[i + 2] * (256 - k)) >> 8; } };
  const sprite = (t, col, sheen) => { const d = new ImageData(new Uint8ClampedArray(B.data), 128, 128); overlay(d.data, P.data, col, sheen); overlay(d.data, T.data, team[t], false); const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').putImageData(d, 0, 0); return c; };
  const bgs = [['fundo escuro', null], ['grama', img.grass], ['metal', img.metal]];
  const W = LABEL + bgs.length * CELL * 4 + 20, H = 40 + rows.length * ROW;
  const cv = document.getElementById('c'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H); x.fillStyle = '#ddd'; x.font = 'bold 13px system-ui';
  bgs.forEach(([n], j) => { x.fillText(n, LABEL + j * CELL * 4 + 6, 16); x.font = '11px system-ui'; x.fillText('tema (vermelho, azul) · sem imagem', LABEL + j * CELL * 4 + 6, 32); x.font = 'bold 13px system-ui'; });
  rows.forEach(([label, col, isNew, sheen], r) => {
    const y0 = 40 + r * ROW;
    x.fillStyle = isNew ? '#7CFC7C' : '#ddd'; x.font = (sheen ? 'bold ' : '') + '13px system-ui'; x.fillText(label, 10, y0 + ROW / 2 + 4);
    x.fillStyle = col; x.fillRect(LABEL - 26, y0 + 15, 16, 16);
    bgs.forEach(([, bg], j) => {
      const x0 = LABEL + j * CELL * 4;
      if (bg) { x.fillStyle = x.createPattern(bg, 'repeat'); } else x.fillStyle = '#101010';
      x.fillRect(x0, y0, CELL * 4, ROW);
      [0, 1].forEach((t) => {
        x.save(); x.translate(x0 + t * CELL + CELL / 2, y0 + ROW / 2); x.rotate(-0.6); x.drawImage(sprite(t, col, sheen), -SZ / 2, -SZ / 2, SZ, SZ); x.restore();
        const cx = x0 + (2 + t) * CELL + CELL / 2, cy = y0 + ROW / 2, R = 15;
        x.fillStyle = team[t]; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
        if (sheen) { const gr = x.createLinearGradient(0, cy - 10, 0, cy + 10); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, col); gr.addColorStop(1, col); x.fillStyle = gr; } else x.fillStyle = col;
        x.beginPath(); x.arc(cx, cy, R * 2 / 3, 0, 7); x.fill();
      });
    });
  });
  document.title = 'ok';
})();
</script>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 1000, height: 2000 });
  await p.setContent(page);
  await p.waitForFunction(() => document.title === 'ok');
  const el = await p.$('#c');
  await el.screenshot({ path: out });
  console.log(`prancha: ${out}`);
} finally {
  await browser.close();
}
