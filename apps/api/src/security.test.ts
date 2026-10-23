// SPDX-License-Identifier: GPL-2.0-or-later
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryMailer } from './mail/mailer.js';
import { ALERT_COOLDOWN_MS, BACKUP_MAX_AGE_MS, LOGIN_SPIKE, securityEvent, SecurityWatch } from './security.js';

const quietLog = () => {
  const lines: { level: string; fields: Record<string, unknown>; msg: string }[] = [];
  const at = (level: string) => (fields: Record<string, unknown>, msg: string) => void lines.push({ level, fields, msg });
  return { lines, log: { info: at('info'), warn: at('warn'), error: at('error') } as never };
};

describe('eventos de segurança e alertas (OG-313)', () => {
  it('vocabulário da OWASP: evento:usuário, sem e-mail nem senha; falhas em warn', () => {
    const { lines, log } = quietLog();
    securityEvent(log, 'authn_login_fail', { user: 'joao', ip: '10.0.0.1' });
    securityEvent(log, 'authn_password_change', { user: 'joao', detail: 'reset' });
    expect(lines).toEqual([
      { level: 'warn', fields: { security: 'authn_login_fail', user: 'joao', ip: '10.0.0.1' }, msg: 'authn_login_fail:joao' },
      { level: 'info', fields: { security: 'authn_password_change', user: 'joao', detail: 'reset' }, msg: 'authn_password_change:joao,reset' },
    ]);
  });

  it('pico de falhas de login: um e-mail, e o próximo só depois de 6 h', async () => {
    let now = 0;
    const mailer = new MemoryMailer();
    const watch = new SecurityWatch({ mailer, to: 'po@example.com', log: quietLog().log, domain: 'outgun.test', now: () => now });
    for (let i = 0; i < LOGIN_SPIKE.failures; i++) watch.loginFailed();
    await Promise.resolve();
    expect(mailer.outbox).toHaveLength(0);
    for (let i = 0; i < 20; i++) watch.loginFailed();
    await new Promise((r) => setTimeout(r, 0));
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]).toMatchObject({ to: 'po@example.com', subject: expect.stringContaining('[Outgun outgun.test]') });
    now += ALERT_COOLDOWN_MS + 1;
    for (let i = 0; i <= LOGIN_SPIKE.failures; i++) watch.loginFailed();
    await new Promise((r) => setTimeout(r, 0));
    expect(mailer.outbox).toHaveLength(2);
  });

  it('backup atrasado: alerta com o último registrado; sem registro, conta desde a subida da API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'og313-'));
    let now = Date.parse('2026-10-23T12:00:00Z');
    const mailer = new MemoryMailer();
    const watch = new SecurityWatch({ mailer, to: 'po@example.com', log: quietLog().log, domain: 'outgun.test', now: () => now });
    await watch.check(dir);
    expect(mailer.outbox).toHaveLength(0);
    writeFileSync(join(dir, 'last-backup'), '2026-10-23T11:00:00Z\n');
    now += BACKUP_MAX_AGE_MS - 3_600_000;
    await watch.check(dir);
    expect(mailer.outbox).toHaveLength(0);
    now += 2 * 3_600_000;
    await watch.check(dir);
    expect(mailer.outbox.map((m) => m.subject)).toEqual([expect.stringContaining('Backup do banco atrasado')]);
  });

  it('sem ALERT_EMAIL, só o log', async () => {
    const { lines, log } = quietLog();
    const mailer = new MemoryMailer();
    expect(await new SecurityWatch({ mailer, to: undefined, log, domain: 'x' }).alert('test', 'oi', 'teste')).toBe(false);
    expect(mailer.outbox).toHaveLength(0);
    expect(lines[0]).toMatchObject({ level: 'warn', fields: { alert: 'test' } });
  });
});
