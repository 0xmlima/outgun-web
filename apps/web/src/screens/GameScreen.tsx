// SPDX-License-Identifier: GPL-2.0-or-later
// Rota do jogo: o PixiJS desenha num canvas próprio controlado por `mountGame`; o React desenha só
// os overlays (menu do Esc, como no original: "While in the game, press esc to open the menu").
// Parâmetros de URL: ?map=NOME&theme=TEMA&rooms=N&room=X,Y&demo=JOGADORES. Sem `map`, até a conexão
// com o servidor (OG-064), "Jogar agora" abre uma partida local de demonstração com 8 jogadores.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { DEFAULT_MAP, mountGame, type GameHost, type GameStatus } from '../game/host.js';
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
  const map = params.get('map') ?? (params.has('demo') || !params.size ? 'sisso' : DEFAULT_MAP);
  const theme = params.get('theme') ?? prefs.graphicsTheme;
  const rooms = Number(params.get('rooms')) || prefs.visibleRooms;
  const room = params.get('room') ?? '0,0';
  const demo = Number(params.get('demo') ?? (params.has('map') ? 0 : 8));

  useEffect(() => {
    if (!hostRef.current) return;
    const [rx, ry] = room.split(',').map(Number);
    const game = mountGame(hostRef.current, {
      map,
      theme,
      visibleRooms: rooms,
      continuousTextures: prefs.continuousTextures,
      room: [rx || 0, ry || 0],
      demoPlayers: demo,
      demoStress: params.get('stress') === '1',
      font: prefs.menuFont,
      bindings: prefs.bindings,
      onStatus: setStatus,
      onAction: (action) => {
        const t = tRef.current;
        if (action === 'menu') setMenuOpen(true);
        else if (action === 'focusMode') setToast(t('Focus mode: full screen, browser shortcuts captured (F10 or Esc leaves).'));
        // telas e mensagens dos cards OG-044/045/065/066/067
        else if (action !== 'suicide') setToast(t('$1: coming soon', t(ACTION_LABELS[action])));
      },
    });
    host.current = game;
    return () => game.destroy();
  }, [map, theme, rooms, room, demo, params, prefs.continuousTextures, prefs.menuFont]);

  useEffect(() => host.current?.setBindings(prefs.bindings), [prefs.bindings]);
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
        ) : (
          <p className="game-hint">
            <BitmapText
              text={
                status?.kind === 'error'
                  ? status.message
                  : status?.kind === 'ready'
                    ? `${status.map.title} - ${t('Press Esc for the menu')}`
                    : t('Press Esc for the menu')
              }
            />
          </p>
        )}
      </div>
    </div>
  );
}
