// SPDX-License-Identifier: GPL-2.0-or-later
// E-mail transacional. Sem SMTP: Mailpit (desenvolvimento, caixa local em http://localhost:8025) e
// Resend (produção) por HTTP; "memory" guarda as mensagens (testes e roteiro E2E); "log" só registra.
import type { FastifyBaseLogger } from 'fastify';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class MemoryMailer implements Mailer {
  readonly outbox: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
    if (this.outbox.length > 200) this.outbox.shift();
  }
}

export class LogMailer implements Mailer {
  constructor(private readonly log: Pick<FastifyBaseLogger, 'info'>) {}
  async send(mail: Mail): Promise<void> {
    // Só o assunto: o corpo tem o link de redefinição, que não deve ir para logs.
    this.log.info({ subject: mail.subject }, 'e-mail não enviado (MAILER=log)');
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`envio de e-mail falhou: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
}

/** API de envio do Mailpit (POST /api/v1/send). */
export class MailpitMailer implements Mailer {
  constructor(
    private readonly baseUrl: string,
    private readonly from: string,
  ) {}
  send(mail: Mail): Promise<void> {
    return post(`${this.baseUrl}/api/v1/send`, {}, {
      From: { Email: this.from, Name: 'Outgun Web' },
      To: [{ Email: mail.to }],
      Subject: mail.subject,
      Text: mail.text,
      HTML: mail.html,
    });
  }
}

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  send(mail: Mail): Promise<void> {
    return post(
      'https://api.resend.com/emails',
      { authorization: `Bearer ${this.apiKey}` },
      { from: `Outgun Web <${this.from}>`, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html },
    );
  }
}
