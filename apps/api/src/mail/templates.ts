// SPDX-License-Identifier: GPL-2.0-or-later
// Modelos de e-mail em pt-BR e inglês (os outros idiomas usam o inglês).
import type { Mail } from './mailer.js';

export type MailLocale = 'pt-BR' | 'en';

export function mailLocale(language: string | undefined): MailLocale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TEXT = {
  'pt-BR': {
    subject: 'Outgun Web: redefinir sua senha',
    hello: (name: string) => `Olá, ${name}.`,
    body: 'Recebemos um pedido para redefinir a senha da sua conta. Use o link abaixo em até 30 minutos; ele só funciona uma vez.',
    action: 'Redefinir senha',
    ignore: 'Se você não pediu, ignore este e-mail: sua senha continua a mesma.',
  },
  en: {
    subject: 'Outgun Web: reset your password',
    hello: (name: string) => `Hi, ${name}.`,
    body: 'We received a request to reset your account password. Use the link below within 30 minutes; it works only once.',
    action: 'Reset password',
    ignore: "If you didn't ask for this, ignore this e-mail: your password stays the same.",
  },
} as const;

export function passwordResetMail(to: string, username: string, link: string, locale: MailLocale): Mail {
  const t = TEXT[locale];
  return {
    to,
    subject: t.subject,
    text: `${t.hello(username)}\n\n${t.body}\n\n${link}\n\n${t.ignore}\n`,
    html:
      `<p>${escape(t.hello(username))}</p><p>${escape(t.body)}</p>` +
      `<p><a href="${escape(link)}">${escape(t.action)}</a></p><p>${escape(t.ignore)}</p>`,
  };
}

const WELCOME = {
  'pt-BR': {
    subject: 'Bem-vindo ao Outgun Web',
    hello: (name: string) => `Olá, ${name}!`,
    body: 'Sua conta está pronta. O Outgun Web é o clássico Outgun de volta, com novidades: joga direto no navegador, sem instalar nada, ou no app para computador, também na Steam.',
    play: 'Jogar agora',
    start: 'Para começar: setas movem, Ctrl atira, Shift corre. Leve a bandeira inimiga até a sua base.',
    modes: [
      ['Casual', 'com power-ups e bots, para se divertir.'],
      ['Ranqueado', 'sem power-ups, conta para o ranking da temporada.'],
      ['Treino', 'ataque, defesa, fuga e captura contra bots, no seu ritmo.'],
    ],
    social: 'Entre num clã ou crie o seu, escolha seu número e acompanhe suas estatísticas no perfil. No celular dá para ver perfil, ranking e clãs; as partidas são no computador.',
    feedback: 'Achou um bug ou teve uma ideia? Use "Enviar feedback" no menu.',
    bye: 'Nos vemos na arena.',
  },
  en: {
    subject: 'Welcome to Outgun Web',
    hello: (name: string) => `Hi, ${name}!`,
    body: 'Your account is ready. Outgun Web is the classic Outgun back, with new features: play right in the browser, nothing to install, or in the desktop app, also on Steam.',
    play: 'Play now',
    start: 'To get started: arrows move, Ctrl shoots, Shift runs. Take the enemy flag to your base.',
    modes: [
      ['Casual', 'power-ups and bots, just for fun.'],
      ['Ranked', 'no power-ups, counts for the season ranking.'],
      ['Training', 'attack, defense, escape and capture against bots, at your own pace.'],
    ],
    social: 'Join a clan or start your own, pick your number and follow your stats on your profile. On your phone you can check your profile, the ranking and clans; matches are played on a computer.',
    feedback: 'Found a bug or have an idea? Use "Send feedback" in the menu.',
    bye: 'See you in the arena.',
  },
} as const;

// Cores do design system (apps/web/src/ui/tokens.css), inline porque os clientes de e-mail ignoram <style>.
const C = { bg: '#0b1020', card: '#121a2b', border: '#2e3d58', text: '#eef2f8', muted: '#a3b0c4', accent: '#5cc8ff', onAccent: '#06121f' };
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const p = (html: string, color: string = C.text) => `<p style="margin:0 0 16px;${FONT};font-size:15px;line-height:1.55;color:${color}">${html}</p>`;

/** Boas-vindas depois do cadastro (D-23: Resend). */
export function welcomeMail(to: string, username: string, webUrl: string, locale: MailLocale): Mail {
  const t = WELCOME[locale];
  const url = escape(webUrl);
  const modes = t.modes
    .map(([name, desc]) => `<li style="margin:0 0 6px"><strong style="color:${C.text}">${escape(name)}:</strong> ${escape(desc)}</li>`)
    .join('');
  const html =
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(t.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:12px">` +
    `<tr><td style="padding:24px 28px 8px;${FONT};font-size:22px;font-weight:700;letter-spacing:0.5px;color:${C.accent}">OUTGUN WEB</td></tr>` +
    `<tr><td style="padding:16px 28px 8px">` +
    `<h1 style="margin:0 0 16px;${FONT};font-size:20px;line-height:1.3;color:${C.text}">${escape(t.hello(username))}</h1>` +
    p(escape(t.body)) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${C.accent}">` +
    `<a href="${url}" style="display:inline-block;padding:12px 28px;${FONT};font-size:16px;font-weight:700;color:${C.onAccent};text-decoration:none;border-radius:8px">${escape(t.play)}</a>` +
    `</td></tr></table>` +
    p(escape(t.start)) +
    `<ul style="margin:0 0 16px;padding-left:20px;${FONT};font-size:15px;line-height:1.55;color:${C.muted}">${modes}</ul>` +
    p(escape(t.social), C.muted) +
    p(escape(t.feedback), C.muted) +
    p(escape(t.bye)) +
    `</td></tr>` +
    `<tr><td style="padding:8px 28px 24px;${FONT};font-size:13px;color:${C.muted}"><a href="${url}" style="color:${C.accent};text-decoration:none">${escape(webUrl.replace(/^https?:\/\//, ''))}</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
  const text = [
    t.hello(username),
    t.body,
    `${t.play}: ${webUrl}`,
    t.start,
    t.modes.map(([name, desc]) => `- ${name}: ${desc}`).join('\n'),
    t.social,
    t.feedback,
    t.bye,
  ].join('\n\n');
  return { to, subject: t.subject, text: `${text}\n`, html };
}
