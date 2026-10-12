// SPDX-License-Identifier: GPL-2.0-or-later
// Pinta salas fora da thread principal (OffscreenCanvas): pintar uma sala com textura em tela cheia
// leva dezenas de ms, o que derrubaria quadros na troca de sala.
import { parseMapFile } from '@outgun/content';
import type { GameMap } from '@outgun/sim';
import { paintRoom, type PaintOptions } from './room-painter.js';
import { resolveFills, type RoomTheme } from './theme.js';

export type WorkerRequest =
  | {
      readonly type: 'init';
      readonly mapName: string;
      readonly mapBytes: Uint8Array;
      readonly themeName: string;
      readonly colours: Readonly<Record<string, string>>;
      readonly floor: readonly (ImageBitmap | null)[];
      readonly wall: readonly (ImageBitmap | null)[];
    }
  | { readonly type: 'paint'; readonly id: number; readonly rx: number; readonly ry: number; readonly opts: PaintOptions };

export type WorkerResponse = { readonly type: 'painted'; readonly id: number; readonly bitmap: ImageBitmap } | { readonly type: 'error'; readonly message: string };

let map: GameMap | undefined;
let theme: RoomTheme | undefined;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => postMessage(msg, { transfer });

onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      const result = parseMapFile(msg.mapName, msg.mapBytes);
      if (!result.ok) throw new Error(result.errors.join('\n'));
      map = result.map;
      theme = {
        name: msg.themeName,
        colours: msg.colours,
        floor: resolveFills(msg.floor, msg.colours.ground ?? '#000000'),
        wall: resolveFills(msg.wall, msg.colours.wall ?? '#000000'),
        ownFloor: msg.floor.map((b) => b !== null),
        ownWall: msg.wall.map((b) => b !== null),
      };
      return;
    }
    if (!map || !theme) throw new Error('worker sem mapa');
    const canvas = new OffscreenCanvas(msg.opts.width, msg.opts.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D indisponível');
    paintRoom(ctx, map, msg.rx, msg.ry, theme, msg.opts);
    const bitmap = canvas.transferToImageBitmap();
    post({ type: 'painted', id: msg.id, bitmap }, [bitmap]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
