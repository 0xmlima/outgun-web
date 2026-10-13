// SPDX-License-Identifier: GPL-2.0-or-later
// Rota do jogo: o PixiJS desenha num canvas próprio controlado por `mountGame`; o React desenha só
// os overlays (menu do Esc, como no original: "While in the game, press esc to open the menu").
// Sem parâmetros, "Jogar agora" entra na sala do servidor de jogo (OG-064). Parâmetros de URL:
// ?server=ws://...&sala=ID&name=NOME&lag=MS&loss=PCT (partida; lag/loss simulam rede ruim),
// ?demo=JOGADORES (partida local) e ?map=NOME&theme=TEMA&rooms=N&room=X,Y (visualizador de mapa).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { DEFAULT_MAP, mountGame, type GameHost, type GameStatus, type OnlineOptions } from '../game/host.js';
import { defaultServerUrl } from '../game/net/connection.js';
import { ACTION_LABELS } from '../game/input/bindings.js';
import { BitmapText } from '../ui/BitmapText.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

export default function GameScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
        room: params.get('sala') ?? 'main',
        name: params.get('name') ?? 'Convidado',
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
      font: prefs.menuFont,
      bindings: prefs.bindings,
      prediction: { enabled: prefs.lagPrediction, amount: prefs.lagPredictionAmount },
      translate: (text, ...args) => tRef.current(text, ...args),
      onStatus: setStatus,
      onAction: (action) => {
        const t = tRef.current;
        if (action === 'menu') setMenuOpen(true);
        else if (action === 'focusMode') setToast(t('Focus mode: full screen, browser shortcuts captured (F10 or Esc leaves).'));
        // telas e mensagens dos cards OG-044/045/066/067
        else if (action !== 'suicide' && action !== 'moreMessages' && action !== 'fullPlayfield') setToast(t('$1: coming soon', t(ACTION_LABELS[action])));
      },
    });
    host.current = game;
    return () => game.destroy();
  }, [map, theme, rooms, room, demo, params, prefs.continuousTextures, prefs.menuFont]);

  useEffect(() => host.current?.setBindings(prefs.bindings), [prefs.bindings]);
  useEffect(
    () => host.current?.setPrediction({ enabled: prefs.lagPrediction, amount: prefs.lagPredictionAmount }),
    [prefs.lagPrediction, prefs.lagPredictionAmount],
  );
  useEffect(() => host.current?.setInputEnabled(!menuOpen), [menuOpen]);

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

  const items: MenuItem[] = [
    { kind: 'action', label: t('Back to game'), onActivate: () => setMenuOpen(false) },
    { kind: 'action', label: t('Leave game'), onActivate: () => void navigate('/') },
  ];

  return (
    <div className="game" data-status={status?.kind ?? 'loading'}>
      <div ref={hostRef} className="game-host" />
      <div className="game-overlay">
        {toast && !menuOpen && (
          <p className="game-toast" role="status">
            <BitmapText text={toast} />
          </p>
        )}
        {menuOpen ? (
          <Menu caption="Outgun" items={items} onBack={() => setMenuOpen(false)} />
        ) : onlineKey !== null && status?.kind === 'ready' ? null : (
          <p className="game-hint">
            <BitmapText
              text={
                status?.kind === 'error'
                  ? status.message
                  : status?.kind === 'ready'
                    ? `${status.map.title} - ${t('Press Esc for the menu')}`
                    : status?.kind === 'connecting'
                      ? t('Connecting to the game server...')
                      : t('Press Esc for the menu')
              }
            />
          </p>
        )}
      </div>
    </div>
  );
}
