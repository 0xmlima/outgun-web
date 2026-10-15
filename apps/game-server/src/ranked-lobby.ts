// SPDX-License-Identifier: GPL-2.0-or-later
// Lobby das salas Ranked com formato (OG-252/254, RN-RKL-07/10/11/12/21, D-40/41/43): fases
// lobby → voto → prontos → contagem → jogo → (próximo jogo da série: voto) → fim. Fora do jogo o
// mundo da sala fica parado e ninguém nasce. Tempos em frames de 10 Hz; sorteios pelo `rand`.

export type LobbyPhase = 'lobby' | 'vote' | 'ready' | 'countdown' | 'game' | 'finished';

/** Voto de mapa: termina quando todos votam ou em 30 s (RN-RKL-10). */
export const VOTE_FRAMES = 300;
/** Quem não marca "Pronto" em 60 s depois do voto sai da sala (RN-RKL-21). */
export const READY_FRAMES = 600;
/** Contagem antes de carregar o mapa (RN-RKL-11). */
export const COUNTDOWN_FRAMES = 50;

export interface LobbyMember {
  ready: boolean;
  /** Índice do mapa na rotação da sala (−1 = sem voto). */
  vote: number;
}

export type LobbyEvent =
  | { type: 'phase'; phase: LobbyPhase }
  /** Fim da contagem: carregar `map` e começar o jogo. */
  | { type: 'start'; map: number }
  /** Não marcaram "Pronto" a tempo: saem da sala. */
  | { type: 'kick'; pids: number[] };

/** Mapa escolhido: mais votado; empate → sorteio entre os empatados; sem votos → sorteio na rotação. */
export function tallyVotes(votes: readonly number[], mapCount: number, rand: (n: number) => number): number {
  const counts = new Map<number, number>();
  for (const v of votes) if (v >= 0 && v < mapCount) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (counts.size === 0) return rand(mapCount);
  const best = Math.max(...counts.values());
  const tied = [...counts].filter(([, n]) => n === best).map(([m]) => m).sort((a, b) => a - b);
  return tied[rand(tied.length)] as number;
}

export class RankedLobby {
  phase: LobbyPhase = 'lobby';
  /** Frame em que a fase atual começou. */
  phaseStart = 0;
  /** Mapa escolhido no último voto. */
  chosenMap = -1;
  readonly members = new Map<number, LobbyMember>();
  private events: LobbyEvent[] = [];

  constructor(
    /** Vagas da sala (2 × N). */
    readonly capacity: number,
    private mapCount: number,
    private readonly rand: (n: number) => number,
  ) {}

  /** Sala em jogo ou série acabada: ninguém entra (entre jogos da série a vaga reabre, D-43). */
  get acceptsJoins(): boolean {
    return this.phase !== 'game' && this.phase !== 'finished' && this.members.size < this.capacity;
  }

  /** O mundo da sala só anda no jogo. */
  get playing(): boolean {
    return this.phase === 'game';
  }

  /** Segundos que faltam na fase com prazo (0 = sem prazo). */
  secondsLeft(frame: number): number {
    const limit = this.phase === 'vote' ? VOTE_FRAMES : this.phase === 'ready' ? READY_FRAMES : this.phase === 'countdown' ? COUNTDOWN_FRAMES : 0;
    return limit === 0 ? 0 : Math.max(0, Math.ceil((this.phaseStart + limit - frame) / 10));
  }

  setMapCount(n: number): void {
    this.mapCount = n;
  }

  join(pid: number, frame: number): void {
    this.members.set(pid, { ready: false, vote: -1 });
    if (this.phase === 'countdown') this.to('ready', frame, false);
    this.checkFull(frame);
  }

  /** Saída (ou troca de pid na troca de lado, que não muda a ocupação). */
  leave(pid: number, frame: number): void {
    if (!this.members.delete(pid)) return;
    if (this.phase === 'vote' || this.phase === 'ready' || this.phase === 'countdown') this.to('lobby', frame);
  }

  /** Jogadores mudaram de vaga (troca de lado; pares de/para): mesmo voto e "Pronto"; cancela a contagem. */
  moved(moves: readonly (readonly [from: number, to: number])[], frame: number): void {
    const moving = moves.flatMap(([from, to]) => {
      const m = this.members.get(from);
      return m ? [[to, m] as const] : [];
    });
    for (const [from] of moves) this.members.delete(from);
    for (const [to, m] of moving) this.members.set(to, m);
    if (moving.length > 0) this.sideChanged(frame);
  }

  /** Troca de lado durante a contagem a cancela (RN-RKL-12). */
  sideChanged(frame: number): void {
    if (this.phase === 'countdown') this.to('ready', frame, false);
  }

  vote(pid: number, map: number, frame: number): boolean {
    const m = this.members.get(pid);
    if (!m || this.phase !== 'vote' || map < -1 || map >= this.mapCount) return false;
    m.vote = map;
    if ([...this.members.values()].every((x) => x.vote >= 0)) this.endVote(frame);
    return true;
  }

  setReady(pid: number, ready: boolean, frame: number): boolean {
    const m = this.members.get(pid);
    if (!m || (this.phase !== 'ready' && this.phase !== 'countdown')) return false;
    m.ready = ready;
    if (!ready && this.phase === 'countdown') this.to('ready', frame, false);
    if (this.phase === 'ready' && this.members.size === this.capacity && [...this.members.values()].every((x) => x.ready)) this.to('countdown', frame);
    return true;
  }

  /** Fim de um jogo: série acabada → fim; senão volta ao voto (ou ao lobby, se alguém saiu). */
  gameEnded(seriesOver: boolean, frame: number): void {
    if (this.phase !== 'game') return;
    if (seriesOver) return this.to('finished', frame);
    this.to('lobby', frame);
    this.checkFull(frame);
  }

  tick(frame: number): LobbyEvent[] {
    const elapsed = frame - this.phaseStart;
    if (this.phase === 'vote' && elapsed >= VOTE_FRAMES) this.endVote(frame);
    else if (this.phase === 'ready' && elapsed >= READY_FRAMES) {
      const late = [...this.members].filter(([, m]) => !m.ready).map(([pid]) => pid);
      if (late.length > 0) this.events.push({ type: 'kick', pids: late });
    } else if (this.phase === 'countdown' && elapsed >= COUNTDOWN_FRAMES) {
      this.to('game', frame);
      this.events.push({ type: 'start', map: this.chosenMap });
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  private checkFull(frame: number): void {
    if (this.phase === 'lobby' && this.members.size === this.capacity) this.to('vote', frame);
  }

  private endVote(frame: number): void {
    this.chosenMap = tallyVotes([...this.members.values()].map((m) => m.vote), this.mapCount, this.rand);
    this.to('ready', frame);
  }

  /** Muda de fase; `resetTimer` false mantém o prazo da fase (a contagem cancelada volta a "prontos"). */
  private to(phase: LobbyPhase, frame: number, resetTimer = true): void {
    const from = this.phase;
    this.phase = phase;
    if (phase === 'countdown') this.phaseStart = frame;
    else if (resetTimer || from !== 'countdown') this.phaseStart = frame;
    else this.phaseStart = this.readyStart;
    if (phase === 'ready' && resetTimer) this.readyStart = frame;
    if (phase === 'vote' || phase === 'lobby' || phase === 'finished') {
      for (const m of this.members.values()) {
        m.vote = -1;
        m.ready = false;
      }
    }
    this.events.push({ type: 'phase', phase });
  }

  /** Começo da fase "prontos" (o prazo de 60 s conta dali, mesmo com contagens canceladas). */
  private readyStart = 0;
}
