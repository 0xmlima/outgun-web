// SPDX-License-Identifier: GPL-2.0-or-later
// Espectadores ao vivo (OG-092): recebem o mesmo stream do replay (OG-090) com o atraso de
// `spectating_delay`, como os espectadores do relay do original. Não ocupam vaga nem aparecem como
// jogadores. Spec: plan/specs/replays.md.
import { encodeFrame, message, PROTOCOL_VERSION, type ReplayHeader } from '@outgun/protocol';
import type { Connection } from './room.js';

interface Segment {
  header: Omit<ReplayHeader, 'frames'>;
  init: Uint8Array;
  /** Relógio da sala (frames de 0,1 s, anda também na pausa e no lobby) em que a partida começou. */
  at: number;
  /** Bloco i = frame `header.startFrame + i`. */
  blocks: Uint8Array[];
  /** Relógio da sala em que cada bloco foi gravado. */
  stamps: number[];
}

interface Viewer {
  segment: Segment | null;
  sent: number;
}

/** Folga depois do último bloco antes de fechar uma sala encerrada (OG-533): o placar final na tela. */
export const SPECTATOR_TAIL_FRAMES = 100;

export class SpectatorStream {
  private segments: Segment[] = [];
  private readonly viewers = new Map<Connection, Viewer>();

  constructor(private readonly maxViewers: number) {}

  get count(): number {
    return this.viewers.size;
  }

  /** Começa uma partida gravada (`start_recording`). */
  begin(header: Omit<ReplayHeader, 'frames'>, init: Uint8Array, now: number): void {
    this.segments.push({ header, init, at: now, blocks: [], stamps: [] });
  }

  /** Bloco do frame em curso da partida atual. */
  frame(block: Uint8Array, now: number): void {
    const s = this.segments.at(-1);
    if (!s) return;
    s.blocks.push(block);
    s.stamps.push(now);
  }

  /** Novo espectador; false se a sala já tem o máximo. */
  add(conn: Connection): boolean {
    if (this.viewers.size >= this.maxViewers) return false;
    this.viewers.set(conn, { segment: null, sent: 0 });
    return true;
  }

  remove(conn: Connection): void {
    this.viewers.delete(conn);
  }

  /**
   * Entrega a cada espectador o que aconteceu até `now − delay`, pelo relógio da sala: o atraso é de
   * tempo de verdade, e não de frames do jogo, que param no lobby da série e na pausa (OG-533).
   */
  tick(now: number, delaySeconds: number): void {
    const target = now - delaySeconds * 10;
    // a partida que contém o instante alvo (ou a última antes dele, mostrando o fim)
    let current: Segment | undefined;
    for (const s of this.segments) if (s.at <= target) current = s;
    // descarta as partidas que nenhum espectador vai mais ver
    if (current) this.segments = this.segments.slice(this.segments.indexOf(current));
    if (!current) return;
    for (const [conn, v] of this.viewers) {
      if (v.segment !== current) {
        v.segment = current;
        v.sent = 0;
        const h = current.header;
        conn.send(encodeFrame(message('spectatorStart', { protocol: PROTOCOL_VERSION, maxPlayers: h.maxPlayers, delay: delaySeconds, map: h.map, mapTitle: h.mapTitle })));
        conn.send(current.init);
      }
      while (v.sent < current.blocks.length && current.stamps[v.sent]! <= target) conn.send(current.blocks[v.sent++]!);
    }
  }

  /** Sala encerrada: ninguém mais assistindo, ou tudo entregue com a folga do placar final. */
  drained(now: number, delaySeconds: number): boolean {
    if (this.viewers.size === 0) return true;
    const last = this.segments.at(-1);
    const end = last?.stamps.at(-1) ?? last?.at;
    return end === undefined || now - delaySeconds * 10 >= end + SPECTATOR_TAIL_FRAMES;
  }

  close(code = 1001, reason = 'sala encerrada'): void {
    for (const conn of this.viewers.keys()) conn.close(code, reason);
    this.viewers.clear();
  }
}
