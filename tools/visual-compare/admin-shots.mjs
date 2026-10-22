// SPDX-License-Identifier: GPL-2.0-or-later
// Partes deste script rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Capturas da tela de moderação (OG-388) no ambiente de desenvolvimento (`pnpm dev:all`), logado
// como Admin: presets (lista, novo preset), rotações e papéis, em 1920×1080 e 1280×720.
// Uso: node tools/visual-compare/admin-shots.mjs [pasta] (WEB_URL, padrão http://localhost:5173)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = process.argv[2] ?? 'tools/parity/out/admin';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--lang=pt-BR'],
});
try {
  const page = await browser.newPage();
  // jogo em português, como o PO vê
  await page.evaluateOnNewDocument(() =>
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR'] }),
  );
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const login = await page.evaluate(
    async () =>
      (
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'Admin', password: 'outgun-dev' }),
          credentials: 'include',
        })
      ).status,
  );
  if (login !== 200) throw new Error(`login falhou: ${login}`);
  // rótulos em português ou inglês (o idioma vem das opções da conta)
  const tab = async (...labels) => {
    const buttons = await page.$$('[role=tab]');
    for (const b of buttons)
      if (labels.includes(await b.evaluate((e) => e.textContent?.trim()))) return b.click();
    throw new Error(`aba não encontrada: ${labels[0]}`);
  };
  const button = async (...labels) => {
    for (const label of labels) {
      const [b] = await page.$$(`xpath/.//button[normalize-space(.)='${label}']`);
      if (b) return b.click();
    }
    throw new Error(`botão não encontrado: ${labels[0]}`);
  };
  for (const [w, h] of [
    [1920, 1080],
    [1280, 720],
  ]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2' });
    await tab('Presets');
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/presets-${w}.png` });
    await button('Novo preset', 'New preset');
    await new Promise((r) => setTimeout(r, 300));
    // marca duas regras para ver o estado "alterado"
    const boxes = await page.$$('.admin-rule-head input');
    await boxes[0]?.click();
    await boxes[2]?.click();
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: `${OUT}/preset-novo-${w}.png` });
    await tab('Rotações', 'Map rotations');
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${OUT}/rotacoes-${w}.png` });
    await tab('Papéis', 'Roles');
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: `${OUT}/papeis-${w}.png` });
    // as outras abas, para conferir que nada quebrou com a página larga
    for (const [pt, en] of [
      ['Salas ao vivo', 'Live rooms'],
      ['Denúncias', 'Reports'],
      ['Clãs', 'Clans'],
      ['Bans', 'Bans'],
      ['Auditoria', 'Audit log'],
      ['Mapas', 'Maps'],
      ['Convites', 'Invites'],
      ['Feedback', 'Feedback'],
      ['Rede', 'Network'],
    ]) {
      await tab(pt, en);
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: `${OUT}/aba-${en.replace(/ /g, '-').toLowerCase()}-${w}.png` });
    }
  }
  console.log(`capturas em ${OUT}`);
} finally {
  await browser.close();
}
