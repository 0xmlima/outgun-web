// SPDX-License-Identifier: GPL-2.0-or-later
// Registro dos eventos de cada ranqueada (OG-362, RN-LDB-03): abates e ações de bandeira, em ordem,
// para os stats que dependem do momento (multi-kill, troca, primeiro abate, OG-363) e o "quem matou
// quem" (OG-364). Vai no relatório da partida só quando ela é ranqueada; a API guarda à parte.

/** Quem aparece nos eventos; o slot pode ser reaproveitado na partida, por isso a lista. */
export interface EventPlayer {
  slot: number;
  /** Conta da API; ausente = convidado ou bot. */
  userId?: string;
  name: string;
  team: 0 | 1;
  bot: boolean;
}

/** Bandeira: 0 = vermelha, 1 = azul, 2 = selvagem. */
export type EventFlag = 0 | 1 | 2;

/**
 * Evento compacto; o 1º campo é o momento em décimos de segundo de mapa e os jogadores são índices
 * em `players` (−1 = ninguém, ex.: matador fora dos slots).
 * - abate: `[t, 'kill', matador, vítima, salaX, salaY, vítima com bandeira (0/1), causa]`
 * - bandeira: `[t, 'take' | 'drop' | 'return' | 'capture', jogador, bandeira]`
 */
export type MatchEvent = [number, 'kill', number, number, number, number, 0 | 1, string] | [number, 'take' | 'drop' | 'return' | 'capture', number, EventFlag];

export interface MatchEventLog {
  players: EventPlayer[];
  events: MatchEvent[];
}

/** Teto de eventos por partida (o resto é descartado); a API recusa acima disto. */
export const MATCH_EVENTS_LIMIT = 5000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MatchEventRecorder {
  private players: EventPlayer[] = [];
  private events: MatchEvent[] = [];

  /** `who`: quem está no slot agora (null = slot vazio). */
  constructor(private readonly who: (pid: number) => EventPlayer | null) {}

  /** Começo de um jogo (ou jogo cancelado): esquece tudo. */
  reset(): void {
    this.players = [];
    this.events = [];
  }

  kill(t: number, killer: number, victim: number, room: { x: number; y: number }, carrier: boolean, cause: string): void {
    this.push([t, 'kill', this.ref(killer), this.ref(victim), room.x, room.y, carrier ? 1 : 0, cause]);
  }

  flag(t: number, kind: 'take' | 'drop' | 'return' | 'capture', pid: number, flag: EventFlag): void {
    this.push([t, kind, this.ref(pid), flag]);
  }

  log(): MatchEventLog {
    return { players: this.players.map((p) => ({ ...p })), events: this.events.map((e) => [...e] as MatchEvent) };
  }

  private push(e: MatchEvent): void {
    if (this.events.length < MATCH_EVENTS_LIMIT) this.events.push(e);
  }

  /** Índice de quem está no slot; o mesmo jogador no mesmo slot reaproveita a entrada. */
  private ref(pid: number): number {
    const p = this.who(pid);
    if (!p) return -1;
    const entry: EventPlayer = { slot: p.slot, ...(p.userId && UUID.test(p.userId) ? { userId: p.userId } : {}), name: p.name.slice(0, 32), team: p.team, bot: p.bot };
    const i = this.players.findIndex((x) => x.slot === entry.slot && x.userId === entry.userId && x.name === entry.name && x.team === entry.team);
    if (i >= 0) return i;
    this.players.push(entry);
    return this.players.length - 1;
  }
}
