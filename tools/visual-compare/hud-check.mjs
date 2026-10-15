// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Proteção visual da UI da partida (OG-265, RN-UI-05): sobe um game server (semente fixa, outgun1, sem
// power-ups nem bots) e o build do cliente, põe dois jogadores numa partida online de verdade e captura a
// tela em estados fixos nas resoluções de referência. O mapa e as naves não são desenhados
// (`__outgunVisualCheck`, variam a cada execução); o HUD, os overlays e as telas sim.
//
//   pnpm visual:check            compara com tools/visual/baseline/ (falha se algo mudou)
//   pnpm visual:update           regrava as referências
//   ... -- --only placar         só as capturas cujo nome contém "placar"
//
// Precisa do build (`pnpm build`) e do Chrome instalado (CHROME_PATH troca o caminho). Saída em
// tools/parity/out/visual/: capturas atuais, imagens de diferença (vermelho = pixel mudou) e relatorio.md.
// Regiões que variam (relógio, ping, FPS) e áreas que um card declara como novas ficam em
// tools/visual/areas.json: `masks` vale sempre; `areas` é do card em andamento e volta a [] no fim.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const BASELINE = `${repo}tools/visual/baseline/`;
const AREAS = `${repo}tools/visual/areas.json`;
const OUT = `${repo}tools/parity/out/visual/`;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GS_PORT = 17750;
const WEB_PORT = 14273;
const SERVER = `ws://localhost:${GS_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
/** Diferença por canal abaixo disto é antialiasing, não mudança. */
const TOLERANCE = 24;

const update = process.argv.includes('--update');
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : '';
const RESOLUTIONS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  // só o tamanho: ligar toque no meio recarrega a página (e o jogador sairia da partida)
  { name: '360x640', width: 360, height: 640 },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(BASELINE, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function up(url, child, name) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`${name} saiu (código ${child.exitCode})`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // ainda subindo
    }
    await wait(250);
  }
  throw new Error(`${name} não respondeu em ${url}`);
}

function start(cmd, args, env, name) {
  const child = spawn(cmd, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[${name}] ${d}`));
  return child;
}

for (const f of ['apps/game-server/dist/main.js', 'apps/web/dist/index.html']) {
  if (!existsSync(repo + f)) throw new Error(`falta ${f}: rode \`pnpm build\``);
}
const children = [
  start(
    process.execPath,
    ['apps/game-server/dist/main.js'],
    {
      PORT: String(GS_PORT),
      HEARTBEAT: '0',
      DEV_TICKETS: '1',
      ROTATION: 'outgun1',
      SEED: '1',
      REPLAYS: '0',
      CASUAL_BOTS_FILL: '0',
      MAX_CONNECTIONS_PER_IP: '0',
      LOG_LEVEL: 'warn',
      // 2 minutos de partida e fim de partida longo; sem power-ups (nascem em lugares aleatórios); vida e
      // energia param em 100 (a regeneração acima disso mudaria os números a cada captura)
      GAMEMOD: [
        'pups_min 0',
        'pups_max 0',
        'time_limit 2',
        'extra_time 0',
        'capture_limit 0',
        'game_end_delay 600',
        'spectating_delay 0',
        'idlekick_time 0',
        'health_regeneration_100_to_200 0',
        'energy_regeneration_100_to_200 0',
      ].join('|'),
    },
    'game-server',
  ),
  start(
    'pnpm',
    [
      '--filter',
      '@outgun/web',
      'exec',
      'vite',
      'preview',
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ],
    {
      CSP_CONNECT_SRC: `${SERVER} http://localhost:${GS_PORT}`,
    },
    'web',
  ),
];
const stop = () => children.forEach((c) => c.exitCode === null && c.kill());
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

