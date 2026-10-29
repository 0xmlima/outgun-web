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

/** Dados do aviso da OutCup (os mesmos da notificação). */
export interface CupMailData {
  cup?: string;
  cupEvent: string;
  partner?: string;
  opponent?: string;
  matchId?: string;
  at?: string;
  won?: boolean;
  bye?: boolean;
  resolution?: string;
}

type CupText = CupMailData & { title: string; when: string };

const MONTHS = {
  'pt-BR': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
} as const;

/** "OutCup · Dezembro 2026" a partir de `AAAA-MM`. */
export function cupTitle(edition: string | undefined, locale: MailLocale): string {
  const [y, m] = (edition ?? '').split('-').map(Number);
  const month = m ? MONTHS[locale][m - 1] : undefined;
  return month ? `OutCup · ${month[0]!.toUpperCase()}${month.slice(1)} ${y}` : 'OutCup';
}

/** Data e hora no horário de Brasília, como os jogadores combinam (RN-CUP-08). */
function brasilia(iso: string | undefined, locale: MailLocale): string {
  if (!iso) return '';
  const text = new Date(iso).toLocaleString(locale === 'pt-BR' ? 'pt-BR' : 'en-GB', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return locale === 'pt-BR' ? `${text} (Brasília)` : `${text} (Brasília time)`;
}

const CUP_TEXT = {
  'pt-BR': {
    hello: (name: string) => `Olá, ${name}.`,
    open: 'Abrir a OutCup',
    off: 'Para não receber mais estes e-mails, desligue "E-mails da OutCup" na sua conta.',
    events: {
      registration_open: (d: CupText) => ['Inscrições abertas', `As inscrições da ${d.title} estão abertas até o último dia do mês, às 20h (Brasília). Você se inscreve sozinho: o jogo sorteia as duplas.`],
      drawn: (d: CupText) => ['Sua dupla e seu adversário', d.bye ? `Sua dupla${d.partner ? ` com ${d.partner}` : ''} passa direto da primeira fase. O adversário sai do jogo de cima da chave.` : `${d.partner ? `Sua dupla é com ${d.partner}. ` : ''}O próximo adversário é ${d.opponent}. Marquem os horários em que podem jogar na página do confronto.`],
      left_out: () => ['Ficou de fora desta vez', 'O número de inscritos foi ímpar e você foi o último a se inscrever, então ficou fora do sorteio. Até a próxima edição!'],
      cancelled: () => ['Edição cancelada', 'A edição não teve o mínimo de 4 duplas (8 inscritos) e foi cancelada. As inscrições da próxima abrem no dia 20.'],
      proposed: (d: CupText) => ['Horário proposto', `${d.opponent} propôs jogar em ${d.when}. Aceite ou recuse na página do confronto.`],
      declined: (d: CupText) => ['Horário recusado', `${d.opponent} recusou o horário proposto. Proponha outro na página do confronto.`],
      scheduled: (d: CupText) => ['Jogo marcado', `O confronto contra ${d.opponent} está marcado para ${d.when}. A sala abre 15 minutos antes; quem não estiver completo 15 minutos depois do horário perde por W.O.`],
      room_open: (d: CupText) => ['A sala abriu', `A sala do seu confronto (${d.when}) já está aberta. Entre pela página da OutCup.`],
      deadline: (d: CupText) => ['Prazo acabando', `A janela desta fase termina em ${d.when} e o jogo ainda não foi marcado. Marquem os horários: quem não marcar perde por W.O.`],
      result: (d: CupText) => [d.won ? 'Vitória' : 'Fim da campanha', d.won ? `Sua dupla passou de ${d.opponent ?? 'fase'}${d.resolution === 'walkover' ? ' por W.O.' : ''}. Fique de olho no próximo confronto.` : d.resolution === 'double_walkover' ? 'As duas duplas ficaram de fora por W.O.' : `${d.opponent} venceu o confronto${d.resolution === 'walkover' ? ' por W.O.' : ''}. Obrigado por jogar a OutCup!`],
      champion: (d: CupText) => ['Temos campeões', `${d.opponent} venceu a ${d.title}. Veja a chave completa na página da copa.`],
    } as Record<string, (d: CupText) => [string, string]>,
  },
  en: {
    hello: (name: string) => `Hi, ${name}.`,
    open: 'Open OutCup',
    off: 'To stop these e-mails, turn off "OutCup e-mails" in your account.',
    events: {
      registration_open: (d: CupText) => ['Sign-ups are open', `Sign-ups for ${d.title} are open until the last day of the month, 8 pm (Brasília time). You sign up alone: the game draws the pairs.`],
      drawn: (d: CupText) => ['Your pair and your opponent', d.bye ? `Your pair${d.partner ? ` with ${d.partner}` : ''} skips the first round. Your opponent comes from the match above in the bracket.` : `${d.partner ? `You are paired with ${d.partner}. ` : ''}Your next opponent is ${d.opponent}. Mark the hours you can play on the match page.`],
      left_out: () => ['Left out this time', 'The number of sign-ups was odd and you were the last to sign up, so you were left out of the draw. See you next edition!'],
      cancelled: () => ['Edition cancelled', 'The edition did not reach the minimum of 4 pairs (8 sign-ups) and was cancelled. Sign-ups for the next one open on the 20th.'],
      proposed: (d: CupText) => ['Time proposed', `${d.opponent} proposed playing on ${d.when}. Accept or decline on the match page.`],
      declined: (d: CupText) => ['Time declined', `${d.opponent} declined the proposed time. Propose another on the match page.`],
      scheduled: (d: CupText) => ['Match scheduled', `Your match against ${d.opponent} is set for ${d.when}. The room opens 15 minutes before; a pair not complete 15 minutes after the start loses by walkover.`],
      room_open: (d: CupText) => ['The room is open', `The room for your match (${d.when}) is open. Join from the OutCup page.`],
      deadline: (d: CupText) => ['Deadline coming', `This round's window ends on ${d.when} and the match is not scheduled yet. Mark your hours: a pair that does not mark any loses by walkover.`],
      result: (d: CupText) => [d.won ? 'You won' : 'End of the run', d.won ? `Your pair got past ${d.opponent ?? 'the round'}${d.resolution === 'walkover' ? ' by walkover' : ''}. Watch for your next match.` : d.resolution === 'double_walkover' ? 'Both pairs were out by walkover.' : `${d.opponent} won the match${d.resolution === 'walkover' ? ' by walkover' : ''}. Thanks for playing OutCup!`],
      champion: (d: CupText) => ['We have champions', `${d.opponent} won ${d.title}. See the full bracket on the cup page.`],
    } as Record<string, (d: CupText) => [string, string]>,
  },
} as const;

/** Aviso da OutCup por e-mail (OG-527, RN-CUP-12), no visual do e-mail de boas-vindas. */
export function cupMail(to: string, username: string, data: CupMailData, webUrl: string, locale: MailLocale): Mail {
  const t = CUP_TEXT[locale];
  const title = cupTitle(data.cup, locale);
  const [heading, body] = (t.events[data.cupEvent] ?? t.events.drawn!)({ ...data, title, when: brasilia(data.at, locale) });
  const link = `${webUrl.replace(/\/$/, '')}/outcup${data.cup ? `/${data.cup}` : ''}${data.matchId ? `?confronto=${data.matchId}` : ''}`;
  const url = escape(link);
  const subject = `${title}: ${heading}`;
  const html =
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:12px">` +
    `<tr><td style="padding:24px 28px 8px;${FONT};font-size:22px;font-weight:700;letter-spacing:0.5px;color:${C.accent}">${escape(title.toUpperCase())}</td></tr>` +
    `<tr><td style="padding:16px 28px 8px">` +
    `<h1 style="margin:0 0 16px;${FONT};font-size:20px;line-height:1.3;color:${C.text}">${escape(heading)}</h1>` +
    p(escape(t.hello(username))) +
    p(escape(body)) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${C.accent}">` +
    `<a href="${url}" style="display:inline-block;padding:12px 28px;${FONT};font-size:16px;font-weight:700;color:${C.onAccent};text-decoration:none;border-radius:8px">${escape(t.open)}</a>` +
    `</td></tr></table>` +
    p(escape(t.off), C.muted) +
    `</td></tr></table></td></tr></table></body></html>`;
  const text = [t.hello(username), heading, body, `${t.open}: ${link}`, t.off].join('\n\n');
  return { to, subject, text: `${text}\n`, html };
}
