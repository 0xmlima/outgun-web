// SPDX-License-Identifier: GPL-2.0-or-later
// Rota do jogo: o PixiJS desenha num canvas próprio controlado por `mountGame`; o React desenha só
// os overlays (menu do Esc, como no original: "While in the game, press esc to open the menu").
// Sem parâmetros, "Jogar agora" entra na sala do servidor de jogo (OG-064). Parâmetros de URL:
// ?server=ws://...&sala=ID&name=NOME&lag=MS&loss=PCT (partida; lag/loss simulam rede ruim; a senha
// da sala vem do lobby no estado da navegação),
// ?demo=JOGADORES (partida local) e ?map=NOME&theme=TEMA&rooms=N&room=X,Y (visualizador de mapa).
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { DEFAULT_MAP, mountGame, type ClientOptions, type GameHost, type GameStatus, type OnlineOptions } from '../game/host.js';
import type { Prefs } from '../app/prefs.js';
import { defaultServerUrl } from '../game/net/connection.js';
import { ACTION_LABELS } from '../game/input/bindings.js';
import { BitmapText } from '../ui/BitmapText.js';
import { Button } from '../ui/Button.js';
import { GAME_FONT } from '../ui/fonts.js';
import { useMusicMode } from '../app/music/MusicProvider.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { RankedLobby, type LobbyView } from './RankedLobby.js';
import { InfoOverlay, type InfoKind } from './InfoOverlay.js';

/** Opções do jogador que valem na partida (OG-068). */
function clientOptions(p: Prefs): ClientOptions {
  return {
    favoriteColors: p.randomColor ? null : p.favoriteColors,
    minimapBandwidth: p.minimapBandwidth,
    showFlagMessages: p.showFlagMessages,
    showKillMessages: p.showKillMessages,
    showNames: p.showNames,
    fpsLimit: p.fpsLimit,
    soundTheme: p.soundTheme,
    quickMessages: { enabled: p.quickMessagesEnabled, immediate: p.quickMessagesImmediate, messages: p.quickMessages },
    // opções gráficas avançadas do original (OG-070)
    graphics: {
      scroll: p.scroll,
      lessTransparency: p.lessTransparency,
      minimapPlayers: p.minimapPlayers,
      highlightReturnedFlags: p.highlightReturnedFlags,
      emphasizeFlags: p.emphasizeFlags,
      oldFlagPositions: p.oldFlagPositions,
      spawnHighlight: p.spawnHighlight,
      neighborMarkers: p.neighborMarkers,
      boxVisibleArea: p.boxVisibleArea,
      viewOverBorder: p.viewOverBorder,
      repeatMap: p.repeatMap,
      mapInfoMode: p.mapInfoMode,
      underlineAccounts: p.underlineAccounts,
      stayDeadInMenus: p.stayDeadInMenus,
      backgroundTheme: p.backgroundTheme,
      preferThemeBackground: p.preferThemeBackground,
    },
  };
}

/** Placar da série na faixa do topo (OG-257). */
interface SeriesBar {
  bestOf: number;
  gameNo: number;
  red: number;
  blue: number;
}

/** Dica do modo foco já mostrada neste navegador (OG-232). */
const FOCUS_HINT_KEY = 'outgun.focusHint';

