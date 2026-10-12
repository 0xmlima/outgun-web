// SPDX-License-Identifier: GPL-2.0-or-later
// Rota do jogo: canvas em tela cheia controlado por `mountGame`; o React desenha só os overlays
// (menu do Esc, como no original: "While in the game, press esc to open the menu").
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { mountGame } from '../game/host.js';
import { BitmapText } from '../ui/BitmapText.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

export default function GameScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const host = mountGame(canvasRef.current);
    return () => host.destroy();
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
    <div className="game">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Outgun" />
      <div className="game-overlay">
        {menuOpen ? (
          <Menu caption="Outgun" items={items} onBack={() => setMenuOpen(false)} />
        ) : (
          <p className="game-hint">
            <BitmapText text={t('Press Esc for the menu')} />
          </p>
        )}
      </div>
    </div>
  );
}
