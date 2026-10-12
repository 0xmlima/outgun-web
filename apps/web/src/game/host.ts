// SPDX-License-Identifier: GPL-2.0-or-later
// Dono do canvas do jogo. O React só monta o contêiner e desenha overlays por cima; o PixiJS, o
// laço de quadros e o estado da vista ficam aqui. Até a conexão com o servidor (OG-064), a rota
// mostra um mapa: setas trocam de sala e PageUp/PageDown mudam quantas salas aparecem.
import { parseMapFile } from '@outgun/content';
import { positiveModulo, type GameMap } from '@outgun/sim';
import { Application } from 'pixi.js';
import { ASSETS, loadManifest } from '../assets.js';
import { createRoomSource } from './render/room-source.js';
import { loadRoomTheme } from './render/theme.js';
import { WorldRenderer } from './render/world-renderer.js';

export interface GameHost {
  /** Para o laço e solta o canvas. */
  destroy(): void;
}

export interface GameOptions {
  /** Tema gráfico (`''` = sem tema, o padrão distribuído com o original). */
  readonly theme: string;
  /** Salas na tela em cada direção (o original distribuído usa 1). */
  readonly visibleRooms: number;
  readonly continuousTextures: boolean;
  /** Mapa mostrado enquanto não há partida. */
  readonly map: string;
  /** Sala inicial da vista. */
  readonly room?: readonly [number, number];
  /** Avisado quando o mapa e o tema terminam de carregar (ou falham). */
  readonly onStatus?: (status: GameStatus) => void;
}

export type GameStatus = { readonly kind: 'ready'; readonly map: GameMap } | { readonly kind: 'error'; readonly message: string };

/** Primeiro mapa da rotação padrão (`maps/`) quando nenhum é pedido. */
export const DEFAULT_MAP = 'coliseu';

async function loadMap(name: string): Promise<{ map: GameMap; bytes: Uint8Array }> {
  const manifest = await loadManifest();
  const entry = manifest?.maps[name];
  if (!entry) throw new Error(`mapa não encontrado: ${name}`);
  const bytes = new Uint8Array(await (await fetch(ASSETS + entry.file)).arrayBuffer());
  const result = parseMapFile(name, bytes);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return { map: result.map, bytes };
}

export function mountGame(container: HTMLElement, opts: GameOptions): GameHost {
  const app = new Application();
  let destroyed = false;
  let ready = false;
  let world: WorldRenderer | undefined;
  let visible = opts.visibleRooms;
  let view = { x: opts.room?.[0] ?? 0, y: opts.room?.[1] ?? 0 };

  const onKey = (ev: KeyboardEvent) => {
    if (!world?.layout) return;
    const { mapW, mapH } = world.layout;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[ev.key];
    if (move) view = { x: positiveModulo(view.x + move[0], mapW), y: positiveModulo(view.y + move[1], mapH) };
    else if (ev.key === 'PageUp') visible = Math.min(20, visible + 1);
    else if (ev.key === 'PageDown') visible = Math.max(1, visible - 1);
    else return;
    ev.preventDefault();
    layout();
  };

  const layout = () => {
    if (!world) return;
    world.setPlayfield(
      { x: 0, y: 0, w: app.screen.width, h: app.screen.height },
      { visibleRooms: visible, continuousTextures: opts.continuousTextures },
    );
  };

  void (async () => {
    try {
      // O canvas é criado pelo PixiJS e destruído com ele (reaproveitar um canvas cujo contexto WebGL
      // foi liberado falha na remontagem do React).
      await app.init({
        resizeTo: container,
        resolution: devicePixelRatio || 1,
        autoDensity: true,
        antialias: false,
        background: '#000000',
      });
      ready = true;
      if (destroyed) return app.destroy(true);
      app.canvas.className = 'game-canvas';
      app.canvas.setAttribute('aria-label', 'Outgun');
      container.append(app.canvas);
      const manifest = await loadManifest();
      if (!manifest) throw new Error('assets ausentes: rode `pnpm assets`');
      const [{ map, bytes }, theme] = await Promise.all([loadMap(opts.map), loadRoomTheme(manifest, opts.theme)]);
      const source = await createRoomSource(map, opts.map, bytes, theme);
      if (destroyed) return source.destroy();
      app.renderer.background.color = theme.colours.screen_background ?? '#000000';
      world = new WorldRenderer(map.width, map.height, theme, source, app.renderer.resolution);
      app.stage.addChild(world.stage);
      layout();
      app.renderer.on('resize', layout);
      let announced = false;
      app.ticker.add(() => {
        const missing = world?.render({ room: view, x: 0, y: 0 }) ?? 1;
        // "pronto" quando todas as salas da primeira vista já foram pintadas
        if (!announced && missing === 0) {
          announced = true;
          opts.onStatus?.({ kind: 'ready', map });
        }
      });
    } catch (err) {
      opts.onStatus?.({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  })();

  addEventListener('keydown', onKey);
  return {
    destroy() {
      destroyed = true;
      removeEventListener('keydown', onKey);
      world?.destroy();
      if (ready) app.destroy(true);
    },
  };
}
