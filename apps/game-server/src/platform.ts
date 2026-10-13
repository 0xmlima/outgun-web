// SPDX-License-Identifier: GPL-2.0-or-later
// Chamadas do game server às rotas internas da API (HMAC, OG-080): por ora, a auditoria da
// moderação (OG-046). Sem API configurada, as ações só vão para o log.
import { signInternalRequest } from '@outgun/tickets';
import type { AuditEntry, ConsolePlayer } from './moderation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Corpo de POST /internal/admin-actions. */
export function auditBody(roomId: string, e: AuditEntry): Record<string, unknown> {
  const who = (p: ConsolePlayer, withIp: boolean) => ({
    name: p.name.slice(0, 32),
    ...(p.account && UUID.test(p.account) ? { accountId: p.account } : {}),
    ...(withIp && p.ip ? { ip: p.ip } : {}),
  });
  return {
    roomId,
    action: e.action,
    actor: who(e.actor, false),
    ...(e.target ? { target: who(e.target, true) } : {}),
    reason: e.reason,
    ...(e.durationSeconds ? { durationSeconds: e.durationSeconds } : {}),
    ...(e.details ? { details: e.details } : {}),
  };
}

export class PlatformClient {
  constructor(
    private readonly apiUrl: string,
    private readonly serverId: string,
    private readonly secret: string,
    private readonly log: (line: string) => void,
  ) {}

  async post(path: string, body: unknown, attempts = 3): Promise<boolean> {
    const text = JSON.stringify(body);
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(this.apiUrl + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...signInternalRequest(this.serverId, this.secret, 'POST', path, text) },
          body: text,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return true;
        if (res.status < 500) {
          this.log(`API ${path}: HTTP ${res.status} ${await res.text()}`);
          return false;
        }
      } catch {
        // tenta de novo
      }
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    this.log(`API ${path}: sem resposta`);
    return false;
  }

  audit(roomId: string, entry: AuditEntry): void {
    void this.post('/internal/admin-actions', auditBody(roomId, entry));
  }
}
