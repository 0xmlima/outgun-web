// SPDX-License-Identifier: GPL-2.0-or-later
// Quem pinta as salas: um Web Worker com OffscreenCanvas (padrão) ou, sem suporte, a própria
// thread principal. Os pedidos ficam numa fila com prioridade: salas na tela antes das vizinhas.
import type { GameMap } from '@outgun/sim';
import { paintRoom, type PaintOptions } from './room-painter.js';
import type { RoomTheme } from './theme.js';
import type { WorkerRequest, WorkerResponse } from './room-worker.js';

export type RoomImage = ImageBitmap | HTMLCanvasElement;

export interface RoomSource {
  /** Pede a sala; `urgent` passa à frente das pré-pinturas. */
  paint(rx: number, ry: number, opts: PaintOptions, urgent: boolean): Promise<RoomImage>;
  /** Passa à frente um pedido já na fila (a sala entrou na tela antes de ser pré-pintada). */
  promote(rx: number, ry: number): void;
  /** Descarta pedidos ainda não começados (o layout mudou). */
  cancelPending(): void;
  destroy(): void;
}

interface Job {
  readonly id: number;
  readonly rx: number;
  readonly ry: number;
  readonly opts: PaintOptions;
  readonly resolve: (image: RoomImage) => void;
  readonly reject: (err: Error) => void;
}

class WorkerRoomSource implements RoomSource {
  private readonly worker = new Worker(new URL('./room-worker.ts', import.meta.url), { type: 'module' });
  private readonly queue: Job[] = [];
  private running: Job | undefined;
  private nextId = 1;

  constructor(init: Extract<WorkerRequest, { type: 'init' }>, transfer: Transferable[]) {
    this.worker.postMessage(init, { transfer });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const job = this.running;
      this.running = undefined;
      if (ev.data.type === 'painted' && job?.id === ev.data.id) job.resolve(ev.data.bitmap);
      else job?.reject(new Error(ev.data.type === 'error' ? ev.data.message : 'resposta inesperada'));
      this.pump();
    };
  }

  paint(rx: number, ry: number, opts: PaintOptions, urgent: boolean): Promise<RoomImage> {
    return new Promise((resolve, reject) => {
      const job = { id: this.nextId++, rx, ry, opts, resolve, reject };
      if (urgent) this.queue.unshift(job);
      else this.queue.push(job);
      this.pump();
    });
  }

  promote(rx: number, ry: number): void {
    const i = this.queue.findIndex((job) => job.rx === rx && job.ry === ry);
    if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
  }

  private pump(): void {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running = job;
    const msg: WorkerRequest = { type: 'paint', id: job.id, rx: job.rx, ry: job.ry, opts: job.opts };
    this.worker.postMessage(msg);
  }

  cancelPending(): void {
    for (const job of this.queue.splice(0)) job.reject(new Error('cancelado'));
  }

  destroy(): void {
    this.cancelPending();
    this.worker.terminate();
  }
}

/** Sem OffscreenCanvas: pinta na thread principal (pode atrasar quadros na troca de sala). */
class MainThreadRoomSource implements RoomSource {
  constructor(
    private readonly map: GameMap,
    private readonly theme: RoomTheme,
  ) {}

  paint(rx: number, ry: number, opts: PaintOptions): Promise<RoomImage> {
    const canvas = document.createElement('canvas');
    canvas.width = opts.width;
    canvas.height = opts.height;
    const ctx = canvas.getContext('2d');
    if (ctx) paintRoom(ctx, this.map, rx, ry, this.theme, opts);
    return Promise.resolve(canvas);
  }

  promote(): void {}
  cancelPending(): void {}
  destroy(): void {}
}

/** Fonte de salas para o mapa (bytes originais, reinterpretados no worker) e o tema. */
export async function createRoomSource(
  map: GameMap,
  mapName: string,
  mapBytes: Uint8Array,
  theme: RoomTheme,
): Promise<RoomSource> {
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined')
    return new MainThreadRoomSource(map, theme);
  const toBitmaps = (fills: RoomTheme['floor'], own: readonly boolean[]) =>
    Promise.all(fills.map((fill, i) => (fill.kind === 'texture' && own[i] ? createImageBitmap(fill.image) : null)));
  // Só as texturas próprias de cada ID; o worker refaz o fallback (textura 0 ou cor sólida).
  const [floor, wall] = await Promise.all([toBitmaps(theme.floor, theme.ownFloor), toBitmaps(theme.wall, theme.ownWall)]);
  const bitmaps = [...floor, ...wall].filter((b): b is ImageBitmap => b !== null);
  return new WorkerRoomSource(
    { type: 'init', mapName, mapBytes, themeName: theme.name, colours: theme.colours, floor, wall },
    bitmaps,
  );
}
