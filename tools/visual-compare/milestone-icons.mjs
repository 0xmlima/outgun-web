// SPDX-License-Identifier: GPL-2.0-or-later
// Ícones das conquistas da Steam (OG-395/397): um PNG 256×256 desbloqueado e um bloqueado (cinza) por
// marco, públicos e secretos, a partir do SVG de `@outgun/content` (o mesmo do perfil), e a tabela
// para o cadastro no Steamworks (`achievements.md` ao lado da pasta). Falha se faltar símbolo.
// Uso: corepack pnpm --filter @outgun/content build && node tools/visual-compare/milestone-icons.mjs [pasta]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  MILESTONE_ICON_SYMBOLS,
  MILESTONES,
  milestoneIconSpec,
  milestoneIconSvg,
  steamAchievementName,
} from '../../packages/content/dist/index.js';
import { SECRET_ICON_SYMBOLS, SECRET_MILESTONES } from '../../packages/content/dist/secret.js';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.argv[2] ?? 'apps/desktop/steam/achievements';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const all = [
  ...MILESTONES.map((m) => ({
    id: m.id,
    spec: milestoneIconSpec(m.id, m.group, MILESTONE_ICON_SYMBOLS[m.id]),
    ok: Boolean(MILESTONE_ICON_SYMBOLS[m.id]),
  })),
  ...SECRET_MILESTONES.map((m) => ({
    id: m.id,
    spec: milestoneIconSpec(m.id, m.group, SECRET_ICON_SYMBOLS[m.id]),
    ok: Boolean(SECRET_ICON_SYMBOLS[m.id]),
  })),
];
const missing = all.filter((x) => !x.ok).map((x) => x.id);
if (missing.length > 0) {
  console.error(`marcos sem símbolo: ${missing.join(', ')}`);
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });
  for (const { id, spec } of all) {
    for (const locked of [false, true]) {
      await page.setContent(
        `<html><body style="margin:0">${milestoneIconSvg(spec, { locked })}</body></html>`,
      );
      const file = join(OUT, `${steamAchievementName(id)}${locked ? '_locked' : ''}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 256, height: 256 } });
    }
  }
  console.log(`${all.length} marcos, ${all.length * 2} PNGs em ${OUT}`);
  const cell = (x) => String(x).replace(/\|/g, '\\|');
  const rows = [...MILESTONES, ...SECRET_MILESTONES].map((m) => {
    const name = steamAchievementName(m.id);
    return `| ${name} | ${cell(m.name.en)} | ${cell(m.description.en)} | ${cell(m.name['pt-BR'])} | ${cell(m.description['pt-BR'])} | ${m.group === 'secret' ? 'sim' : ''} | ${name}.png / ${name}_locked.png |`;
  });
  const table = join(dirname(OUT), 'achievements.md');
  writeFileSync(
    table,
    [
      '# Conquistas da Steam (OG-397)',
      '',
      'Gerado por `node tools/visual-compare/milestone-icons.mjs` a partir do catálogo de marcos (`@outgun/content`); não editar à mão.',
      'Cadastro no Steamworks (app 663760, Stats & Achievements): API name, nome e descrição em `english` e `brazilian`, *hidden* nos secretos, ícone desbloqueado e bloqueado da pasta `achievements/`.',
      '',
      `${rows.length} conquistas.`,
      '',
      '| API name | Name (english) | Description (english) | Nome (brazilian) | Descrição (brazilian) | Hidden | Ícones |',
      '|---|---|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
  console.log(`tabela em ${table}`);
} finally {
  await browser.close();
}
