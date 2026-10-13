// SPDX-License-Identifier: GPL-2.0-or-later
// Dono do canvas do jogo. O React só monta o contêiner e desenha overlays por cima; o PixiJS, o
// laço de quadros e o estado da vista ficam aqui. Três modos: partida no servidor (padrão, OG-064),
// partida local de demonstração (`demoPlayers`) e visualizador de mapa (setas trocam de sala,
// PageUp/PageDown mudam quantas salas aparecem).
import { parseMapFile } from '@outgun/content';
import { ClientSession, type LinkConditions, type PredictionOptions } from '@outgun/netcode';
import { message } from '@outgun/protocol';
import { positiveModulo, type GameMap, type WorldCoords } from '@outgun/sim';
import { Application, Assets, type BitmapFont } from 'pixi.js';
import { ASSETS, loadManifest } from '../assets.js';
import { LocalDemo } from './demo.js';
import type { Bindings, PressAction } from './input/bindings.js';
import { GameInput, toggleFocusMode } from './input/input.js';
import { boundCodes } from './input/bindings.js';
import type { Translate } from './hud/feed.js';
import { GameFont, HudRenderer } from './hud/hud-renderer.js';
import { OnlineHud } from './hud/online-hud.js';
import { screenLayout, type ScreenLayout } from './hud/screen-layout.js';
import { GameConnection } from './net/connection.js';
import { SoundEvents, type SoundContext } from './audio/sound-events.js';
import { SoundPlayer } from './audio/sound-player.js';
import { EntityRenderer } from './render/entity-renderer.js';
import { viewTopLeft } from './render/layout.js';
import { createRoomSource } from './render/room-source.js';
import { loadEntitySprites } from './render/sprites.js';
import { loadRoomTheme, type RoomTheme } from './render/theme.js';
import { WorldRenderer } from './render/world-renderer.js';
import { entityFrameFromWorld } from './render/world-view.js';

export interface GameHost {
  /** Com o menu aberto o jogo não lê teclas. */
  setInputEnabled(enabled: boolean): void;
  setBindings(bindings: Bindings): void;
  setPrediction(prediction: PredictionOptions): void;
  setSound(sound: { enabled: boolean; volume: number }): void;
  /** Para o laço e solta o canvas (e fecha a conexão). */
  destroy(): void;
}

export interface OnlineOptions {
  /** Endereço do servidor (ws:// ou wss://), sem a sala. */
  readonly url: string;
  readonly room: string;
  /** Nome do convidado (até a API emitir tickets, OG-083). */
  readonly name: string;
  /** Rede simulada nos dois sentidos (depuração: ?lag=&loss=). */
  readonly simulate?: LinkConditions;
}

export interface GameOptions {
  /** Tema gráfico (`''` = sem tema, o padrão distribuído com o original). */
  readonly theme: string;
  /** Salas na tela em cada direção (o original distribuído usa 1). */
  readonly visibleRooms: number;
  readonly continuousTextures: boolean;
  /** Partida no servidor; sem isto, demonstração local ou só o mapa. */
  readonly online?: OnlineOptions;
  /** Mapa da demonstração ou do visualizador. */
  readonly map: string;
  /** Sala inicial da vista. */
  readonly room?: readonly [number, number];
  /** Jogadores da partida local de demonstração (0 = só o mapa). */
  readonly demoPlayers?: number;
  /** Demonstração em teste de carga (armas no máximo, tiro contínuo). */
  readonly demoStress?: boolean;
  /** Fonte bitmap dos nomes e contagens (uma das fontes do original). */
  readonly font?: string;
  readonly bindings: Bindings;
  readonly prediction: PredictionOptions;
  /** Tradução dos textos do HUD (`_()` do original no idioma escolhido). */
  readonly translate: Translate;
  /** Som ligado e volume 0..255. */
  readonly sound: { readonly enabled: boolean; readonly volume: number };
  /** Ações de toque (F1, F2...) e o botão Start do gamepad (`menu`). */
  readonly onAction?: (action: PressAction | 'menu') => void;
  /** Avisado quando o mapa e o tema terminam de carregar (ou falham). */
  readonly onStatus?: (status: GameStatus) => void;
}

export type GameStatus =
  | { readonly kind: 'ready'; readonly map: GameMap }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'error'; readonly message: string };

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

