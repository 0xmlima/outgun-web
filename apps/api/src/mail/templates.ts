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