export default function GameScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // senha da sala privada vem do lobby pelo estado da navegação (nunca na URL)
  const password = (useLocation().state as { password?: string } | null)?.password;
  const hostRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<GameStatus | null>(null);
  // trilha (OG-221, D-37): playlist só nas salas Casual; até o servidor dizer o modo, silêncio
  const [roomMode, setRoomMode] = useState<'casual' | 'ranked' | null>(null);
  useMusicMode(roomMode === 'casual' ? 'match' : 'off');
  const [toast, setToast] = useState<string | null>(null);
  /** Tela F1–F5 aberta (OG-066); `auto` = aberta sozinha no fim da partida (`stats_autoshowing`). */
  const [info, setInfo] = useState<{ kind: InfoKind; auto: boolean } | null>(null);
  const toggleInfo = useRef<(kind: InfoKind) => void>(() => {});
  toggleInfo.current = (kind) => setInfo((cur) => (cur?.kind === kind ? null : { kind, auto: false }));
  const host = useRef<GameHost | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  // demonstração num mapa com bandeiras e áreas de time
  const map = params.get('map') ?? (params.has('demo') ? 'sisso' : DEFAULT_MAP);
  const theme = params.get('theme') ?? prefs.graphicsTheme;
  const rooms = Number(params.get('rooms')) || prefs.visibleRooms;
  const room = params.get('room') ?? '0,0';
  const demo = Number(params.get('demo') ?? 0);
  const onlineKey = !params.has('map') && !params.has('demo') ? params.toString() : null;

  useEffect(() => {
    if (!hostRef.current) return;
    const [rx, ry] = room.split(',').map(Number);
    let online: OnlineOptions | undefined;
    if (onlineKey !== null) {
      const lag = Number(params.get('lag') ?? 0);
      const loss = Number(params.get('loss') ?? 0) / 100;
      online = {
        url: params.get('server') ?? defaultServerUrl(),
        explicitServer: params.has('server'),
        room: params.get('sala') ?? 'main',
        name: params.get('name') ?? (prefs.playerName.trim() || 'Convidado'),
        ...(password ? { password } : {}),
        telemetry: prefs.shareNetStats,
        ...(lag > 0 || loss > 0 ? { simulate: { rttMs: lag, jitterMs: lag / 10, loss } } : {}),
      };
    }
    const game = mountGame(hostRef.current, {
      ...(online ? { online } : {}),
      map,
      theme,
      visibleRooms: rooms,
      continuousTextures: prefs.continuousTextures,
      room: [rx || 0, ry || 0],
      demoPlayers: demo,
      demoStress: params.get('stress') === '1',
      font: GAME_FONT,
      bindings: prefs.bindings,
      prediction: { enabled: prefs.lagPrediction, amount: prefs.lagPredictionAmount },
      translate: (text, ...args) => tRef.current(text, ...args),
      sound: { enabled: prefs.soundEnabled, volume: prefs.soundVolume },
      colourTheme: prefs.colourTheme,
      preferThemeColours: prefs.preferThemeColours,
      client: clientOptions(prefs),
      onStatus: setStatus,
      onRoomMode: setRoomMode,
      onAction: (action) => {
        const t = tRef.current;
        if (action === 'menu') setMenuOpen(true);
        else if (action === 'focusMode') setToast(t('Focus mode: full screen, browser shortcuts captured (F10 or Esc leaves).'));
        else if (action === 'toggleSound') toggleSound.current();
        else if (action === 'help') toggleInfo.current('help');
        else if (action === 'serverInfo' && onlineKey !== null) toggleInfo.current('server');
        else if (action === 'mapList' && onlineKey !== null) toggleInfo.current('maps');
        else if (action === 'teamStats' && onlineKey !== null) toggleInfo.current('teams');
        else if (action === 'playerStats' && onlineKey !== null) toggleInfo.current('players');
        else if (action === 'toggleNames') toggleNames.current();
        // na partida online o host trata Insert, F12 e Ctrl+End; telas F1–F5/F8 são do OG-045/066
        else if (action !== 'suicide' && (onlineKey === null || !['moreMessages', 'fullPlayfield', 'changeTeam', 'voteMapChange'].includes(action))) setToast(t('$1: coming soon', t(ACTION_LABELS[action])));
      },
    });
    host.current = game;
    return () => game.destroy();
  }, [map, theme, rooms, room, demo, params, prefs.continuousTextures, prefs.colourTheme, prefs.preferThemeColours]);

  // OG-232: na partida online, fechar a aba (Ctrl/Cmd+W ou Q sem querer) pede confirmação, e a dica do
  // modo foco aparece uma vez por navegador
  useEffect(() => {
    if (onlineKey === null) return;
    const confirmLeave = (ev: BeforeUnloadEvent) => ev.preventDefault();
    addEventListener('beforeunload', confirmLeave);
    try {
      if (!localStorage.getItem(FOCUS_HINT_KEY)) {
        localStorage.setItem(FOCUS_HINT_KEY, '1');
        setToast(tRef.current('Tip: F10 plays in focus mode, which keeps browser shortcuts inside the game.'));
      }
    } catch {
      // sem armazenamento: sem dica
    }
    return () => removeEventListener('beforeunload', confirmLeave);
  }, [onlineKey]);

  // opções que mudam sem recarregar a partida
  const client = clientOptions(prefs);
  const clientKey = JSON.stringify(client);
  useEffect(() => host.current?.setClient(JSON.parse(clientKey) as ClientOptions), [clientKey]);

  useEffect(() => host.current?.setBindings(prefs.bindings), [prefs.bindings]);
  useEffect(() => host.current?.setSound({ enabled: prefs.soundEnabled, volume: prefs.soundVolume }), [prefs.soundEnabled, prefs.soundVolume]);
  // Ctrl+M: liga e desliga o som (e grava a preferência)
  const toggleSound = useRef(() => {});
  // Ctrl+N / F6: nomes "nunca" ↔ "na mesma sala" (Ctrl+F3 do original)
  const toggleNames = useRef(() => {});
  toggleNames.current = () => setPrefs({ showNames: prefs.showNames === 'never' ? 'sameRoom' : 'never' });
  toggleSound.current = () => setPrefs({ soundEnabled: !prefs.soundEnabled });
  useEffect(
    () => host.current?.setPrediction({ enabled: prefs.lagPrediction, amount: prefs.lagPredictionAmount }),
    [prefs.lagPrediction, prefs.lagPredictionAmount],
  );
  // lobby Ranked (OG-256): a tela cobre a partida enquanto a sala não está em jogo
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const lobbyAt = useRef<{ msg: unknown; at: number }>({ msg: null, at: 0 });
  // série (OG-257): placar na faixa do topo durante o jogo; no fim de um jogo, o placar final fica na
  // tela por `game_end_delay` antes de o lobby (ou o fim da série) aparecer
  const [series, setSeries] = useState<SeriesBar | null>(null);
  const endHold = useRef({ phase: '', until: 0 });
  useEffect(() => {
    if (onlineKey === null) return;
    const id = setInterval(() => {
      const s = host.current?.session();
      const l = s?.lobby;
      if (!s || !l) {
        setSeries(null);
        return setLobby(null);
      }
      const now = performance.now();
      if (endHold.current.phase === 'game' && l.phase !== 'game') endHold.current.until = now + s.settings.server.gameEndDelay * 1000;
      endHold.current.phase = l.phase;
      const holding = now < endHold.current.until;
      setSeries(l.bestOf > 1 && (l.phase === 'game' || holding) ? { bestOf: l.bestOf, gameNo: l.gameNo, red: l.seriesRed, blue: l.seriesBlue } : null);
      if (l.phase === 'game' || holding) return setLobby(null);
      if (lobbyAt.current.msg !== l) lobbyAt.current = { msg: l, at: now };
      setLobby({
        lobby: l,
        at: lobbyAt.current.at,
        me: s.me,
        maxPlayers: s.maxPlayers,
        names: new Map(s.names),
        maps: s.mapList.map((m) => ({ file: m.file, title: m.title })),
        chat: host.current?.chat(8) ?? [],
      });
    }, 250);
    return () => clearInterval(id);
  }, [onlineKey]);
  const inLobby = lobby !== null;
  useEffect(() => host.current?.setInputEnabled(!menuOpen && !inLobby), [menuOpen, inLobby]);

  // `netStatsReady`/`netGameStarted`: F3/F4 abrem sozinhas no fim da partida e fecham no começo da
  // próxima; F5 abre ao conectar com `Show server info when connected` (OG-066)
  const auto = useRef({ statsReady: -1, gameOver: false, serverShown: false });
  // placar de fim de partida na tela (também exposto em data-game-over para os testes E2E)
  const [gameOver, setGameOver] = useState(false);
  // fim da última partida vista nesta sala: "Ver relatório" (OG-214) busca a partida terminada depois disso
  const [lastGameOverAt, setLastGameOverAt] = useState<number | null>(null);
  useEffect(() => {
    if (onlineKey === null) return;
    const id = setInterval(() => {
      const s = host.current?.session();
      if (!s) return;
      const a = auto.current;
      if (a.statsReady < 0) a.statsReady = s.statsReadyCount;
      if (s.statsReadyCount !== a.statsReady) {
        a.statsReady = s.statsReadyCount;
        if (prefs.showStats !== 'off') setInfo((cur) => cur ?? { kind: prefs.showStats === 'teams' ? 'teams' : 'players', auto: true });
      }
      if (a.gameOver && !s.gameOver) setInfo((cur) => (cur?.auto ? null : cur));
      if (!a.gameOver && s.gameOver !== null) setLastGameOverAt(Date.now());
      a.gameOver = s.gameOver !== null;
      setGameOver(a.gameOver);
      if (!a.serverShown && s.me >= 0 && s.world) {
        a.serverShown = true;
        if (prefs.showServerInfo) setInfo((cur) => cur ?? { kind: 'server', auto: false });
      }
    }, 250);
    return () => clearInterval(id);
  }, [onlineKey, prefs.showStats, prefs.showServerInfo]);

  // aviso curto das ações (some em 2 s)
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  // fechar a aba no meio da partida (ex.: Ctrl+W com o tiro apertado) pede confirmação
  useEffect(() => {
    const guard = (ev: BeforeUnloadEvent) => ev.preventDefault();
    addEventListener('beforeunload', guard);
    return () => removeEventListener('beforeunload', guard);
  }, []);

  useEffect(() => {
    if (menuOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        setMenuOpen(true);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const sala = params.get('sala');
  // margem de 1 min para o relógio do servidor (ended_at) e o do navegador
  const openReport = () => lastGameOverAt !== null && sala && void navigate(`/rooms/${encodeURIComponent(sala)}/report?${new URLSearchParams({ after: new Date(lastGameOverAt - 60_000).toISOString() })}`);
  const items: MenuItem[] = [
    { kind: 'action', label: t('Back to game'), onActivate: () => setMenuOpen(false) },
    ...(lastGameOverAt !== null && sala ? [{ kind: 'action' as const, label: t('View match report'), onActivate: openReport }] : []),
    {
      kind: 'action',
      label: t('Send feedback'),
      onActivate: () => void navigate(`/feedback?${new URLSearchParams({ sala: params.get('sala') ?? 'main', ...(status?.kind === 'ready' ? { mapa: status.map.title } : {}) })}`),
    },
    { kind: 'action', label: t('Leave game'), onActivate: () => void navigate('/') },
  ];

  return (
    <div className="game" data-status={status?.kind ?? 'loading'} data-game-over={gameOver ? '1' : '0'} data-map={status?.kind === 'ready' ? status.map.title : ''}>
      <div ref={hostRef} className="game-host" />
      <div className="game-overlay">
        {toast && !menuOpen && (
          <p className="game-toast" role="status">
            <BitmapText text={toast} />
          </p>
        )}
        {series && !lobby && (
          <p className="series-bar" role="status">
            {`${t('Best of $1', String(series.bestOf))} · ${t('Game $1 of $2', String(Math.min(series.gameNo, series.bestOf)), String(series.bestOf))} · ${t('Red')} ${series.red} × ${series.blue} ${t('Blue')}`}
          </p>
        )}
        {lobby && !menuOpen && (
          <RankedLobby view={lobby} host={host.current} onLeave={() => void navigate('/rooms', { state: { mode: 'ranked' } })} onFinished={() => void navigate('/')}
            {...(lastGameOverAt !== null && sala ? { onReport: openReport } : {})} />
        )}
        {info && !menuOpen && <InfoOverlay kind={info.kind} host={host.current} onClose={() => setInfo(null)} />}
        {gameOver && sala && !menuOpen && !lobby && (
          <Button variant="primary" className="game-report" onClick={openReport}>
            {t('View match report')}
          </Button>
        )}
        {menuOpen ? (
          <Menu caption="Outgun" items={items} onBack={() => setMenuOpen(false)} />
        ) : lobby || (onlineKey !== null && status?.kind === 'ready') ? null : (
          <p className="game-hint">
            <BitmapText
              text={
                status?.kind === 'error'
                  ? status.message
                  : status?.kind === 'ready'
                    ? `${status.map.title} - ${t('Press Esc for the menu')}`
                    : status?.kind === 'connecting'
                      ? t('Connecting to the game server...')
                      : status?.kind === 'reconnecting'
                        ? t('Connection lost. Reconnecting...')
                        : t('Press Esc for the menu')
              }
            />
          </p>
        )}
      </div>
    </div>
  );
}
