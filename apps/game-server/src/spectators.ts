// SPDX-License-Identifier: GPL-2.0-or-later
// Espectadores ao vivo (OG-092): recebem o mesmo stream do replay (OG-090) com o atraso de
// `spectating_delay`, como os espectadores do relay do original. Não ocupam vaga nem aparecem como
// jogadores. Spec: plan/specs/replays.md.
import { encodeFrame, message, PROTOCOL_VERSION, type ReplayHeader } from '@outgun/protocol';
import type { Connection } from './room.js';

interface Segment {
  header: Omit<ReplayHeader, 'frames'>;
  init: Uint8Array;
  /** Bloco i = frame `header.startFrame + i`. */
  blocks: Uint8Array[];
}

interface Viewer {
  segment: Segment | null;
  sent: number;
}

export class SpectatorStream {
  private segments: Segment[] = [];
  private readonly viewers = new Map<Connection, Viewer>();

  constructor(private readonly maxViewers: number) {}

  get count(): number {
    return this.viewers.size;
  }

  /** Começa uma partida gravada (`start_recording`). */
  begin(header: Omit<ReplayHeader, 'frames'>, init: Uint8Array): void {
    this.segments.push({ header, init, blocks: [] });
  }

  /** Bloco do frame em curso da partida atual. */
  frame(block: Uint8Array): void {
    this.segments.at(-1)?.blocks.push(block);
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

  /** Entrega a cada espectador o que aconteceu até `frame − delayFrames`. */
  tick(frame: number, delaySeconds: number): void {
    const target = frame - delaySeconds * 10;
    // a partida que contém o frame alvo (ou a última antes dele, mostrando o fim)
    let current: Segment | undefined;
    for (const s of this.segments) if (s.header.startFrame <= target) current = s;
    // descarta as partidas que nenhum espectador vai mais ver
    if (current) this.segments = this.segments.slice(this.segments.indexOf(current));
    if (!current) return;
    const upTo = Math.min(current.blocks.length, target - current.header.startFrame + 1);
    for (const [conn, v] of this.viewers) {
      if (v.segment !== current) {
        v.segment = current;
        v.sent = 0;
        const h = current.header;
        conn.send(encodeFrame(message('spectatorStart', { protocol: PROTOCOL_VERSION, maxPlayers: h.maxPlayers, delay: delaySeconds, map: h.map, mapTitle: h.mapTitle })));
        conn.send(current.init);
      }
      while (v.sent < upTo) conn.send(current.blocks[v.sent++]!);
    }
  }

  close(): void {
    for (const conn of this.viewers.keys()) conn.close(1001, 'sala encerrada');
    this.viewers.clear();
  }
}
