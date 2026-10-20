// SPDX-License-Identifier: GPL-2.0-or-later
// Tocador da trilha na tela inicial: faixa atual com os metadados (título, artista, álbum, ano),
// progresso, pausar, próxima faixa e mudo. O mudo é uma preferência; a pausa vale só para o menu.
import { useEffect, useState } from 'react';
import { usePrefs } from '../prefs.js';
import { useMusic, useMusicState } from './MusicProvider.js';

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ICONS = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" fill="currentColor" stroke="none" />,
  next: (
    <>
      <path d="M5 5v14l10-7z" fill="currentColor" stroke="none" />
      <path d="M18 5v14" />
    </>
  ),
  sound: <path d="M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />,
  muted: <path d="M4 9h4l5-4v14l-5-4H4zM16 9.5l5 5M21 9.5l-5 5" />,
} as const;

function DockIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

export function MusicDock() {
  const { t, prefs, setPrefs } = usePrefs();
  const player = useMusic();
  const { status, track, muted } = useMusicState();
  const [position, setPosition] = useState<{ time: number; duration: number } | null>(null);
  const active = status === 'playing' || status === 'paused';

  useEffect(() => {
    if (!player || !active) return setPosition(null);
    const tick = () => setPosition(player.position());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [player, active, track]);

  if (!player || status === 'idle') return null;

  const details = track ? [track.artist, track.album, track.year].filter(Boolean).join(' · ') : '';
  const progress = position && position.duration > 0 ? Math.min(1, position.time / position.duration) : 0;

  return (
    <section className={`music-dock ${status}${muted ? ' muted' : ''}`} aria-label={t('Soundtrack')}>
      <div className="music-dock-eq" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="music-dock-info">
        <p className="music-dock-kicker">{t('Soundtrack')}</p>
        {status === 'disabled' ? (
          <p className="music-dock-title message">{t('The soundtrack is off.')}</p>
        ) : status === 'locked' || !track ? (
          <p className="music-dock-title message">{t('Press play or any key to start the music.')}</p>
        ) : (
          <>
            <p className="music-dock-title" title={track.title}>
              {track.title}
            </p>
            {details && <p className="music-dock-details">{details}</p>}
          </>
        )}
        {active && (
          <div className="music-dock-progress">
            <span className="music-dock-time">{clock(position?.time ?? 0)}</span>
            <span className="music-dock-bar">
              <span style={{ transform: `scaleX(${progress})` }} />
            </span>
            <span className="music-dock-time">{clock(position?.duration ?? track?.duration ?? 0)}</span>
          </div>
        )}
      </div>
      <div className="music-dock-controls">
        {status === 'disabled' ? (
          <button type="button" className="music-dock-button wide" onClick={() => setPrefs({ musicEnabled: true })}>
            {t('Turn on')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="music-dock-button main"
              aria-label={status === 'playing' ? t('Pause music') : t('Play music')}
              title={status === 'playing' ? t('Pause music') : t('Play music')}
              // ainda bloqueado: o próprio clique é o gesto que libera o áudio (MusicProvider)
              onClick={() => (status === 'playing' ? player.pause() : player.resume())}
            >
              <DockIcon name={status === 'playing' ? 'pause' : 'play'} />
            </button>
            <button type="button" className="music-dock-button" aria-label={t('Next track')} title={t('Next track')} disabled={!active} onClick={() => player.skip()}>
              <DockIcon name="next" />
            </button>
            <button
              type="button"
              className="music-dock-button"
              aria-label={t('Mute music')}
              title={muted ? t('Unmute music') : t('Mute music')}
              aria-pressed={prefs.musicMuted}
              onClick={() => setPrefs({ musicMuted: !prefs.musicMuted })}
            >
              <DockIcon name={muted ? 'muted' : 'sound'} />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
