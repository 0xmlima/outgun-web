// SPDX-License-Identifier: GPL-2.0-or-later
// Auxiliares dos testes E2E. Beta fechado (OG-106): o ambiente roda com BETA=1, então o cadastro
// precisa de um convite, criado aqui pelo Admin do seed (senha outgun-dev) pela API.
import { request as playwrightRequest } from '@playwright/test';

/** Gera um convite de um uso; devolve o código. */
export async function createInvite(baseURL, note = 'e2e') {
  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: new URL(baseURL).origin },
  });
  const login = await api.post('/api/auth/login', {
    data: { username: 'Admin', password: 'outgun-dev' },
  });
  if (!login.ok()) throw new Error(`login do Admin: ${login.status()}`);
  const res = await api.post('/api/admin/invites', { data: { count: 1, note } });
  if (!res.ok()) throw new Error(`convite: ${res.status()} ${await res.text()}`);
  const [code] = (await res.json()).codes;
  await api.dispose();
  return code;
}

/** Cadastro pela tela, com o convite no link; termina logado na tela inicial. */
export async function registerWithInvite(page, baseURL, name, password) {
  const code = await createInvite(baseURL, name);
  await page.goto(`/register?invite=${code}`);
  await page.getByLabel('Nome de usuário').fill(name);
  await page.getByLabel('E-mail').fill(`${name.toLowerCase()}@outgun.local`);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirmar senha').fill(password);
  await page.keyboard.press('Enter');
  // a sessão vale quando o cadastro termina e o app volta à tela inicial
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
}
