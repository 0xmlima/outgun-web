// SPDX-License-Identifier: GPL-2.0-or-later
// Partes destes scripts rodam dentro da página (page.evaluate) e usam APIs do navegador.
// Roteiro E2E do OG-081 no cliente web: cadastro → sair → login (com erro antes) → esqueci a senha →
// link do e-mail → nova senha → exclusão da conta. Prints em tools/parity/out/prints/og081-*.png.
// Precisa da API (apps/api) com MAILER=memory DEV_ROUTES=1 WEB_URL=<WEB_URL> e do build servido por
// `vite preview` (que repassa /api para a API). Uso: node auth.mjs
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.WEB_URL ?? 'http://localhost:4173';
const OUT = new URL('../parity/out/prints/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const results = [];
const check = (name, ok, detail = '') =>
  results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? `: ${detail}` : ''}`);

const p = await b.newPage();
p.on('pageerror', (e) => errs.push(String(e)));
p.on(
  'console',
  (m) =>
    m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errs.push(m.text()),
);
await p.setViewport({ width: 960, height: 720 });
await p.goto(BASE + '/');
await p.evaluate(() => localStorage.setItem('outgun.prefs', JSON.stringify({ locale: 'pt-BR' })));

const shot = (name) => p.screenshot({ path: new URL(`og081-${name}.png`, OUT).pathname });
const go = async (path) => {
  await p.goto(BASE + path);
  await p.waitForSelector('.menu');
  await wait(300);
};
/** Texto dos itens do menu (o texto real fica num span oculto do BitmapText). */
const items = () => p.$$eval('.menu-item', (els) => els.map((e) => e.textContent.trim()));
const click = async (label) => {
  const ok = await p.$$eval(
    'button.menu-item',
    (els, label) => {
      const el = els.find((e) => e.textContent.trim().replace(/^\d/, '').trim().startsWith(label));
      el?.click();
      return Boolean(el);
    },
    label,
  );
  if (!ok) throw new Error(`item não encontrado: ${label} (${(await items()).join(' | ')})`);
  await wait(400);
};
const type = async (label, text) => {
  const input = await p.$(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`campo não encontrado: ${label}`);
  await input.click({ clickCount: 3 });
  await input.type(text);
};
const message = () =>
  p.$eval('.menu-message:last-of-type', (e) => e.textContent.trim()).catch(() => '');
const home = async () => {
  await p
    .waitForFunction(() => location.pathname === '/', { timeout: 5000 })
    .catch(async () => {
      throw new Error(
        `não voltou ao início: ${await p.evaluate(() => location.pathname)} "${await message()}"`,
      );
    });
  await wait(400);
  return (await items()).join(' | ');
};

const name = `E2e${String(Date.now()).slice(-6)}`;
const email = `${name.toLowerCase()}@outgun.local`;

// 1. Cadastro
await go('/login');
await click('Criar conta');
await type('Nome de usuário', name);
await type('E-mail', email);
await type('Senha', 'senha-e2e-123');
await type('Confirmar senha', 'senha-e2e-123');
await shot('1-cadastro');
await p.keyboard.press('Enter');
let menu = await home();
check('cadastro entra na hora', menu.includes('Conta') && menu.includes(name), menu);
await shot('2-inicio-logado');

// 2. Conta e sair
await click('Conta');
await shot('3-conta');
check('tela da conta mostra o e-mail só para o dono', (await items()).join(' ').includes(email));
await click('Sair');
menu = await home();
check('sair volta a mostrar Entrar', menu.includes('Entrar'), menu);

// 3. Login: senha errada, depois certa (nome em minúsculas)
await go('/login');
await type('Nome de usuário', name.toLowerCase());
await type('Senha', 'senha-errada');
await p.keyboard.press('Enter');
await wait(800);
const err = await message();
check('senha errada mostra erro genérico', err.includes('Nome de usuário ou senha inválidos'), err);
await shot('4-login-erro');
await type('Senha', 'senha-e2e-123');
await p.keyboard.press('Enter');
menu = await home();
check('login sem diferenciar maiúsculas', menu.includes(name), menu);
await click('Conta');
await click('Sair');
await home();

// 4. Esqueci a senha → e-mail → link
await go('/forgot-password');
await type('Nome de usuário ou e-mail', email.toUpperCase());
await click('Enviar link de recuperação');
await wait(500);
const sent = await message();
check('resposta não revela se a conta existe', sent.startsWith('Se a conta existir'), sent);
await shot('5-esqueci-senha');
const outbox = await (await fetch(`${BASE}/api/dev/mail`)).json();
const mail = outbox.outbox.reverse().find((m) => m.to === email);
check('e-mail de recuperação enviado', Boolean(mail), mail?.subject);
const link = /(https?:\/\/\S+#token=[\w-]+)/.exec(mail?.text ?? '')?.[1];
check(
  'link aponta para /reset-password com token no fragmento',
  Boolean(link),
  link?.replace(/token=.*/, 'token=…'),
);
await p.goto(link);
await p.waitForSelector('.menu');
await wait(300);
check('token sai da barra de endereço', !(await p.evaluate(() => location.href)).includes('token'));
await type('Nova senha', 'senha-nova-456');
await type('Confirmar senha', 'senha-nova-456');
await shot('6-redefinir');
await p.keyboard.press('Enter');
menu = await home();
check('redefinir entra com a nova senha', menu.includes(name), menu);
await p.goto(link);
await p.waitForSelector('.menu');
await type('Nova senha', 'senha-outra-789');
await type('Confirmar senha', 'senha-outra-789');
await p.keyboard.press('Enter');
await wait(800);
const reused = await message();
check('link só funciona uma vez', reused.includes('inválido ou expirou'), reused);

// 5. Exclusão
await go('/account');
await click('Excluir conta');
await type('Senha', 'senha-nova-456');
await shot('7-excluir');
await click('Excluir conta para sempre');
menu = await home();
check('exclusão sai da conta', menu.includes('Entrar'), menu);
await go('/login');
await type('Nome de usuário', name);
await type('Senha', 'senha-nova-456');
await p.keyboard.press('Enter');
await wait(800);
check('conta excluída não entra mais', (await message()).includes('inválidos'));

check('sem erros no console', errs.length === 0, errs.join(' / '));
console.log(results.join('\n'));
await b.close();
process.exit(results.some((r) => r.startsWith('FALHA')) ? 1 : 0);
