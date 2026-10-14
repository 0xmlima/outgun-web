// SPDX-License-Identifier: GPL-2.0-or-later
// Painel admin (OG-087): um jogador do beta joga; o Admin (seed) vê a sala ao vivo com o jogador,
// silencia e expulsa pelo painel; o jogador cai e a auditoria registra as duas ações.
import { expect, test } from '@playwright/test';
import { registerWithInvite } from './helpers.mjs';

test.skip(
  Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_SEEDED,
  'precisa da conta Admin do seed',
);

const prints = (file) => `../parity/out/prints/og087/${file}`;
const victim = `Alvo${Date.now().toString(36).slice(-4)}`;

test('moderação pelo painel: mute e kick numa sala ao vivo, com auditoria', async ({
  browser,
  baseURL,
}) => {
  // jogador do beta (conta com convite) na sala principal
  const playerCtx = await browser.newContext({ locale: 'pt-BR' });
  await playerCtx.addInitScript(() =>
    localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })),
  );
  const player = await playerCtx.newPage();
  await registerWithInvite(player, baseURL, victim, 'senha-e2e-123');
  await expect(player.locator('.menu')).toContainText(victim);
  await player.goto('/rooms');
  await player.locator('button.menu-item', { hasText: 'Jogar agora' }).click();
  await expect(player.locator('.game')).toHaveAttribute('data-status', 'ready', {
    timeout: 30_000,
  });

  // admin no painel
  const adminCtx = await browser.newContext({
    locale: 'pt-BR',
    viewport: { width: 1280, height: 900 },
  });
  await adminCtx.addInitScript(() =>
    localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })),
  );
  const admin = await adminCtx.newPage();
  await admin.goto('/login');
  await admin.getByLabel('Nome de usuário').fill('Admin');
  await admin.getByLabel('Senha', { exact: true }).fill('outgun-dev');
  await admin.keyboard.press('Enter');
  await expect(admin.locator('.menu')).toContainText('Moderação');
  await admin.locator('button.menu-item', { hasText: 'Moderação' }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  const row = admin.locator('tr', { hasText: victim });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await admin.screenshot({ path: prints('1-salas.png'), fullPage: true });

  await admin.getByLabel('Motivo').fill('teste do painel');
  await row.getByRole('button', { name: 'Silenciar' }).click();
  await expect(admin.getByRole('status')).toHaveText('Feito.', { timeout: 15_000 });
  await expect(row).toContainText('silenciado', { timeout: 10_000 });
  await row.getByRole('button', { name: 'Expulsar' }).click();
  await expect(admin.getByRole('status')).toHaveText('Feito.', { timeout: 15_000 });

  // o kick do original espera 10 s antes de desconectar
  await expect(player.locator('.game')).not.toHaveAttribute('data-status', 'ready', {
    timeout: 30_000,
  });
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  await admin.getByRole('tab', { name: 'Auditoria' }).click();
  const audit = admin.locator('table');
  await expect(audit).toContainText('kick');
  await expect(audit).toContainText('mute');
  await expect(audit.locator('tr', { hasText: 'kick' }).first()).toContainText(victim);
  await admin.screenshot({ path: prints('2-auditoria.png'), fullPage: true });
  // feedback do beta (o teste do fluxo, que roda antes, mandou um de veterano com nota 5)
  await admin.getByRole('tab', { name: 'Feedback' }).click();
  await expect(admin.locator('.stats-section')).toContainText('Fidelidade, veteranos');
  await admin.screenshot({ path: prints('4-feedback.png'), fullPage: true });
  await admin.getByRole('tab', { name: 'Convites' }).click();
  await expect(admin.locator('table')).toContainText(victim);
  await admin.screenshot({ path: prints('5-convites.png'), fullPage: true });
  await admin.getByRole('tab', { name: 'Presets' }).click();
  await expect(admin.locator('table')).toContainText('ranked');
  await admin.screenshot({ path: prints('3-presets.png'), fullPage: true });
  await playerCtx.close();
  await adminCtx.close();
});