const errors = [];
const shots = [];
// um navegador por jogador: aba em segundo plano não desenha quadros e o cliente deixa de responder
const browsers = [];
try {
  await up(`http://localhost:${GS_PORT}/health`, children[0], 'game server');
  await up(WEB, children[1], 'web');

  async function open(name, path) {
    const browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      // render por software: o mesmo resultado em qualquer máquina
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--font-render-hinting=none',
        '--force-color-profile=srgb',
      ],
    });
    browsers.push(browser);
    const [page] = await browser.pages();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.setViewport({ ...RESOLUTIONS[0], deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      globalThis.__outgunVisualCheck = true;
      localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' }));
    });
    await page.goto(WEB + path);
    return page;
  }
  async function resize(page, res) {
    await page.setViewport({ width: res.width, height: res.height, deviceScaleFactor: 1 });
    await wait(600);
  }
  async function shot(page, state, res) {
    const name = `${state}-${res.name}`;
    if (only && !name.includes(only)) return;
    await wait(250);
    const png = await page.screenshot({ type: 'png' });
    shots.push({ name, png });
  }
  async function say(page, text) {
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }

  const ready = (page) => page.waitForSelector('.game[data-status=ready]', { timeout: 30_000 });
  // o time de quem entra sozinho é sorteado pelo RNG da sala, que já andou alguns frames: a Ana entra
  // de novo (página nova, sem rastro no chat) até cair no vermelho, antes de a Bia chegar
  let ana;
  for (let tries = 0; ; tries++) {
    ana = await open('Ana', `/play?server=${encodeURIComponent(SERVER)}&name=Ana`);
    await ready(ana);
    await ana.waitForFunction(() => document.querySelector('[data-me]')?.dataset.me, {
      timeout: 15_000,
    });
    if (
      (await ana.evaluate(() => document.querySelector('[data-me]').dataset.me.split(',')[6])) ===
      '0'
    )
      break;
    if (tries === 10) throw new Error('a Ana não caiu no time vermelho em 10 tentativas');
    await browsers.pop().close();
    await wait(1500);
  }
  await wait(3000); // renasceu
  const bia = await open('Bia', `/play?server=${encodeURIComponent(SERVER)}&name=Bia`);
  await ready(bia);
  await wait(2500); // os dois já nasceram

  for (const res of RESOLUTIONS) {
    await resize(ana, res);
    await shot(ana, 'jogando', res);
    await ana.keyboard.down('Tab');
    await wait(300);
    await shot(ana, 'placar', res);
    await ana.keyboard.up('Tab');
    await ana.keyboard.press('F4');
    await wait(300);
    await shot(ana, 'estatisticas', res);
    await ana.keyboard.press('F4');
    await ana.keyboard.press('F12');
    await wait(300);
    await shot(ana, 'sem-minimapa', res);
    await ana.keyboard.press('F12');
    await ana.keyboard.type('digitando...');
    await wait(300);
    await shot(ana, 'chat-aberto', res);
    await ana.keyboard.press('Escape'); // limpa o texto sem abrir o menu
  }
  // mensagens: duas linhas (mais que isso cai no limite de flood) e as três resoluções logo depois
  await say(bia, 'oi pessoal');
  await say(ana, '.so pro meu time');
  await wait(500);
  for (const res of RESOLUTIONS) {
    await resize(ana, res);
    await shot(ana, 'chat-mensagens', res);
  }
  const spectator = await open(
    'Espectador',
    `/spectate?src=${encodeURIComponent(`${SERVER}/rooms/main/spectate`)}`,
  );
  await spectator.waitForSelector('[data-status=ready]', { timeout: 30_000 });
  await wait(1500);
  for (const res of RESOLUTIONS) {
    await resize(spectator, res);
    await shot(spectator, 'espectador', res);
  }
  // fim de partida: time_limit 2 (conta do momento em que a sala abriu)
  if (!only || 'fim-de-partida'.includes(only)) {
    await ana.waitForSelector('.game[data-game-over="1"]', { timeout: 240_000 });
    await wait(1500);
    for (const res of RESOLUTIONS) {
      await resize(ana, res);
      await shot(ana, 'fim-de-partida', res);
    }
  }
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  stop();
}

// --- comparação (dentro do Chrome: decodifica os PNG num canvas, sem dependências) ---
const areas = JSON.parse(readFileSync(AREAS, 'utf8'));
const regionsFor = (name, key) =>
  Object.entries(areas[key] ?? {})
    .filter(([pattern]) =>
      new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(
        name,
      ),
    )
    .flatMap(([, boxes]) => boxes);

