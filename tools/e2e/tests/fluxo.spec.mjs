// SPDX-License-Identifier: GPL-2.0-or-later
// Fluxo completo do jogador (OG-101): cadastro → lobby → partida (com bots) → fim da partida →
// perfil com a partida no histórico → página da partida → ranking. Os textos do menu ficam num
// span oculto do BitmapText; por isso os testes conferem o conteúdo, não a visibilidade.
import { expect, test } from '@playwright/test';
import { adminGet, registerWithInvite } from './helpers.mjs';

const name = `E2e${Date.now().toString(36).slice(-7)}`;
const password = 'senha-e2e-123';
const prints = (file) => `../parity/out/prints/og101/${file}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('outgun.prefs'))
      localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' }));
  });
});

// CSP (OG-104): o cliente roda com os cabeçalhos de produção do `vite preview`; qualquer violação
// derruba o teste
let violations = [];
test.beforeEach(async ({ page }) => {
  violations = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text());
  });
});
test.afterEach(() => {
  expect(violations).toEqual([]);
});

test('o cliente é servido com CSP e cabeçalhos de segurança', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
});

const menuItem = (page, label) => page.locator('button.menu-item', { hasText: label });

test('cadastro com convite, partida até o fim, feedback, histórico e ranking', async ({
  page,
  baseURL,
}) => {
  // 1. Cadastro (beta fechado: com o link do convite)
  await registerWithInvite(page, baseURL, name, password);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.menu')).toContainText(name);

  // 2. Lobby: a sala do game server aparece pelo heartbeat; "Jogar agora" no Casual
  await page.goto('/rooms');
  await expect(page.locator('.menu')).toContainText('Principal', { timeout: 20_000 });
  await page.screenshot({ path: prints('1-lobby.png') });
  await menuItem(page, 'Jogar agora').click();
  await expect(page).toHaveURL(/\/play\?sala=main/);

  // 3. Partida: entra com o ticket da API e joga com os bots
  const game = page.locator('.game');
  await expect(game).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Control');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Control');
  await page.screenshot({ path: prints('2-partida.png') });

  // 4. Fim da partida (time_limit 1): o placar abre sozinho
  await expect(game).toHaveAttribute('data-game-over', '1', { timeout: 120_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: prints('3-fim.png') });

  // 5. Feedback do beta pelo menu do jogo (OG-106): leva a sala e o mapa como contexto
  await page.keyboard.press('Escape');
  await menuItem(page, 'Enviar feedback').click();
  await expect(page).toHaveURL(/\/feedback\?sala=main&mapa=/);
  await page.locator('fieldset').first().getByLabel('5').check();
  await page.getByLabel('Joguei o Outgun original').check();
  await page.getByLabel('Conte mais').fill('A física dos foguetes está igual ao original.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('status')).toHaveText('Obrigado! Seu feedback foi enviado.');
  await page.screenshot({ path: prints('4-feedback.png') });

  // 5. Perfil: a partida está no histórico e abre a página dela
  await page.goto(`/players/${name}`);
  const matchLink = page.locator('a[href^="/matches/"]').first();
  await expect(matchLink).toBeAttached({ timeout: 20_000 });
  await page.screenshot({ path: prints('5-perfil.png'), fullPage: true });
  await matchLink.click();
  await expect(page).toHaveURL(/\/matches\//);
  await expect(page.locator('body')).toContainText(name);
  await page.screenshot({ path: prints('6-partida.png'), fullPage: true });

  // 6. Ranking da temporada (Casual não pontua, mas a página tem de abrir com a temporada)
  await page.goto('/ranking');
  await expect(page.locator('body')).toContainText('Só partidas ranqueadas contam');
  await page.screenshot({ path: prints('7-ranking.png'), fullPage: true });

  // 7. Telemetria de rede (OG-108): ao sair da partida o cliente mandou o resumo anônimo
  await expect
    .poll(async () => {
      const r = await adminGet(baseURL, '/api/admin/network?days=1');
      return r.regions.reduce((n, x) => n + x.reports, 0);
    })
    .toBeGreaterThan(0);
});

test('beta fechado: cadastro sem convite recusado; "Jogar agora" sem conta vai para o login', async ({
  page,
}) => {
  await page.goto('/register');
  await expect(page.getByLabel('Código de convite')).toBeVisible();
  await page.getByLabel('Nome de usuário').fill('SemConvite');
  await page.getByLabel('E-mail').fill('semconvite@outgun.local');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirmar senha').fill(password);
  await page.locator('button.menu-item', { hasText: 'Criar conta' }).click();
  // sem aceitar os termos (OG-107) nem chega à API
  await expect(page.locator('.menu')).toContainText(
    'Aceite os termos de uso e a política de privacidade',
  );
  await page.locator('button.menu-item', { hasText: 'Aceito os termos de uso' }).click();
  await page.locator('button.menu-item', { hasText: 'Criar conta' }).click();
  await expect(page.locator('.menu')).toContainText(
    'O beta fechado precisa de um código de convite.',
  );
  await page.goto('/');
  await menuItem(page, 'Jogar agora').click();
  await expect(page).toHaveURL(/\/login$/);
});

test('termos, privacidade e sobre no rodapé (OG-107)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.shell-footer a', { hasText: 'Privacidade' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('.text-page')).toContainText(
    'O que guardamos, por quê e por quanto tempo',
  );
  await expect(page.locator('.text-page')).toContainText('Identificador aleatório do navegador');
  await page.screenshot({ path: prints('8-privacidade.png'), fullPage: true });
  await page.goto('/terms');
  await expect(page.locator('.text-page')).toContainText('Conduta');
  await page.goto('/about');
  await expect(page.locator('.text-page')).toContainText('Fabiana Cecin');
  await page.screenshot({ path: prints('9-sobre.png'), fullPage: true });
});

test('convidado não entra no Ranked: vai para o login', async ({ page }) => {
  await page.goto('/rooms');
  await expect(page.locator('.menu')).toContainText('Jogar agora');
  await page.locator('button.menu-item', { hasText: 'Modo' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.menu')).toContainText('Ranqueado');
  await menuItem(page, 'Jogar agora').click();
  await expect(page).toHaveURL(/\/login$/);
});