/** Instala a fonte bitmap e a de contorno no PixiJS (o arquivo .fnt traz o nome da família). */
async function loadFont(name: string | undefined): Promise<GameFont | null> {
  const entry = name ? (await loadManifest())?.fonts[name] : undefined;
  if (!entry) return null;
  try {
    const [main, border] = await Promise.all([
      Assets.load<BitmapFont>(ASSETS + entry.font.fnt),
      entry.border ? Assets.load<BitmapFont>(ASSETS + entry.border.fnt).catch(() => null) : Promise.resolve(null),
    ]);
    return new GameFont(main, border);
  } catch {
    return null;
  }
}

const coords = (p: { roomX: number; roomY: number; x: number; y: number }): WorldCoords => ({ room: { x: p.roomX, y: p.roomY }, x: p.x, y: p.y });

export function mountGame(container: HTMLElement, opts: GameOptions): GameHost {
  const app = new Application();
  let destroyed = false;
  let ready = false;
  let world: WorldRenderer | undefined;
  let worldMap: GameMap | undefined;
  let entities: EntityRenderer | undefined;
  let demo: LocalDemo | undefined;
  let session: ClientSession | undefined;
  let connection: GameConnection | undefined;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let announced = false;
  let hud: HudRenderer | undefined;
  let onlineHud: OnlineHud | undefined;
  let gameFont: GameFont | null = null;
  let screen: ScreenLayout | null = null;
  /** Minimapa e placar visíveis (F12 do original alterna). */
  let fullHud = true;
  let bindings = opts.bindings;
  let sounds: SoundPlayer | undefined;
  let soundEvents: SoundEvents | undefined;
  const input = new GameInput(opts.bindings);
  input.onAction((action) => {
    if (action === 'suicide') {
      demo?.suicide();
      session?.send(message('suicide', {}));
    } else if (action === 'focusMode') void toggleFocusMode(container).catch(() => undefined);
    else if (action === 'moreMessages' && onlineHud) onlineHud.showAll = !onlineHud.showAll;
    else if (action === 'fullPlayfield' && onlineHud) {
      fullHud = !fullHud;
      layout();
    }
    opts.onAction?.(action);
  });
  let visible = opts.visibleRooms;
  let view = { x: opts.room?.[0] ?? 0, y: opts.room?.[1] ?? 0 };

  const onKey = (ev: KeyboardEvent) => {
    if (!world?.layout || demo || session) return;
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
    let playfield = { x: 0, y: 0, w: app.screen.width, h: app.screen.height };
    // partida no servidor: tela dividida como o original (salas, minimapa, placar e barra)
    if (onlineHud && gameFont) {
      const t = opts.translate;
      screen = screenLayout(
        app.screen.width,
        app.screen.height,
        gameFont,
        { health: t('Health'), energy: t('Energy'), power: t('Power'), turbo: t('Turbo'), shadow: t('Shadow'), weapon0: t('Weapon $1', '0') },
        fullHud,
      );
      playfield = screen.playfield;
    }
    world.setPlayfield(playfield, { visibleRooms: visible, continuousTextures: opts.continuousTextures });
  };

  /** Troca o mapa desenhado (início da partida e cada troca de mapa do servidor). */
  const showMap = async (name: string, theme: RoomTheme): Promise<GameMap | null> => {
    const { map, bytes } = await loadMap(name);
    const source = await createRoomSource(map, name, bytes, theme);
    if (destroyed) {
      source.destroy();
      return null;
    }
    world?.destroy();
    world = new WorldRenderer(map.width, map.height, theme, source, app.renderer.resolution);
    worldMap = map;
    app.stage.addChildAt(world.stage, 0);
    announced = false;
    layout();
    return map;
  };

  const fail = (message: string) => opts.onStatus?.({ kind: 'error', message });

  /** Partida no servidor: sessão, conexão e envio dos controles a 10 Hz. */
  const startOnline = (online: OnlineOptions, theme: RoomTheme) => {
    let lastFire = false;
    let lastDrop = false;
    let mapLoad = Promise.resolve();
    session = new ClientSession({
      send: (messages) => connection?.send(messages),
      onMapChange: (request) => {
        // um mapa de cada vez, na ordem em que o servidor pediu
        mapLoad = mapLoad
          .then(() => showMap(request.file, theme))
          .then((map) => {
            if (!map || !session || session.mapRequest !== request) return;
            if (map.crc !== request.crc) console.warn(`mapa ${request.file}: CRC ${map.crc} ≠ ${request.crc} do servidor`);
            session.setMap(map);
          })
          .catch((err: unknown) => fail(`mapa ${request.file}: ${err instanceof Error ? err.message : String(err)}`));
      },
      onEvent: (ev) => {
        const facts = ev.kind === 'message' ? (onlineHud?.onMessage(ev.message) ?? {}) : {};
        if (sounds && soundEvents && session) {
          const s = session;
          const mine = s.world?.players[s.me];
          const ctx: SoundContext = { me: s.me, room: mine ? { x: mine.pos.roomX, y: mine.pos.roomY } : null, onscreen: s.onscreen, time: s.renderFrame / 10 };
          const names = ev.kind === 'message' ? soundEvents.fromMessage(ev.message, ctx, facts) : soundEvents.fromSession(ev, ctx);
          for (const name of names) {
            const t0 = performance.now();
            sounds.play(name);
            container.dataset.soundDispatchMs = (performance.now() - t0).toFixed(2);
            // para os testes (tools/visual-compare/audio.mjs)
            container.dataset.sounds = `${Number(container.dataset.sounds ?? 0) + 1}`;
            container.dataset.lastSound = name;
          }
        }
        const time = (session?.renderFrame ?? 0) / 10;
        if (ev.kind === 'rocketHitWall') entities?.addEffect(ev.power ? 'powerWallExplosion' : 'wallExplosion', coords(ev.pos), ev.team, time);
        else if (ev.kind === 'rocketHitPlayer') entities?.addEffect('gunExplosion', coords(ev.pos), ev.team, time);
        else if (ev.kind === 'message') {
          const m = ev.message;
          if (m.type === 'reject') fail(m.text || m.reason);
          else if (m.type === 'disconnecting') fail(`desconectado: ${m.reason}`);
        }
      },
    });
    session.prediction = opts.prediction;
    onlineHud = new OnlineHud(session, opts.translate);
    sounds = new SoundPlayer();
    sounds.configure(opts.sound.enabled, opts.sound.volume);
    const player = sounds;
    soundEvents = new SoundEvents((name) => player.has(name));
    void loadManifest().then((m) => m && player.load(m));
    opts.onStatus?.({ kind: 'connecting' });
    connection = new GameConnection(
      `${online.url.replace(/\/$/, '')}/rooms/${encodeURIComponent(online.room)}`,
      `dev:${online.name}`,
      {
        onMessages: (messages) => session?.handle(messages, performance.now()),
        onClose: (reason) => fail(reason),
      },
      online.simulate,
    );
    /** Lê a entrada: controles (com reenvio no meio do frame) e bordas de tiro e largar bandeira. */
    const readInput = (now: number) => {
      const s = input.sample();
      session?.setControls(s.controls, now);
      if (s.fire !== lastFire) session?.send(message('fire', { on: (lastFire = s.fire) }));
      if (s.dropFlag !== lastDrop) session?.send(message('dropFlag', { on: (lastDrop = s.dropFlag) }));
    };
    // timer, não requestAnimationFrame: o envio tem de seguir o relógio do servidor (`nextSend`)
    let nextSend = performance.now();
    const sendLoop = () => {
      const now = performance.now();
      readInput(now);
      nextSend += session?.sendFrame(now) ?? 100;
      if (nextSend < now) nextSend = now; // não acumula atraso
      sendTimer = setTimeout(sendLoop, nextSend - now);
    };
    sendLoop();
    return readInput;
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
      const theme = await loadRoomTheme(manifest, opts.theme);
      if (destroyed) return;
      app.renderer.background.color = theme.colours.screen_background ?? '#000000';
      const playing = Boolean(opts.online || opts.demoPlayers);
      if (playing) {
        const [sprites, font] = await Promise.all([loadEntitySprites(manifest, opts.theme, theme.colours), loadFont(opts.font)]);
        if (destroyed) return;
        gameFont = font;
        entities = new EntityRenderer(theme, sprites, font);
        app.stage.addChild(entities.stage);
        if (opts.online && font) {
          hud = new HudRenderer(theme, font, opts.translate, app.renderer.resolution);
          app.stage.addChild(hud.stage);
        }
      }
      let readInput: ((now: number) => void) | undefined;
      if (opts.online) readInput = startOnline(opts.online, theme);
      else {
        const map = await showMap(opts.map, theme);
        if (!map) return;
        if (opts.demoPlayers) demo = new LocalDemo(map, opts.demoPlayers, 0, opts.demoStress);
      }
      app.renderer.on('resize', layout);
      let simTime = 0;
      let topLeft: WorldCoords = { room: view, x: 0, y: 0 };
      app.ticker.add((ticker) => {
        if (!session && !demo) topLeft = { room: view, x: 0, y: 0 };
        if (demo && entities && world?.layout) {
          // a simulação anda a 10 Hz; o desenho, a cada quadro do navegador
          simTime += Math.min(ticker.deltaMS, 250);
          while (simTime >= 100) {
            simTime -= 100;
            demo.setMyInput(input.sample());
            for (const ev of demo.step()) entities.addEffect(ev.kind, ev.pos, ev.team, demo.world.frame / 10);
          }
          topLeft = viewTopLeft(world.layout, demo.mePosition(), VIEW);
          const frame = demo.frame(world.layout.visibleX > 1 || world.layout.visibleY > 1);
          entities.render(frame, world.layout, topLeft);
          report(frame);
        }
        if (session && entities && world?.layout && worldMap && session.world?.map === worldMap) {
          const now = performance.now();
          readInput?.(now);
          const fd = session.skipped || session.gameOver ? null : session.extrapolate(now);
          const me = fd?.players[session.me];
          // jogo escondido (placar, esperando a partida): só o fundo e os avisos, como o original
          world.stage.visible = entities.stage.visible = Boolean(fd && me);
          if (fd && me) {
            const s = session;
            topLeft = viewTopLeft(world.layout, coords(me.pos), VIEW);
            const frame = entityFrameFromWorld(fd, {
              me: s.me,
              name: (pid) => s.names.get(pid) ?? '',
              color: (pid) => pid % 16, // cores pessoais: OG-068
              hitfx: (pid) => {
                const until = s.hitUntil.get(pid) ?? 0;
                return until > now ? fd.time + (until - now) / 1000 : 0;
              },
              respawnIn: Math.max(0, (s.respawnFrame - fd.frame) / 10),
              flagReturnTime: (key) => s.flagReturnTime.get(key),
              flagReturnDelay: s.settings.world.flagReturnDelay,
              maxRunSpeed: s.settings.physics.maxRunSpeed,
              multiRoom: world.layout.visibleX > 1 || world.layout.visibleY > 1,
            });
            entities.render(frame, world.layout, topLeft);
            report(frame);
            container.dataset.lag = s.stats.averageLag.toFixed(2);
            container.dataset.corrections = String(s.stats.corrections);
            if (sounds) {
              const lat = sounds.latencyMs();
              container.dataset.audio = `${sounds.state},${lat.base.toFixed(1)},${lat.output.toFixed(1)}`;
            }
          } else entities.render({ time: 0, players: [], rockets: [], powerups: [], flags: [], deathbringers: [], multiRoom: false }, world.layout, topLeft);
          if (hud && onlineHud && screen && gameFont) {
            const state = onlineHud.build({ screen, rooms: world.layout, topLeft, fd, now, fps: app.ticker.FPS, showPings: input.sample().showPings, fontHeight: gameFont.height });
            if (state) hud.render(state);
          }
        }
        const missing = world?.render(topLeft) ?? 1;
        // "pronto" quando todas as salas da primeira vista já foram pintadas
        if (!announced && missing === 0 && worldMap) {
          announced = true;
          opts.onStatus?.({ kind: 'ready', map: worldMap });
        }
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  })();

  /** Contadores para as medições (tools/visual-compare/fps.mjs) e testes. */
  const report = (frame: { players: readonly { me: boolean; pos: WorldCoords; dead: boolean; gundir: number }[]; rockets: readonly unknown[] }) => {
    container.dataset.players = String(frame.players.length);
    container.dataset.rockets = String(frame.rockets.length);
    const me = frame.players.find((p) => p.me);
    if (me) container.dataset.me = `${me.pos.room.x},${me.pos.room.y},${Math.round(me.pos.x)},${Math.round(me.pos.y)},${me.dead ? 'morto' : 'vivo'},${me.gundir}`;
  };

  /** Chat: antes do jogo e do menu (fase de captura), para o Esc só limpar o texto digitado. */
  const onChatKey = (ev: KeyboardEvent) => {
    if (!onlineHud || !input.isEnabled()) return;
    if (onlineHud.onKey(ev, boundCodes(bindings))) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  };

  addEventListener('keydown', onKey);
  addEventListener('keydown', onChatKey, true);
  return {
    setInputEnabled: (enabled) => input.setEnabled(enabled),
    setBindings: (b) => {
      bindings = b;
      input.setBindings(b);
    },
    setPrediction: (prediction) => {
      if (session) session.prediction = prediction;
    },
    setSound: (sound) => sounds?.configure(sound.enabled, sound.volume),
    destroy() {
      destroyed = true;
      if (sendTimer !== null) clearTimeout(sendTimer);
      connection?.close();
      sounds?.destroy();
      input.destroy();
      removeEventListener('keydown', onKey);
      removeEventListener('keydown', onChatKey, true);
      hud?.destroy();
      world?.destroy();
      entities?.destroy();
      if (ready) app.destroy(true);
    },
  };
}
