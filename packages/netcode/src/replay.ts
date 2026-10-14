// SPDX-License-Identifier: GPL-2.0-or-later
// Reprodução de replay (OG-091): passa os blocos gravados pelo servidor (OG-090) por um
// `ClientSession` de espectador, como o cliente original faz ao ler o arquivo de replay. Voltar no
// tempo refaz do começo (o estado do cliente não tem cópia barata); 10 min de partida levam
// menos de um segundo. Spec: plan/specs/replays.md.
import type { Replay } from '@outgun/protocol';
import type { GameMap } from '@outgun/sim';
import { ClientSession, type SessionEvent } from './session.js';

export class ReplayPlayer {
  private current!: ClientSession;
  /** Blocos de frame já aplicados (0 = só o estado inicial). */
  private applied = 0;
  /** Repassa os efeitos (desligado ao pular). */
  private emitting = false;

  constructor(
    readonly replay: Replay,
    private readonly map: GameMap,
    /** Efeitos do frame (explosões, sons); não é chamado ao pular para trás ou para a frente. */
    private readonly onEvent?: (event: SessionEvent) => void,
  ) {
    this.reset();
  }

  /** Sessão do espectador (`me` = −1): mundo, nomes, placar... */
  get session(): ClientSession {
    return this.current;
  }

  /** Quantos frames o replay tem. */
  get length(): number {
    return this.replay.frames.length;
  }

  /** Posição atual (frames aplicados). */
  get position(): number {
    return this.applied;
  }

  private reset(): void {
    const session = new ClientSession({
      send: () => {},
      onMapChange: () => session.setMap(this.map),
      onEvent: (ev) => {
        if (this.emitting) this.onEvent?.(ev);
      },
    });
    session.maxPlayers = this.replay.header.maxPlayers;
    session.prediction = { enabled: false, amount: 0 };
    session.handle(this.replay.init, 0);
    this.current = session;
    this.applied = 0;
  }

  /** Aplica o próximo frame; false no fim. */
  step(): boolean {
    if (this.applied >= this.length) return false;
    this.emitting = true;
    this.apply(this.applied);
    return true;
  }

  private apply(index: number): void {
    const block = this.replay.frames[index]!;
    this.current.handle(block, (this.replay.header.startFrame + index) * 100);
    this.applied = index + 1;
  }

  /** Vai para depois de `position` frames (0..length), sem efeitos. */
  seek(position: number): void {
    const target = Math.max(0, Math.min(this.length, Math.trunc(position)));
    if (target < this.applied) this.reset();
    this.emitting = false;
    while (this.applied < target) this.apply(this.applied);
  }
}
