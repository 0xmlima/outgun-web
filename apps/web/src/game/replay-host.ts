// SPDX-License-Identifier: GPL-2.0-or-later
// Player de replay (OG-091): toca um arquivo `.ogr` (OG-090) no mesmo renderer da partida. Teclas do
// original (`GuiClient`, src/guiclient.cpp:2580-2660): PageUp/PageDown dobram ou dividem a
// velocidade (1/32 a 128), Home volta ao normal, P pausa, setas trocam a sala do canto, + e − do
// teclado numérico mudam o zoom. A mais: F segue um jogador (e Esc solta), e o seek pela barra.
import { ReplayPlayer } from '@outgun/netcode';
import { decodeReplayBody, readReplayPrefix, type Replay } from '@outgun/protocol';
import { positiveModulo, type GameMap, type WorldCoords } from '@outgun/sim';
import { Application } from 'pixi.js';
// sem `new Function`: o cliente roda com CSP sem 'unsafe-eval' (OG-104)
import 'pixi.js/unsafe-eval';
import { loadManifest } from '../assets.js';
import { loadFont, loadMap, visualCheck } from './host.js';
import { EntityRenderer } from './render/entity-renderer.js';
import { viewTopLeft } from './render/layout.js';
import { createRoomSource } from './render/room-source.js';
import { loadEntitySprites } from './render/sprites.js';
import { loadRoomTheme } from './render/theme.js';
import { WorldRenderer } from './render/world-renderer.js';
import { entityFrameFromWorld } from './render/world-view.js';

/** Estado mostrado pela tela (barra, velocidade, quem segue). */
export interface ReplayStatus {
  /** Frames do replay e o atual. */
  readonly length: number;
  readonly position: number;
  readonly rate: number;
  readonly paused: boolean;
  /** Jogador seguido (nome) ou null (sala fixa). */
  readonly following: string | null;
  readonly room: readonly [number, number];
  readonly mapTitle: string;
  readonly ended: boolean;
}

export interface ReplayHost {
  seek(frame: number): void;
  togglePause(): void;
  /** Troca o replay (espectador: começou outra partida). */
  setReplay(replay: Replay): void;
  destroy(): void;
}

export interface ReplayOptions {
  readonly theme: string;
  readonly visibleRooms: number;
  readonly continuousTextures: boolean;
  readonly font?: string;
  readonly colourTheme?: string;
  readonly preferThemeColours?: boolean;
  /** Começa neste ponto (s). */
  readonly startSeconds?: number;
  readonly onStatus: (status: ReplayStatus) => void;
  readonly onError: (message: string) => void;
  /** Ao vivo (espectador, OG-092): os blocos chegam em `replay.frames`; toca no tempo real, sem velocidade nem seek. */
  readonly live?: boolean;
}

