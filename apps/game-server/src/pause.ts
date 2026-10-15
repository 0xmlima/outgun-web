// SPDX-License-Identifier: GPL-2.0-or-later
// Pausa do jogo Ranked (OG-260, RN-RKL-15/16, D-45): cada time tem 60 s por jogo em até 3 pedidos;
// só o time que pediu retoma antes do saldo acabar; a retomada sempre passa por 3 s de contagem.
// Tempos em frames de 10 Hz do relógio da sala (`uptimeFrames`), que anda mesmo com o mundo parado.

/** Saldo de pausa de cada time por jogo (60 s). */
export const PAUSE_BALANCE_FRAMES = 600;
/** Pedidos de pausa de cada time por jogo. */
export const PAUSE_REQUESTS = 3;
/** Contagem de retomada (3 s). */
export const RESUME_FRAMES = 30;

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
    return this.cause.reason === 'team' ? Math.ceil(this.balance[this.cause.team] / 10) : 0;
  }

  /** Jogo novo (o saldo vale por jogo, também numa série — D-45). */
  reset(): void {
    this.balance[0] = this.balance[1] = PAUSE_BALANCE_FRAMES;
    this.requests[0] = this.requests[1] = 0;
    this.cause = null;
    this.resumeAt = null;
  }
}
