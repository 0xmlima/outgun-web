// SPDX-License-Identifier: GPL-2.0-or-later
// Fluxo completo do jogador (OG-101): cadastro → lobby → partida (com bots) → fim da partida →
// perfil com a partida no histórico → página da partida → ranking. Os textos do menu ficam num
// span oculto do BitmapText; por isso os testes conferem o conteúdo, não a visibilidade.
import { expect, test } from '@playwright/test';

const name = `E2e${Date.now().toString(36).slice(-7)}`;
const password = 'senha-e2e-123';
const prints = (file) => `../parity/out/prints/og101/${file}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('outgun.prefs'))
      localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' }));
  });
});

const menuItem = (page, label) => page.locator('button.menu-item', { hasText: label });

test('cadastro, partida até o fim, histórico e ranking', async ({ page }) => {
  // 1. Cadastro
  await page.goto('/register');
  await page.getByLabel('Nome de usuário').fill(name);
  await page.getByLabel('E-mail').fill(`${name.toLowerCase()}@outgun.local`);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirmar senha').fill(password);
  await page.keyboard.press('Enter');
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
  await page.keyboard.press('Escape');
  await menuItem(page, 'Sair da partida').click();
  await expect(page).toHaveURL(/\/$/);

  // 5. Perfil: a partida está no histórico e abre a página dela
  await page.goto(`/players/${name}`);
  const matchLink = page.locator('a[href^="/matches/"]').first();
  await expect(matchLink).toBeAttached({ timeout: 20_000 });
  await page.screenshot({ path: prints('4-perfil.png'), fullPage: true });
  await matchLink.click();
  await expect(page).toHaveURL(/\/matches\//);
  await expect(page.locator('body')).toContainText(name);
  await page.screenshot({ path: prints('5-partida.png'), fullPage: true });

  // 6. Ranking da temporada (Casual não pontua, mas a página tem de abrir com a temporada)
  await page.goto('/ranking');
  await expect(page.locator('body')).toContainText('Só partidas ranqueadas contam');
  await page.screenshot({ path: prints('6-ranking.png'), fullPage: true });
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
