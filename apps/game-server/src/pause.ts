// SPDX-License-Identifier: GPL-2.0-or-later
// Pausa do jogo Ranked (OG-260, RN-RKL-15/16, D-45): cada time tem 60 s por jogo em até 3 pedidos;
// só o time que pediu retoma antes do saldo acabar; a retomada sempre passa por 3 s de contagem.
// Queda de conexão (OG-261, RN-RKL-17, D-46): pausa sem gastar saldo; cada um tem o seu prazo e o
// jogo só volta quando não resta ninguém caído. Desconexão permanente (OG-262, RN-RKL-18, D-46): o
// time desfalcado vota em 20 s entre um bot no lugar e seguir com um a menos (maioria; empate = bot).
// Tempos em frames de 10 Hz do relógio da sala (`uptimeFrames`), que anda mesmo com o mundo parado.

/** Saldo de pausa de cada time por jogo (60 s). */
export const PAUSE_BALANCE_FRAMES = 600;
/** Pedidos de pausa de cada time por jogo. */
export const PAUSE_REQUESTS = 3;
/** Contagem de retomada (3 s). */
export const RESUME_FRAMES = 30;
/** Prazo de reconexão no Ranked (120 s, D-46). */
export const RANKED_RECONNECT_FRAMES = 1200;
/** Voto do bot substituto (20 s, D-46). */
export const VOTE_FRAMES = 200;

export type PauseRefusal = 'busy' | 'noBalance' | 'noRequests' | 'notPaused' | 'notYours';

export interface PauseCause {
  reason: 'team' | 'drop' | 'vote';
  team: 0 | 1;
  /** Quem pediu, caiu ou saiu; −1 = ninguém. */
  by: number;
}

/** Voto do time desfalcado sobre a vaga de `pid`. */
export interface SubstituteVote {
  pid: number;
  team: 0 | 1;
  /** Quem vota (humanos do time presentes quando o voto abriu). */
  voters: Set<number>;
  ballots: Map<number, boolean>;
  /** Fim do voto; null enquanto espera outro voto acabar. */
  deadline: number | null;
}

/** Resultado de um voto: `bot` = bot no lugar de `pid`; senão, o time segue com um a menos. */
export interface VoteResult {
  pid: number;
  team: 0 | 1;
  bot: boolean;
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
  /** Votos de bot substituto, um de cada vez (o primeiro é o aberto). */
  readonly votes: SubstituteVote[] = [];

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
    if (this.votes.length === 0) this.cause = this.dropCause();
  }

  /** `pid` não está mais caído nem em voto (voltou ou saiu de vez): sem mais nada pendente, contagem de retomada. */
  undrop(pid: number, now: number): void {
    const dropped = this.drops.delete(pid);
    const i = this.votes.findIndex((v) => v.pid === pid);
    if (i !== -1) this.votes.splice(i, 1);
    if (dropped || i !== -1) this.refresh(now);
  }

  /** Desconexão permanente de `pid` (RN-RKL-18): abre o voto do time (ou entra na fila) e segue pausado. */
  depart(pid: number, team: 0 | 1, voters: readonly number[], now: number): void {
    this.drops.delete(pid);
    this.votes.push({ pid, team, voters: new Set(voters), ballots: new Map(), deadline: null });
    this.refresh(now);
  }

  /** Voto de `voter` (só quem vota no voto aberto); false se não conta. */
  cast(voter: number, bot: boolean): boolean {
    const v = this.votes[0];
    if (!v || v.deadline === null || !v.voters.has(voter)) return false;
    v.ballots.set(voter, bot);
    return true;
  }

  /** Votos do voto aberto: [bot, um a menos]. */
  tally(): [number, number] {
    const ballots = [...(this.votes[0]?.ballots.values() ?? [])];
    return [ballots.filter((b) => b).length, ballots.filter((b) => !b).length];
  }

  /** Voto aberto que terminou (prazo ou todos votaram); maioria, empate ou ninguém = bot (D-46). */
  decide(now: number): VoteResult | null {
    const v = this.votes[0];
    if (!v || v.deadline === null) return null;
    if (now < v.deadline && [...v.voters].some((p) => !v.ballots.has(p))) return null;
    const [bot, short] = this.tally();
    this.votes.shift();
    this.refresh(now);
    return { pid: v.pid, team: v.team, bot: bot >= short };
  }

  /** Quem vota saiu: não espera mais pelo voto dele. */
  removeVoter(pid: number): void {
    for (const v of this.votes) v.voters.delete(pid);
  }

  /** Volta do jogador substituído pelo bot (RN-RKL-18): pausa só para a contagem de 3 s. */
  brief(team: 0 | 1, by: number, now: number): void {
    if (this.cause) return;
    this.cause = { reason: 'drop', team, by };
    this.resumeAt = now + RESUME_FRAMES;
  }

  /** Motivo da pausa depois de uma mudança: voto aberto, depois caídos; sem nada pendente, contagem. */
  private refresh(now: number): void {
    const v = this.votes[0];
    if (v) {
      if (v.deadline === null) v.deadline = now + VOTE_FRAMES;
      this.cause = { reason: 'vote', team: v.team, by: v.pid };
      this.resumeAt = null;
    } else if (this.drops.size > 0) {
      this.cause = this.dropCause();
      this.resumeAt = null;
    } else if (this.cause && this.cause.reason !== 'team' && this.resumeAt === null) this.resumeAt = now + RESUME_FRAMES;
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
    if (this.cause.reason === 'vote') return Math.max(0, Math.ceil(((this.votes[0]?.deadline ?? now) - now) / 10));
    return Math.max(0, Math.ceil(((this.drops.get(this.cause.by)?.deadline ?? now) - now) / 10));
  }

  /** Jogo novo (o saldo vale por jogo, também numa série — D-45). */
  reset(): void {
    this.balance[0] = this.balance[1] = PAUSE_BALANCE_FRAMES;
    this.requests[0] = this.requests[1] = 0;
    this.cause = null;
    this.resumeAt = null;
    this.drops.clear();
    this.votes.length = 0;
  }
}
