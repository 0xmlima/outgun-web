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
// sem `new Function`: o cliente roda com CSP sem 'unsafe-eval' (OG-104)
import 'pixi.js/unsafe-eval';
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
import { JoinError, joinErrorText, requestTicket } from './net/ticket.js';
import { browserName, NetTelemetry, sendNetReport } from './net/telemetry.js';
import { API_URL } from '../app/api.js';
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
  /** Opções do jogador que valem durante a partida (OG-068). */
  setClient(client: ClientOptions): void;
  /** Telas F2–F5 (OG-066): a sessão (null fora de partida online) e o voto da lista de mapas. */
  session(): ClientSession | null;
  mapVote(): number;
  voteMap(index: number): void;
  /** Teclas para uma tela aberta (antes do chat e dos controles); devolve true se usou a tecla. */
  setKeyInterceptor(fn: ((ev: KeyboardEvent) => boolean) | null): void;
  /** Para o laço e solta o canvas (e fecha a conexão). */
  destroy(): void;
}

/** Opções do jogador usadas na partida (OG-068, spec plan/specs/opcoes-jogador.md). */
export interface ClientOptions {
  /** As 16 cores em ordem; null = `Use random color` (não envia). */
  readonly favoriteColors: readonly number[] | null;
  /** `Bandwidth for out-of-room players` em cps (vai ao servidor como cps/20). */
  readonly minimapBandwidth: number;
  readonly showFlagMessages: boolean;
  readonly showKillMessages: boolean;
  readonly showNames: 'never' | 'sameRoom' | 'always';
  readonly fpsLimit: number;
  readonly soundTheme: string;
  readonly quickMessages: { readonly enabled: boolean; readonly immediate: boolean; readonly messages: readonly string[] };
}

export const DEFAULT_CLIENT: ClientOptions = {
  favoriteColors: null,
  minimapBandwidth: 80,
  showFlagMessages: true,
  showKillMessages: true,
  showNames: 'sameRoom',
  fpsLimit: 60,
  soundTheme: 'Visa',
  quickMessages: { enabled: false, immediate: false, messages: [] },
};

export interface OnlineOptions {
  /** Endereço do servidor (ws:// ou wss://), sem a sala. */
  readonly url: string;
  readonly room: string;
  /** Nome do convidado (com conta, a API usa o nome da conta). */
  readonly name: string;
  /** Senha da sala privada (pedida no lobby; vale também para as reconexões). */
  readonly password?: string;
  /** `url` veio de ?server= (manda no endereço; senão vale o da API). */
  readonly explicitServer?: boolean;
  /** Rede simulada nos dois sentidos (depuração: ?lag=&loss=). */
  readonly simulate?: LinkConditions;
  /** Manda o resumo anônimo da rede ao servidor (OG-108; opção do jogador). */
  readonly telemetry?: boolean;
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
  /** `Colour theme` e `Prefer main theme colours` (OG-068). */
  readonly colourTheme?: string;
  readonly preferThemeColours?: boolean;
  readonly client?: ClientOptions;
  /** Ações de toque (F1, F2...) e o botão Start do gamepad (`menu`). */
  readonly onAction?: (action: PressAction | 'menu') => void;
  /** Avisado quando o mapa e o tema terminam de carregar (ou falham). */
  readonly onStatus?: (status: GameStatus) => void;
}

export type GameStatus =
  | { readonly kind: 'ready'; readonly map: GameMap }
  | { readonly kind: 'connecting' }
  /** Conexão caiu e o cliente está tentando voltar à mesma vaga (OG-047). */
  | { readonly kind: 'reconnecting' }
  | { readonly kind: 'error'; readonly message: string };

/** Primeiro mapa da rotação padrão (`maps/`) quando nenhum é pedido. */
export const DEFAULT_MAP = 'coliseu';

