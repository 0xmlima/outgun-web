// SPDX-License-Identifier: GPL-2.0-or-later
// Pausa do jogo Ranked (OG-260, RN-RKL-15/16, D-45): cada time tem 60 s por jogo em até 3 pedidos;
// só o time que pediu retoma antes do saldo acabar; a retomada sempre passa por 3 s de contagem.
// Queda de conexão (OG-261, RN-RKL-17, D-46): pausa sem gastar saldo; cada um tem o seu prazo e o
// jogo só volta quando não resta ninguém caído.
// Tempos em frames de 10 Hz do relógio da sala (`uptimeFrames`), que anda mesmo com o mundo parado.

/** Saldo de pausa de cada time por jogo (60 s). */
export const PAUSE_BALANCE_FRAMES = 600;
/** Pedidos de pausa de cada time por jogo. */
export const PAUSE_REQUESTS = 3;
/** Contagem de retomada (3 s). */
export const RESUME_FRAMES = 30;
/** Prazo de reconexão no Ranked (120 s, D-46). */
export const RANKED_RECONNECT_FRAMES = 1200;

export type PauseRefusal = 'busy' | 'noBalance' | 'noRequests' | 'notPaused' | 'notYours';

export interface PauseCause {
  reason: 'team' | 'drop';
  team: 0 | 1;
  /** Quem pediu (ou caiu); −1 = ninguém. */
  by: number;
}

export class RankedPause {
  readonly balance: [number, number] = [PAUSE_BALANCE_FRAMES, PAUSE_BALANCE_FRAMES];
  readonly requests: [number, number] = [0, 0];
  /** Pausa em curso (inclusive durante a contagem de retomada); null = jogo correndo. */
  cause: PauseCause | null = null;
  /** Fim da contagem de retomada; null = sem contagem. */
  resumeAt: number | null = null;
  /** Jogadores caídos esperando reconexão: pid → time e fim do prazo. */
  readonly drops = new Map<number, { team: 0 | 1; deadline: number }>();

  /** Mundo parado (pausado ou contando para retomar). */
  get active(): boolean {
    return this.cause !== null;
  }

  get phase(): 'none' | 'paused' | 'resuming' {
    if (!this.cause) return 'none';
    return this.resumeAt === null ? 'paused' : 'resuming';
  }

  /** Pedido de pausa tática do time `team` (RN-RKL-15). */
  request(team: 0 | 1, by: number): PauseRefusal | null {
    if (this.cause) return 'busy';
    if (this.requests[team] >= PAUSE_REQUESTS) return 'noRequests';
    if (this.balance[team] <= 0) return 'noBalance';
    this.requests[team]++;
    this.cause = { reason: 'team', team, by };
    return null;
  }

  /** Pedido de retomada: só o time que pediu, e só antes da contagem (RN-RKL-16). */
  resume(team: 0 | 1, now: number): PauseRefusal | null {
    if (!this.cause || this.resumeAt !== null) return 'notPaused';
    if (this.cause.reason !== 'team' || this.cause.team !== team) return 'notYours';
    this.resumeAt = now + RESUME_FRAMES;
    return null;
  }

  /** Queda de `pid` (RN-RKL-17): pausa na hora, sem saldo; uma pausa do time ou contagem em curso dá lugar a ela. */
  drop(pid: number, team: 0 | 1, deadline: number): void {
    this.drops.set(pid, { team, deadline });
    this.resumeAt = null;
    this.cause = this.dropCause();
  }

  /** `pid` não está mais caído (voltou, saiu ou o prazo acabou): sem ninguém caído, contagem de retomada. */
  undrop(pid: number, now: number): void {
    if (!this.drops.delete(pid) || this.cause?.reason !== 'drop') return;
    if (this.drops.size > 0) this.cause = this.dropCause();
    else this.resumeAt = now + RESUME_FRAMES;
  }

  /** Caídos com o prazo esgotado (desconexão permanente, OG-262); continuam em `drops` até o `undrop`. */
  expired(now: number): number[] {
    return [...this.drops].filter(([, d]) => now >= d.deadline).map(([pid]) => pid);
  }

  /** O caído de prazo mais curto é o que aparece. */
  private dropCause(): PauseCause {
    const [pid, d] = [...this.drops].sort(([, a], [, b]) => a.deadline - b.deadline)[0]!;
    return { reason: 'drop', team: d.team, by: pid };
  }

  /** Um frame da sala: desconta o saldo de quem pediu; true quando a contagem acaba e o jogo volta. */
  tick(now: number): boolean {
    const cause = this.cause;
    if (!cause) return false;
    if (this.resumeAt === null) {
      if (cause.reason === 'team') {
        this.balance[cause.team] = Math.max(0, this.balance[cause.team] - 1);
        if (this.balance[cause.team] === 0) this.resumeAt = now + RESUME_FRAMES;
      }
      return false;
    }
    if (now < this.resumeAt) return false;
    this.cause = null;
    this.resumeAt = null;
    return true;
  }

  /** Segundos mostrados: saldo de quem pediu enquanto pausado; a contagem durante a retomada. */
  seconds(now: number): number {
    if (!this.cause) return 0;
    if (this.resumeAt !== null) return Math.max(0, Math.ceil((this.resumeAt - now) / 10));
    if (this.cause.reason === 'team') return Math.ceil(this.balance[this.cause.team] / 10);
    return Math.max(0, Math.ceil(((this.drops.get(this.cause.by)?.deadline ?? now) - now) / 10));
  }

  /** Jogo novo (o saldo vale por jogo, também numa série — D-45). */
  reset(): void {
    this.balance[0] = this.balance[1] = PAUSE_BALANCE_FRAMES;
    this.requests[0] = this.requests[1] = 0;
    this.cause = null;
    this.resumeAt = null;
    this.drops.clear();
  }
}
