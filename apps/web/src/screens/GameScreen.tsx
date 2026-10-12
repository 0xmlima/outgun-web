// SPDX-License-Identifier: GPL-2.0-or-later
// Rota do jogo: o PixiJS desenha num canvas próprio controlado por `mountGame`; o React desenha só
// os overlays (menu do Esc, como no original: "While in the game, press esc to open the menu").
// Parâmetros de URL (para comparação com o original): ?map=NOME&theme=TEMA&rooms=N&room=X,Y.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { DEFAULT_MAP, mountGame, type GameStatus } from '../game/host.js';
import { BitmapText } from '../ui/BitmapText.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

export default function GameScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<GameStatus | null>(null);

  const map = params.get('map') ?? DEFAULT_MAP;
  const theme = params.get('theme') ?? prefs.graphicsTheme;
  const rooms = Number(params.get('rooms')) || prefs.visibleRooms;
  const room = params.get('room') ?? '0,0';

  useEffect(() => {
    if (!hostRef.current) return;
    const [rx, ry] = room.split(',').map(Number);
    const host = mountGame(hostRef.current, {
      map,
      theme,
      visibleRooms: rooms,
      continuousTextures: prefs.continuousTextures,
      room: [rx || 0, ry || 0],
      onStatus: setStatus,
    });
    return () => host.destroy();
  }, [map, theme, rooms, room, prefs.continuousTextures]);

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