/** Lê um `.ogr`: prefixo, gzip (DecompressionStream) e blocos. */
export async function readReplay(data: ArrayBuffer): Promise<Replay> {
  const prefix = readReplayPrefix(new Uint8Array(data));
  if (!prefix) throw new Error('não é um arquivo de replay do Outgun Web');
  const stream = new Blob([prefix.body as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  const body = new Uint8Array(await new Response(stream).arrayBuffer());
  return decodeReplayBody(body, prefix.version, prefix.protocol);
}

const RATE_MIN = 1 / 32;
const RATE_MAX = 128;
const VIEW = { scroll: false, view: 'mapWraps', repeatX: false, repeatY: false, wrapsX: false, wrapsY: false } as const;

/** Zoom do original: passos de 1/4 até 3 salas, 1/2 até 5, depois 1 (`visible_rooms`). */
function zoom(visible: number, dir: 1 | -1): number {
  if (dir > 0) return Math.min(20, visible + (visible < 3 ? 0.25 : visible < 5 ? 0.5 : 1));
  return Math.max(1, visible - (visible <= 3 ? 0.25 : visible <= 5 ? 0.5 : 1));
}

export function mountReplay(container: HTMLElement, initial: Replay | null, opts: ReplayOptions): ReplayHost {
  const app = new Application();
  let destroyed = false;
  let ready = false;
  let replay: Replay | null = null;
  let player: ReplayPlayer | undefined;
  let rate = 1;
  let paused = false;
  let subFrame = 0;
  let visible = opts.visibleRooms;
  let room: [number, number] = [0, 0];
  let follow = -1;
  let world: WorldRenderer | undefined;
  let entities: EntityRenderer | undefined;
  let map: GameMap | undefined;
  let mapName = '';
  let lastStatus = '';
  /** Aberturas em ordem (um mapa carregando de cada vez). */
  // a fila de aberturas só anda depois do carregamento: segmento ao vivo que chega antes do `app.init`
  // acabar espera em vez de falhar com "player não iniciado" (OG-281)
  let loaded: () => void = () => undefined;
  let opening = new Promise<void>((resolve) => (loaded = resolve));
  let setup: Promise<{ theme: Awaited<ReturnType<typeof loadRoomTheme>>; sprites: Awaited<ReturnType<typeof loadEntitySprites>>; font: Awaited<ReturnType<typeof loadFont>> }> | null = null;

  const status = () => {
    const s = player?.session;
    const st: ReplayStatus = {
      length: player?.length ?? 0,
      position: player?.position ?? 0,
      rate,
      paused,
      following: follow >= 0 ? (s?.names.get(follow) ?? null) : null,
      room,
      mapTitle: replay?.header.mapTitle ?? '',
      ended: !opts.live && !!player && player.position >= player.length,
    };
    const key = JSON.stringify(st);
    if (key !== lastStatus) {
      lastStatus = key;
      opts.onStatus(st);
    }
  };

  const layout = () => world?.setPlayfield({ x: 0, y: 0, w: app.screen.width, h: app.screen.height }, { visibleRooms: visible, continuousTextures: opts.continuousTextures });

  /** Próximo jogador presente depois de `follow` (−1 volta à sala fixa). */
  const nextFollow = () => {
    const w = player?.session.world;
    if (!w) return;
    const pids = w.players.flatMap((p, i) => (p ? [i] : []));
    follow = pids.find((pid) => pid > follow) ?? -1;
  };

  const onKey = (ev: KeyboardEvent) => {
    if (!map || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[ev.key];
    if (move) {
      follow = -1;
      room = [positiveModulo(room[0] + move[0], map.width), positiveModulo(room[1] + move[1], map.height)];
    } else if (ev.key === 'PageUp' && !opts.live) rate = Math.min(RATE_MAX, rate * 2);
    else if (ev.key === 'PageDown' && !opts.live) rate = Math.max(RATE_MIN, rate / 2);
    else if (ev.key === 'Home' && !opts.live) rate = 1;
    else if ((ev.key === 'p' || ev.key === 'P') && !opts.live) paused = !paused;
    else if (ev.code === 'NumpadAdd') visible = zoom(visible, -1);
    else if (ev.code === 'NumpadSubtract') visible = zoom(visible, 1);
    else if (ev.key === 'f' || ev.key === 'F') nextFollow();
    else if (ev.key === 'Escape' && follow >= 0) follow = -1;
    else return;
    ev.preventDefault();
    layout();
    status();
  };

  /** Carrega mapa e renderers do replay (reaproveita se o mapa é o mesmo) e cria o player. */
  const open = async (next: Replay) => {
    if (!setup) throw new Error('player não iniciado');
    const { theme, sprites, font } = await setup;
    if (destroyed) return;
    if (next.header.map !== mapName || !world) {
      const { map: loaded, bytes } = await loadMap(next.header.map, { text: next.header.mapText });
      const source = await createRoomSource(loaded, next.header.map, bytes, theme);
      if (destroyed) return source.destroy();
      world?.destroy();
      world = new WorldRenderer(loaded.width, loaded.height, theme, source, app.renderer.resolution);
      app.stage.addChildAt(world.stage, 0);
      map = loaded;
      mapName = next.header.map;
      layout();
    }
    if (!entities) {
      entities = new EntityRenderer(theme, sprites, font);
      entities.showNames = 'always';
      app.stage.addChild(entities.stage);
    }
    const recorded = next.init.find((m) => m.type === 'mapChange');
    if (recorded?.type === 'mapChange' && map && recorded.crc !== map.crc) console.warn(`replay: CRC do mapa ${map.crc} ≠ ${recorded.crc} gravado`);
    const fx = entities;
    const p = new ReplayPlayer(next, map!, (ev) => {
      const time = (p.session.world?.frame ?? 0) / 10;
      const at = (pos: { roomX: number; roomY: number; x: number; y: number }): WorldCoords => ({ room: { x: pos.roomX, y: pos.roomY }, x: pos.x, y: pos.y });
      if (ev.kind === 'rocketHitWall') fx.addEffect(ev.power ? 'powerWallExplosion' : 'wallExplosion', at(ev.pos), ev.team, time);
      else if (ev.kind === 'rocketHitPlayer') fx.addEffect('gunExplosion', at(ev.pos), ev.team, time);
    });
    replay = next;
    player = p;
    subFrame = 0;
    if (opts.live) p.seek(Math.max(0, p.length - 1));
    else if (opts.startSeconds) p.seek(opts.startSeconds * 10);
    else p.step();
    status();
  };

  const setReplay = (next: Replay) => {
    opening = opening.then(() => open(next)).catch((err: unknown) => opts.onError(err instanceof Error ? err.message : String(err)));
  };
  if (initial) setReplay(initial); // primeiro na fila, antes de qualquer segmento ao vivo

  void (async () => {
    try {
      await app.init({ resizeTo: container, resolution: devicePixelRatio || 1, autoDensity: true, antialias: false, background: '#000000' });
      ready = true;
      if (destroyed) return app.destroy(true);
      app.canvas.className = 'game-canvas';
      app.canvas.setAttribute('aria-label', 'Outgun replay');
      container.append(app.canvas);
      setup = (async () => {
        const manifest = await loadManifest();
        if (!manifest) throw new Error('assets ausentes: rode `pnpm assets`');
        const theme = await loadRoomTheme(manifest, opts.theme, opts.colourTheme ?? '', opts.preferThemeColours ?? true);
        app.renderer.background.color = theme.colours.screen_background ?? '#000000';
        const [sprites, font] = await Promise.all([loadEntitySprites(manifest, opts.theme, theme.colours), loadFont(opts.font)]);
        return { theme, sprites, font };
      })();
      await setup;
      app.renderer.on('resize', layout);
      loaded();
      const hideWorld = visualCheck();
      app.ticker.add((ticker) => {
        const p = player;
        if (!p || !world?.layout || !entities) return;
        if (opts.live && p.length - p.position > 5) p.seek(p.length - 1); // atrasou (aba em segundo plano): alcança
        if (!paused && p.position < p.length) {
          subFrame += Math.min(ticker.deltaMS, 250) * 0.01 * rate;
          while (subFrame >= 1) {
            subFrame -= 1;
            if (!p.step()) break;
          }
        }
        // ao vivo, não extrapola além do último frame recebido
        if (p.position >= p.length) subFrame = Math.min(subFrame, 1);
        const s = p.session;
        const fd = s.world ? s.extrapolateBy(paused ? 0 : Math.min(1, subFrame)) : null;
        let topLeft: WorldCoords = { room: { x: room[0], y: room[1] }, x: 0, y: 0 };
        const followed = follow >= 0 ? fd?.players[follow] : undefined;
        if (followed) topLeft = viewTopLeft(world.layout, { room: { x: followed.pos.roomX, y: followed.pos.roomY }, x: followed.pos.x, y: followed.pos.y }, VIEW);
        if (fd) {
          const frame = entityFrameFromWorld(fd, {
            me: follow,
            name: (pid) => s.names.get(pid) ?? '',
            color: (pid) => s.colors.get(pid) ?? 16,
            hitfx: () => 0,
            respawnIn: 0,
            flagReturnTime: (key) => s.flagReturnTime.get(key),
            flagReturnDelay: s.settings.world.flagReturnDelay,
            maxRunSpeed: s.settings.physics.maxRunSpeed,
            multiRoom: world.layout.visibleX > 1 || world.layout.visibleY > 1,
          });
          entities.render(frame, world.layout, topLeft);
          container.dataset.players = String(frame.players.length);
        }
        world.render(topLeft);
        if (hideWorld) world.stage.visible = entities.stage.visible = false;
        container.dataset.position = String(p.position);
        container.dataset.frame = String(s.world?.frame ?? -1);
        status();
      });
      container.dataset.status = 'ready';
    } catch (err) {
      opts.onError(err instanceof Error ? err.message : String(err));
    }
  })();

  addEventListener('keydown', onKey);
  return {
    seek(frame) {
      if (!player || opts.live) return;
      player.seek(frame);
      subFrame = 0;
      status();
    },
    togglePause() {
      paused = !paused;
      status();
    },
    setReplay,
    destroy() {
      destroyed = true;
      removeEventListener('keydown', onKey);
      world?.destroy();
      entities?.destroy();
      if (ready) app.destroy(true);
    },
  };
}
