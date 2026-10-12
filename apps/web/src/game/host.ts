// SPDX-License-Identifier: GPL-2.0-or-later
// Dono do canvas do jogo. O React só monta o contêiner e desenha overlays por cima; o PixiJS, o
// laço de quadros e o estado da vista ficam aqui. Até a conexão com o servidor (OG-064), a rota
// mostra um mapa: setas trocam de sala e PageUp/PageDown mudam quantas salas aparecem.
import { parseMapFile } from '@outgun/content';
import { positiveModulo, type GameMap } from '@outgun/sim';
import { Application, Assets, type BitmapFont } from 'pixi.js';
import { ASSETS, loadManifest } from '../assets.js';
import { LocalDemo } from './demo.js';
import { EntityRenderer } from './render/entity-renderer.js';
import { viewTopLeft } from './render/layout.js';
import { createRoomSource } from './render/room-source.js';
import { loadEntitySprites } from './render/sprites.js';
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
  /** Jogadores da partida local de demonstração (0 = só o mapa). */
  readonly demoPlayers?: number;
  /** Demonstração em teste de carga (armas no máximo, tiro contínuo). */
  readonly demoStress?: boolean;
  /** Fonte bitmap dos nomes e contagens (uma das fontes do original). */
  readonly font?: string;
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

/** Vista do `client.cfg` distribuído: sem rolagem, vista passa da borda só em mapas que dão a volta. */
const VIEW = { scroll: false, view: 'mapWraps', repeatX: false, repeatY: false, wrapsX: false, wrapsY: false } as const;

/** Instala a fonte bitmap no PixiJS (o arquivo .fnt traz o nome da família). */
async function loadFont(name: string | undefined): Promise<{ family: string; height: number } | null> {
  const files = name ? (await loadManifest())?.fonts[name]?.font : undefined;
  if (!files) return null;
  try {
    const font = await Assets.load<BitmapFont>(ASSETS + files.fnt);
    return { family: font.fontFamily, height: font.lineHeight };
  } catch {
    return null;
  }
}

export function mountGame(container: HTMLElement, opts: GameOptions): GameHost {
  const app = new Application();
  let destroyed = false;
  let ready = false;
  let world: WorldRenderer | undefined;
  let entities: EntityRenderer | undefined;
  let demo: LocalDemo | undefined;
  let visible = opts.visibleRooms;
  let view = { x: opts.room?.[0] ?? 0, y: opts.room?.[1] ?? 0 };

  const onKey = (ev: KeyboardEvent) => {
    if (!world?.layout || demo) return;
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
      if (opts.demoPlayers) {
        const [sprites, font] = await Promise.all([loadEntitySprites(manifest, opts.theme, theme.colours), loadFont(opts.font)]);
        if (destroyed) return;
        entities = new EntityRenderer(theme, sprites, font);
        app.stage.addChild(entities.stage);
        demo = new LocalDemo(map, opts.demoPlayers, 0, opts.demoStress);
      }
      layout();
      app.renderer.on('resize', layout);
      let announced = false;
      let simTime = 0;
      app.ticker.add((ticker) => {
        let topLeft = { room: view, x: 0, y: 0 };
        if (demo && entities && world?.layout) {
          // a simulação anda a 10 Hz; o desenho, a cada quadro do navegador
          simTime += Math.min(ticker.deltaMS, 250);
          while (simTime >= 100) {
            simTime -= 100;
            for (const ev of demo.step()) entities.addEffect(ev.kind, ev.pos, ev.team, demo.world.frame / 10);
          }
          topLeft = viewTopLeft(world.layout, demo.mePosition(), VIEW);
          const frame = demo.frame(world.layout.visibleX > 1 || world.layout.visibleY > 1);
          entities.render(frame, world.layout, topLeft);
          // contadores para as medições (tools/visual-compare/fps.mjs)
          container.dataset.players = String(frame.players.length);
          container.dataset.rockets = String(frame.rockets.length);
        }
        const missing = world?.render(topLeft) ?? 1;
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
      entities?.destroy();
      if (ready) app.destroy(true);
    },
  };
}
