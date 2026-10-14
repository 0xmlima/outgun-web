// SPDX-License-Identifier: GPL-2.0-or-later
// Conferência dos tickets de entrada (OG-083): chaves públicas baixadas do JWKS da API e renovadas
// periodicamente; cada ticket abre uma conexão só. Tickets `dev:Nome` só com DEV_TICKETS.
import { guestName } from '@outgun/protocol';
import { fromJwks, ReplayGuard, verifyTicket, type RoomSpawn } from '@outgun/tickets';
import type { KeyObject } from 'node:crypto';
import type { Identity } from './room.js';

export class JwksKeys {
  keys: ReadonlyMap<string, KeyObject> = new Map();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly url: string,
    private readonly log: (text: string) => void = () => {},
  ) {}

  async refresh(): Promise<boolean> {
    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const keys = fromJwks(await res.json());
      if (keys.size === 0) throw new Error('JWKS sem chaves Ed25519');
      this.keys = keys;
      return true;
    } catch (error) {
      this.log(`JWKS ${this.url}: ${(error as Error).message}`);
      return false;
    }
  }

  /** Renova a cada `everyMs` (5 min); enquanto não tiver chaves, tenta a cada 10 s. */
  start(everyMs = 5 * 60_000): void {
    const loop = async () => {
      const ok = await this.refresh();
      this.timer = setTimeout(() => void loop(), ok && this.keys.size > 0 ? everyMs : 10_000);
      this.timer.unref();
    };
    void loop();
  }

  stop(): void {
    clearTimeout(this.timer);
  }
}

export interface TicketAuthOptions {
  /** Chaves públicas atuais (do JWKS). */
  keys?: () => ReadonlyMap<string, KeyObject>;
  /** Aceita `dev:Nome` como convidado (desenvolvimento e testes). */
  devTickets: boolean;
}

/** `spawn`: a API pediu para abrir a sala se ela ainda não existe aqui (OG-086). */
/** `jti`: id do ticket, que a API também registra no log (correlação, OG-102). */
export type IdentifyResult = { ok: true; identity: Identity; spawn?: RoomSpawn; jti?: string } | { ok: false; reason: string };

export class TicketAuth {
  private readonly replay = new ReplayGuard();
  constructor(private readonly options: TicketAuthOptions) {}

  identify(ticket: string, room: string, now = Date.now()): IdentifyResult {
    if (ticket.startsWith('dev:')) {
      if (!this.options.devTickets) return { ok: false, reason: 'dev tickets disabled' };
      const name = ticket.slice(4).trim().slice(0, 32) || 'Convidado';
      return { ok: true, identity: { name: guestName(name), accountId: null } };
    }
    const keys = this.options.keys?.();
    if (!keys) return { ok: false, reason: 'no keys' };
    const result = verifyTicket(ticket, keys, room, now);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!this.replay.claim(result.claims, now)) return { ok: false, reason: 'replayed' };
    const c = result.claims;
    return {
      ok: true,
      identity: { name: c.name, accountId: c.acct ? c.sub : null, clanTag: c.clan, admin: c.admin, ...(c.owner ? { owner: true } : {}), ...(c.rating ? { rating: c.rating } : {}) },
      ...(c.spawn ? { spawn: c.spawn } : {}),
      jti: c.jti,
    };
  }
}
