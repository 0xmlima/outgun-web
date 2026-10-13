// SPDX-License-Identifier: GPL-2.0-or-later
// Chamadas do game server às rotas internas da API (HMAC, OG-080): auditoria da moderação (OG-046)
// e heartbeat do registro de salas (OG-086). Sem API, as ações só vão para o log.
import { signInternalRequest } from '@outgun/tickets';
import type { AuditEntry, ConsolePlayer } from './moderation.js';
import type { HostedRoom } from './rooms.js';

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

export interface ServerInfo {
  /** Endereço público (ws:// ou wss://) por onde os jogadores chegam a este servidor. */
  wsBaseUrl: string;
  region: string;
  maxRooms: number;
}

/** Corpo de POST /internal/rooms/heartbeat. */
export function heartbeatBody(server: ServerInfo, rooms: readonly HostedRoom[]): Record<string, unknown> {
  const base = server.wsBaseUrl.replace(/\/$/, '');
  return { server: { ...server, wsBaseUrl: base }, rooms: rooms.map((r) => ({ ...r, map: r.map.slice(0, 64), wsUrl: `${base}/rooms/${r.id}` })) };
}

export class PlatformClient {
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly apiUrl: string,
    private readonly serverId: string,
    private readonly secret: string,
    private readonly log: (line: string) => void,
  ) {}

  async post(path: string, body: unknown, attempts = 3, quiet = false): Promise<boolean> {
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
          if (!quiet) this.log(`API ${path}: HTTP ${res.status} ${await res.text()}`);
          return false;
        }
      } catch {
        // tenta de novo
      }
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    if (!quiet) this.log(`API ${path}: sem resposta`);
    return false;
  }

  audit(roomId: string, entry: AuditEntry): void {
    void this.post('/internal/admin-actions', auditBody(roomId, entry));
  }

  /**
   * Heartbeat a cada `everyMs` (3 s): a API tira do lobby a sala sem heartbeat por 10 s. Uma
   * tentativa por vez, sem repetição (o próximo heartbeat já é a nova tentativa).
   */
  startHeartbeat(server: ServerInfo, rooms: () => readonly HostedRoom[], everyMs = 3000): void {
    let busy = false;
    let up: boolean | undefined;
    const beat = async () => {
      if (busy) return;
      busy = true;
      try {
        const ok = await this.post('/internal/rooms/heartbeat', heartbeatBody(server, rooms()), 1, true);
        // só a mudança vai para o log (sem API, no desenvolvimento, falharia a cada 3 s)
        if (ok !== up) this.log(ok ? 'registro de salas: heartbeat aceito pela API' : 'registro de salas: API não aceitou o heartbeat');
        up = ok;
      } finally {
        busy = false;
      }
    };
    void beat();
    this.heartbeat = setInterval(() => void beat(), everyMs);
    this.heartbeat.unref();
  }

  stopHeartbeat(): void {
    clearInterval(this.heartbeat);
  }
}
