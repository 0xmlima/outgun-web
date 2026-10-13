// SPDX-License-Identifier: GPL-2.0-or-later
// Gravação de replays (OG-090): `start_recording`/`record_message`/`stop_recording` (src/server.cpp:675-760,
// src/servnet.cpp:197-230). O replay é o que um espectador onisciente receberia. Spec: plan/specs/replays.md.
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeFrame, encodeReplayBody, PROTOCOL_VERSION, replayPrefix, type AnyMessage, type ReplayHeader } from '@outgun/protocol';

export class ReplayRecorder {
  private readonly chunks: Uint8Array[] = [];
  private pending: AnyMessage[] = [];
  private frames = 0;

  constructor(
    private readonly header: Omit<ReplayHeader, 'frames'>,
    init: AnyMessage[],
  ) {
    this.chunks.push(encodeFrame(...init));
  }

  /** Eventos que valem para o frame em curso (`record_message`). */
  event(...messages: AnyMessage[]): void {
    this.pending.push(...messages);
  }

  /** Fecha o frame: o estado de todos e os eventos acumulados. */
  frame(state: AnyMessage): void {
    this.chunks.push(encodeFrame(state, ...this.pending));
    this.pending = [];
    this.frames++;
  }

  get frameCount(): number {
    return this.frames;
  }

  /** Arquivo pronto: prefixo + gzip do corpo. */
  finish(): Uint8Array {
    const body = gzipSync(encodeReplayBody({ ...this.header, frames: this.frames }, this.chunks), { level: 9 });
    const prefix = replayPrefix(PROTOCOL_VERSION);
    const out = new Uint8Array(prefix.length + body.length);
    out.set(prefix);
    out.set(body, prefix.length);
    return out;
  }
}

/** Replays em disco (`<dir>/<chave>.ogr`), servidos pelo game server em `/replays/`. */
export class ReplayStore {
  constructor(
    readonly dir: string,
    /** Endereço público dos arquivos (ex. http://localhost:7700/replays). */
    readonly baseUrl: string,
    /** Retenção em dias (0 = para sempre). */
    readonly retentionDays: number,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  /** Grava e devolve a URL pública. */
  save(key: string, data: Uint8Array): string {
    writeFileSync(join(this.dir, `${key}.ogr`), data);
    return `${this.baseUrl}/${key}.ogr`;
  }

  /** Apaga os replays mais velhos que a retenção; devolve quantos. */
  prune(now = Date.now()): number {
    if (this.retentionDays <= 0) return 0;
    let removed = 0;
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.ogr')) continue;
      const file = join(this.dir, name);
      if (now - statSync(file).mtimeMs > this.retentionDays * 86_400_000) {
        unlinkSync(file);
        removed++;
      }
    }
    return removed;
  }

  /** Caminho de um replay para servir; null se a chave for inválida. */
  path(name: string): string | null {
    return /^[\w-]+\.ogr$/.test(name) ? join(this.dir, name) : null;
  }
}
