// SPDX-License-Identifier: GPL-2.0-or-later
// Chamadas do game server às rotas internas da API (HMAC, OG-080): auditoria da moderação (OG-046)
// e heartbeat do registro de salas (OG-086). Sem API, as ações só vão para o log.
import { signInternalRequest } from '@outgun/tickets';
import type { AuditEntry, ConsolePlayer } from './moderation.js';
import type { HostedRoom } from './rooms.js';
import type { DeltaReport, MatchReport } from './match-report.js';

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
    /** `error`: falha ao falar com a API (conta nas métricas); `info`: mudança de estado. */
    private readonly log: (line: string, level?: 'info' | 'error') => void,
  ) {}

  private requests = 0;

  async post(path: string, body: unknown, attempts = 3, quiet = false): Promise<boolean> {
    const text = JSON.stringify(body);
    // correlação com o log da API (OG-102): o mesmo id nas tentativas de um envio
    const reqId = `gs-${this.serverId}-${(++this.requests).toString(36).padStart(6, '0')}`;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(this.apiUrl + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-request-id': reqId, ...signInternalRequest(this.serverId, this.secret, 'POST', path, text) },
          body: text,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return true;
        if (res.status < 500) {
          if (!quiet) this.log(`API ${path}: HTTP ${res.status} ${await res.text()} (${reqId})`, 'error');
          return false;
        }
      } catch {
        // tenta de novo
      }
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    if (!quiet) this.log(`API ${path}: sem resposta (${reqId})`, 'error');
    return false;
  }

  private readonly pending = new Set<Promise<boolean>>();

  /** Envio que a parada do servidor espera terminar (`drain`). */
  private track(p: Promise<boolean>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  /** Espera os envios pendentes (resultados e deltas) por até `ms`. */
  async drain(ms = 5000): Promise<void> {
    await Promise.race([Promise.allSettled([...this.pending]), new Promise((r) => setTimeout(r, ms))]);
  }

  /** Resultado da partida (OG-049); a API ignora reenvios (idempotente por `serverMatchId`). */
  reportMatch(report: MatchReport): void {
    this.track(this.post('/internal/matches', report, 5));
  }

  /** Deltas do ranking de quem saiu ou na troca de mapa (OG-084); idempotente por `deltaId`. */
  reportDeltas(report: DeltaReport): void {
    this.track(this.post('/internal/rating-deltas', report, 5));
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
        if (ok !== up) this.log(ok ? 'registro de salas: heartbeat aceito pela API' : 'registro de salas: API não aceitou o heartbeat', ok ? 'info' : 'error');
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