export async function loadMap(name: string): Promise<{ map: GameMap; bytes: Uint8Array }> {
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
export async function loadFont(name: string | undefined): Promise<GameFont | null> {
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
  let client: ClientOptions = opts.client ?? DEFAULT_CLIENT;
  /** Favoritas e banda do minimapa já enviadas nesta conexão (`sendFavoriteColors`, `sendMinimapBandwidth`). */
  let sentClient: { colors: string; minimap: number } | null = null;
  const sendClientSettings = () => {
    if (!session || !connection || sentClient === null) return;
    const colors = client.favoriteColors ? client.favoriteColors.join(',') : '';
    const minimap = Math.trunc(client.minimapBandwidth / 20);
    if (colors && colors !== sentClient.colors) session.send(message('favoriteColors', { colors: [...client.favoriteColors!] }));
    if (minimap !== sentClient.minimap) session.send(message('minimapBandwidth', { playersPerFrame: minimap }));
    sentClient = { colors, minimap };
  };
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
    else if (action === 'voteMapChange' && onlineHud && session) {
      onlineHud.wantMapExit = !onlineHud.wantMapExit;
      if (!onlineHud.wantMapExit) onlineHud.mapExitDelayed = false;
      session.send(message('mapExit', { on: onlineHud.wantMapExit }));
    } else if (action === 'changeTeam' && onlineHud && session) {
      onlineHud.wantChangeTeams = !onlineHud.wantChangeTeams;
      session.send(message('changeTeam', { on: onlineHud.wantChangeTeams }));
    }
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
  /** Reconexão (OG-047): token da vaga, fim da espera e se a partida acabou de vez (recusa, expulsão). */
  let resumeToken: string | null = null;
  let dropDeadline = 0;
  let ended = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const end = (message: string) => {
    ended = true;
    clearTimeout(reconnectTimer);
    fail(message);
  };

  /** Telemetria de rede (OG-108): amostra por segundo; resumo a cada 5 min, ao sair e ao fechar a aba. */
  let telemetry: { stop: () => void } | null = null;
  const startTelemetry = (online: OnlineOptions) => {
    if (online.telemetry === false) return;
    const net = new NetTelemetry({ room: online.room, version: import.meta.env.VITE_RELEASE ?? 'dev', browser: browserName(navigator.userAgent) });
    const flush = () => {
      const report = net.report();
      if (report) sendNetReport(API_URL, report);
    };
    let n = 0;
    const timer = setInterval(() => {
      const s = session;
      if (!s || !s.world) return;
      net.sample({ pingMs: s.pings.get(s.me), lagFrames: s.stats.averageLag, fps: ready ? app.ticker.FPS : 0, framesReceived: s.stats.framesReceived, corrections: s.stats.corrections });
      if (++n % 300 === 0) flush();
    }, 1000);
    addEventListener('pagehide', flush);
    telemetry = {
      stop: () => {
        clearInterval(timer);
        removeEventListener('pagehide', flush);
        flush();
      },
    };
  };

  /** Partida no servidor: sessão, conexão e envio dos controles a 10 Hz. */
  const startOnline = (online: OnlineOptions, theme: RoomTheme) => {
    startTelemetry(online);
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
          if (m.type === 'reject') end(m.text || m.reason);
          // contagem da expulsão por admin vai para o feed; a desconexão em si fecha a conexão
          else if (m.type === 'disconnecting' && m.seconds === 0) end(`desconectado: ${m.reason}`);
          else if (m.type === 'resumeToken') resumeToken = m.token;
          else if (m.type === 'welcome') {
            container.dataset.pid = String(m.pid); // para os testes (tools/visual-compare/reconnect.mjs)
            // `client_connected`: favoritas (se não for cor aleatória) e banda do minimapa
            sentClient = { colors: '', minimap: -1 };
            sendClientSettings();
            if (dropDeadline !== 0) {
              // voltou à mesma vaga
              dropDeadline = 0;
              container.dataset.reconnects = `${Number(container.dataset.reconnects ?? 0) + 1}`;
              if (worldMap) opts.onStatus?.({ kind: 'ready', map: worldMap });
            }
          }
        }
      },
    });
    session.prediction = opts.prediction;
    onlineHud = new OnlineHud(session, opts.translate);
    onlineHud.setOptions(client);
    sounds = new SoundPlayer();
    sounds.configure(opts.sound.enabled, opts.sound.volume);
    const player = sounds;
    soundEvents = new SoundEvents((name) => player.has(name));
    void loadManifest().then((m) => m && player.load(m, client.soundTheme));
    opts.onStatus?.({ kind: 'connecting' });
    const connect = () =>
      void requestTicket(online.room, online.name, online.url, online.explicitServer ?? false, online.password).then(
        ({ ticket, url }) => {
          if (destroyed || ended) return;
          connection = new GameConnection(
            url,
            ticket,
            {
              onMessages: (messages) => session?.handle(messages, performance.now()),
              onClose: (reason) => dropped(reason),
            },
            online.simulate,
            resumeToken ?? undefined,
          );
        },
        (error: unknown) => {
          if (dropDeadline !== 0 && performance.now() < dropDeadline) retry();
          else end(opts.translate(joinErrorText(error instanceof JoinError ? error.code : 'unknown')));
        },
      );
    const retry = () => {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1000);
    };
    /** Queda (OG-047): o servidor guarda a vaga por 15 s; tenta voltar a cada segundo por até 14 s. */
    const dropped = (reason: string) => {
      if (destroyed || ended) return;
      // a vaga foi retomada por outra janela: não briga por ela
      if (reason === 'resumed') return end(opts.translate('The game continued in another window.'));
      if (!resumeToken) return end(reason);
      const now = performance.now();
      if (dropDeadline === 0) dropDeadline = now + 14_000;
      if (now > dropDeadline) return end(reason);
      opts.onStatus?.({ kind: 'reconnecting' });
      retry();
    };
    connect();
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
      const theme = await loadRoomTheme(manifest, opts.theme, opts.colourTheme ?? '', opts.preferThemeColours ?? true);
      app.ticker.maxFPS = client.fpsLimit;
      if (destroyed) return;
      app.renderer.background.color = theme.colours.screen_background ?? '#000000';
      const playing = Boolean(opts.online || opts.demoPlayers);
      if (playing) {
        const [sprites, font] = await Promise.all([loadEntitySprites(manifest, opts.theme, theme.colours), loadFont(opts.font)]);
        if (destroyed) return;
        gameFont = font;
        entities = new EntityRenderer(theme, sprites, font);
        entities.showNames = client.showNames;
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
              color: (pid) => s.colors.get(pid) ?? 16,
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
  const report = (frame: { players: readonly { me: boolean; pos: WorldCoords; dead: boolean; gundir: number; team: number }[]; rockets: readonly unknown[] }) => {
    container.dataset.players = String(frame.players.length);
    container.dataset.rockets = String(frame.rockets.length);
    const me = frame.players.find((p) => p.me);
    if (me) container.dataset.me = `${me.pos.room.x},${me.pos.room.y},${Math.round(me.pos.x)},${Math.round(me.pos.y)},${me.dead ? 'morto' : 'vivo'},${me.gundir},${me.team}`;
  };

  /** Chat: antes do jogo e do menu (fase de captura), para o Esc só limpar o texto digitado. */
  let interceptor: ((ev: KeyboardEvent) => boolean) | null = null;
  const onChatKey = (ev: KeyboardEvent) => {
    if (interceptor && input.isEnabled() && interceptor(ev)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
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
    session: () => session ?? null,
    mapVote: () => onlineHud?.mapVote ?? -1,
    voteMap: (index) => {
      if (!session || !onlineHud) return;
      // `handleInfoScreenKeypress`: só manda se mudou (e "nenhum" só se havia voto)
      if (index === onlineHud.mapVote || (index < 0 && onlineHud.mapVote < 0)) return;
      onlineHud.mapVote = index;
      onlineHud.mapExitDelayed = false;
      session.send(message('mapVote', { map: index < 0 ? -1 : index }));
    },
    setKeyInterceptor: (fn) => {
      interceptor = fn;
    },
    setClient: (next) => {
      const themeChanged = next.soundTheme !== client.soundTheme;
      client = next;
      onlineHud?.setOptions(next);
      if (entities) entities.showNames = next.showNames;
      if (ready) app.ticker.maxFPS = next.fpsLimit;
      if (themeChanged && sounds) {
        const player = sounds;
        void loadManifest().then((m) => m && player.load(m, next.soundTheme));
      }
      sendClientSettings();
    },
    destroy() {
      destroyed = true;
      telemetry?.stop();
      clearTimeout(reconnectTimer);
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
