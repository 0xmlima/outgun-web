// SPDX-License-Identifier: GPL-2.0-or-later
// Validação das mensagens do cliente: ordem dos inputs, valores e limite de taxa por tipo
// (plan/specs/entrada-servidor.md). Quem passa do limite ou manda algo inválido é expulso por
// `client_misbehavior`, como no original.
import type { AnyMessage } from '@outgun/protocol';

/** Frame do cliente aceito: mais novo ou o mesmo, na janela de 128 de um contador de 8 bits. */
export function isNewerOrSame(last: number, incoming: number): boolean {
  return ((incoming - last) & 255) < 128;
}

interface Limit {
  /** Fichas por segundo. */
  readonly rate: number;
  readonly burst: number;
}

const LIMITS: Readonly<Partial<Record<AnyMessage['type'], Limit>>> = {
  input: { rate: 30, burst: 60 },
  fire: { rate: 20, burst: 40 },
  dropFlag: { rate: 20, burst: 40 },
  suicide: { rate: 2, burst: 6 },
  changeTeam: { rate: 2, burst: 6 },
  minimapBandwidth: { rate: 2, burst: 6 },
  clientReady: { rate: 2, burst: 6 },
};
const DEFAULT_LIMIT: Limit = { rate: 5, burst: 15 };

/** Mensagens que o cliente pode mandar depois de entrar (as outras são do servidor ou o `hello`). */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export class InputGuard {
  private readonly tokens = new Map<string, number>();

  /** Recarga de um tick (0,1 s). */
  tick(): void {
    for (const [type, value] of this.tokens) {
      const limit = LIMITS[type as AnyMessage['type']] ?? DEFAULT_LIMIT;
      this.tokens.set(type, Math.min(limit.burst, value + limit.rate / 10));
    }
  }

  /** Confere uma mensagem do cliente; gasta uma ficha do tipo dela. */
  check(m: AnyMessage): Verdict {
    if (m.type === 'hello') return { ok: false, reason: 'hello repetido' };
    if (m.type === 'input' && m.gundir > 0xfff) return { ok: false, reason: `gundir inválido: ${m.gundir}` };
    const limit = LIMITS[m.type] ?? DEFAULT_LIMIT;
    const available = this.tokens.get(m.type) ?? limit.burst;
    if (available < 1) return { ok: false, reason: `limite de ${m.type} excedido (${limit.rate}/s)` };
    this.tokens.set(m.type, available - 1);
    return { ok: true };
  }
}