if (update) {
  for (const s of shots) writeFileSync(`${BASELINE}${s.name}.png`, s.png);
  console.log(`${shots.length} referências gravadas em tools/visual/baseline/`);
  if (errors.length) console.log(`erros na página: ${errors.join(' | ')}`);
  process.exit(errors.length ? 1 : 0);
}

const cmp = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await cmp.newPage();
const lines = [
  '# Comparação visual da UI da partida (OG-265)',
  '',
  '| Captura | Pixels diferentes | Resultado |',
  '|---|---:|---|',
];
// a coluna "Pixels diferentes" traz a caixa [x, y, largura, altura] do que mudou (para declarar máscaras)
let failed = 0;
for (const s of shots) {
  const ref = `${BASELINE}${s.name}.png`;
  writeFileSync(`${OUT}${s.name}.png`, s.png);
  if (!existsSync(ref)) {
    lines.push(`| ${s.name} | — | sem referência (rode \`pnpm visual:update\`) |`);
    failed++;
    continue;
  }
  const ignore = [...regionsFor(s.name, 'masks'), ...regionsFor(s.name, 'areas')];
  const result = await page.evaluate(
    async (a, b, ignore, tolerance) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return {
          w: img.width,
          h: img.height,
          data: g.getImageData(0, 0, img.width, img.height).data,
          canvas: c,
          g,
        };
      };
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.w !== y.w || x.h !== y.h) return { changed: -1, diff: null };
      const ignored = (px, py) =>
        ignore.some(([ix, iy, iw, ih]) => px >= ix && px < ix + iw && py >= iy && py < iy + ih);
      const out = x.g.createImageData(x.w, x.h);
      let changed = 0;
      const box = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < x.data.length; i += 4) {
        const px = (i / 4) % x.w;
        const py = Math.floor(i / 4 / x.w);
        const d = Math.max(
          Math.abs(x.data[i] - y.data[i]),
          Math.abs(x.data[i + 1] - y.data[i + 1]),
          Math.abs(x.data[i + 2] - y.data[i + 2]),
        );
        const skip = ignored(px, py);
        const gray = (x.data[i] + x.data[i + 1] + x.data[i + 2]) / 12;
        if (d > tolerance && !skip) {
          changed++;
          box[0] = Math.min(box[0], px);
          box[1] = Math.min(box[1], py);
          box[2] = Math.max(box[2], px);
          box[3] = Math.max(box[3], py);
          out.data.set([255, 0, 0, 255], i);
        } else out.data.set(skip ? [0, 0, 96, 255] : [gray, gray, gray, 255], i);
      }
      x.g.putImageData(out, 0, 0);
      const where = changed ? [box[0], box[1], box[2] - box[0] + 1, box[3] - box[1] + 1] : null;
      return {
        changed,
        where,
        diff: changed ? x.canvas.toDataURL('image/png').split(',')[1] : null,
      };
    },
    readFileSync(ref).toString('base64'),
    s.png.toString('base64'),
    ignore,
    TOLERANCE,
  );
  if (result.diff) writeFileSync(`${OUT}${s.name}.diff.png`, Buffer.from(result.diff, 'base64'));
  const ok = result.changed === 0;
  if (!ok) failed++;
  const count =
    result.changed === -1
      ? 'tamanho diferente'
      : `${result.changed}${result.where ? ` em [${result.where.join(', ')}]` : ''}`;
  lines.push(`| ${s.name} | ${count} | ${ok ? 'igual' : 'MUDOU'} |`);
}
await cmp.close();
if (errors.length) lines.push('', `Erros na página: ${errors.join(' | ')}`);
writeFileSync(`${OUT}relatorio.md`, `${lines.join('\n')}\n`);
console.log(lines.slice(2).join('\n'));
console.log(
  failed
    ? `\n${failed} captura(s) mudaram: veja tools/parity/out/visual/*.diff.png`
    : `\n${shots.length} capturas iguais às referências`,
);
process.exit(failed || errors.length ? 1 : 0);
