// SPDX-License-Identifier: GPL-2.0-or-later
// Eventos de segurança e alertas ao PO (OG-313, OWASP Logging Vocabulary). Os eventos vão para o log
// da API com o campo `security` (ex.: `authn_login_fail`), quem (nome de usuário, nunca e-mail nem
// senha) e o IP. Os alertas saem por e-mail para ALERT_EMAIL, no máximo um por tipo a cada 6 h:
// pico de falhas de login, disco acima de 80% e backup atrasado (o vigia roda a cada 15 min).
import { readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Mailer } from './mail/mailer.js';

export type SecurityEvent =
  | 'authn_login_success'
  | 'authn_login_fail'
  | 'authn_login_lock'
  | 'authn_password_change'
  | 'authn_password_reset_request'
  | 'authz_change'
  | 'user_updated'
  | 'user_deleted';

const WARN: ReadonlySet<SecurityEvent> = new Set(['authn_login_fail', 'authn_login_lock', 'authz_change']);

/** Registra um evento no vocabulário da OWASP: `evento:usuário` na mensagem e os campos à parte. */
export function securityEvent(log: Pick<FastifyBaseLogger, 'info' | 'warn'>, event: SecurityEvent, o: { user?: string | undefined; ip?: string | undefined; detail?: string | undefined } = {}): void {
  const fields = { security: event, ...(o.user ? { user: o.user } : {}), ...(o.ip ? { ip: o.ip } : {}), ...(o.detail ? { detail: o.detail } : {}) };
  const line = `${event}:${o.user ?? '-'}${o.detail ? `,${o.detail}` : ''}`;
  if (WARN.has(event)) log.warn(fields, line);
  else log.info(fields, line);
}

export type AlertKind = 'login_spike' | 'disk' | 'backup' | 'test';
export const ALERT_COOLDOWN_MS = 6 * 60 * 60_000;
/** Pico de falhas de login: mais que isto em 10 minutos (todas as contas e IPs). */
export const LOGIN_SPIKE = { failures: 50, windowMs: 10 * 60_000 };
export const DISK_ALERT_RATIO = 0.8;
/** O backup é diário: mais de 26 h sem um novo é falha. */
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60_000;

export interface SecurityWatchOptions {
  mailer: Mailer;
  /** Para quem vão os alertas; sem ele, só o log. */
  to: string | undefined;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  domain: string;
  now?: () => number;
}

/** Contador de falhas de login e envio dos alertas (com espera por tipo). */
export class SecurityWatch {
  private readonly failures: number[] = [];
  private readonly lastAlert = new Map<AlertKind, number>();

  /** Sem `last-backup` ainda (máquina nova), o atraso conta a partir daqui. */
  private readonly startedAt: number;

  constructor(private readonly o: SecurityWatchOptions) {
    this.startedAt = this.now();
  }

  private now(): number {
    return this.o.now?.() ?? Date.now();
  }

  /** Uma falha de login: no pico, alerta. */
  loginFailed(): void {
    const now = this.now();
    this.failures.push(now);
    while (this.failures.length > 0 && now - this.failures[0]! > LOGIN_SPIKE.windowMs) this.failures.shift();
    if (this.failures.length > LOGIN_SPIKE.failures) {
      void this.alert('login_spike', `${this.failures.length} falhas de login nos últimos 10 minutos`, 'Pode ser alguém testando senhas (credential stuffing). Os bloqueios por conta e por IP continuam valendo; veja os eventos authn_login_fail no log da API.');
    }
  }

  /** Manda o alerta, se o mesmo tipo não saiu nas últimas 6 h; devolve se mandou. */
  async alert(kind: AlertKind, title: string, body: string): Promise<boolean> {
    const now = this.now();
    if (kind !== 'test' && now - (this.lastAlert.get(kind) ?? -Infinity) < ALERT_COOLDOWN_MS) return false;
    this.lastAlert.set(kind, now);
    this.o.log.warn({ alert: kind }, `alerta: ${title}`);
    if (!this.o.to) return false;
    const subject = `[Outgun ${this.o.domain}] ${title}`;
    const text = `${title}\n\n${body}\n\nAlerta automático do servidor (OG-313). O próximo deste tipo só sai daqui a 6 horas.`;
    try {
      await this.o.mailer.send({ to: this.o.to, subject, text, html: `<p><strong>${escape(title)}</strong></p><p>${escape(body)}</p><p style="color:#666">Alerta automático do servidor (OG-313). O próximo deste tipo só sai daqui a 6 horas.</p>` });
      return true;
    } catch (err) {
      this.o.log.error({ err, alert: kind }, 'alerta não enviado');
      return false;
    }
  }

  /** Disco e backup: `statusDir` fica no disco da máquina e tem a hora do último backup bom (`last-backup`). */
  async check(statusDir: string): Promise<void> {
    try {
      const fs = await statfs(statusDir);
      const used = 1 - fs.bavail / fs.blocks;
      if (used > DISK_ALERT_RATIO) await this.alert('disk', `Disco ${Math.round(used * 100)}% cheio`, `Sobram ${gib(fs.bavail * fs.bsize)} GiB. Apague backups e replays antigos ou aumente o disco.`);
      const saved = Date.parse((await readFile(join(statusDir, 'last-backup'), 'utf8').catch(() => '')).trim());
      const last = Number.isFinite(saved) ? saved : this.startedAt;
      if (this.now() - last > BACKUP_MAX_AGE_MS) {
        const since = Number.isFinite(saved) ? `O último é de ${new Date(saved).toISOString()}.` : 'Nenhum backup registrado desde que a API subiu.';
        await this.alert('backup', 'Backup do banco atrasado', `${since} Confira o container backup (docker compose logs backup).`);
      }
    } catch (err) {
      this.o.log.error({ err, statusDir }, 'vigia: pasta de status do backup ilegível');
    }
  }
}

const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
