// SPDX-License-Identifier: GPL-2.0-or-later
// Trilha na barra de cima (ao lado do sino e da conta), em todas as telas fora da partida: o alto-falante
// toca ou pausa num clique; a setinha abre o painel com o tocador completo (`MusicDock`: faixa,
// progresso, próxima e mudo). Com a trilha desligada nas opções, o clique liga.
import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../prefs.js';
import { MusicDock } from './MusicDock.js';
import { useMusic, useMusicState } from './MusicProvider.js';

const SPEAKER = 'M4 9h4l5-4v14l-5-4H4z';

export function MusicButton() {
  const { t, setPrefs } = usePrefs();
  const player = useMusic();
  const { status, muted } = useMusicState();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent | KeyboardEvent) => {
      if (ev instanceof KeyboardEvent ? ev.key === 'Escape' : !box.current?.contains(ev.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  if (!player || status === 'idle') return null;

  const playing = status === 'playing' && !muted;
  const label = status === 'disabled' ? t('Turn on') : status === 'playing' ? t('Pause music') : t('Play music');
  // ainda bloqueado: o próprio clique é o gesto que libera o áudio (MusicProvider)
  const toggle = () => (status === 'disabled' ? setPrefs({ musicEnabled: true }) : status === 'playing' ? player.pause() : player.resume());
  return (
    <div className="app-bell app-music" ref={box}>
      <button type="button" className={`app-bell-button app-music-toggle${playing ? ' playing' : ''}`} aria-label={label} title={label} onClick={toggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true" focusable="false">
          <path d={SPEAKER} />
          {playing ? <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
        </svg>
      </button>
      <button type="button" className="app-music-more" aria-label={t('Soundtrack')} title={t('Soundtrack')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M2 4h8L6 9z" />
        </svg>
      </button>
      {open && (
        <div className="app-bell-panel app-music-panel" role="dialog" aria-label={t('Soundtrack')}>
          <MusicDock />
        </div>
      )}
    </div>
  );
}
