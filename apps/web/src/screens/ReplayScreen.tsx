// SPDX-License-Identifier: GPL-2.0-or-later
// Player de replay (OG-091): `/replay?src=URL&t=SEGUNDOS` (ou um arquivo escolhido em /replays), com a
// barra de tempo, a velocidade e um link compartilhável que guarda o ponto atual.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { mountReplay, readReplay, type ReplayHost, type ReplayStatus } from '../game/replay-host.js';

const clock = (frames: number) => {
  const s = Math.floor(frames / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const rateText = (rate: number) => (rate >= 1 ? `${rate}×` : `1/${1 / rate}×`);

export default function ReplayScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const localFile = (useLocation().state as { file?: File } | null)?.file;
  const src = params.get('src');
  const start = Number(params.get('t') ?? 0);
  const hostRef = useRef<HTMLDivElement>(null);
  const host = useRef<ReplayHost | null>(null);
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const el = hostRef.current;
    let cancelled = false;
    const load = async () => {
      if (localFile) return localFile.arrayBuffer();
      if (!src) throw new Error(t('No replay chosen.'));
      const res = await fetch(src);
      if (!res.ok) throw new Error(`${t('Replay not found')} (${res.status})`);
      return res.arrayBuffer();
    };
    load()
      .then(readReplay)
      .then((replay) => {
        if (cancelled) return;
        host.current = mountReplay(el, replay, {
          theme: prefs.graphicsTheme,
          visibleRooms: prefs.visibleRooms,
          continuousTextures: prefs.continuousTextures,
          font: prefs.menuFont,
          colourTheme: prefs.colourTheme,
          preferThemeColours: prefs.preferThemeColours,
          startSeconds: start,
          onStatus: setStatus,
          onError: setError,
        });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      host.current?.destroy();
      host.current = null;
    };
    // as preferências valem na abertura do replay
  }, [src, localFile]);

  const link = () => {
    if (!src || !status) return;
    const url = new URL(location.href);
    url.searchParams.set('t', String(Math.floor(status.position / 10)));
    void navigator.clipboard?.writeText(url.toString()).then(() => setCopied(true));
  };

  return (
    <div className="game replay" data-status={error ? 'error' : status ? 'ready' : 'loading'}>
      <div ref={hostRef} className="game-host" />
      <div className="game-overlay">
        {error && (
          <p className="game-toast" role="alert">
            {error}
          </p>
        )}
        {status && (
          <div className="replay-bar">
            <span>
              {t('Replay')} · {status.mapTitle} · {clock(status.position)} / {clock(status.length)} · {rateText(status.rate)}
              {status.paused ? ` · ${t('paused')}` : ''}
              {status.following ? ` · ${t('following $1', status.following)}` : ` · ${t('room $1', `${status.room[0]},${status.room[1]}`)}`}
            </span>
            <input
              type="range"
              aria-label={t('Position')}
              min={0}
              max={status.length}
              value={status.position}
              onChange={(ev) => host.current?.seek(Number(ev.target.value))}
            />
            <span className="replay-buttons">
              <button type="button" onClick={() => host.current?.togglePause()}>
                {status.paused ? t('Play') : t('Pause')}
              </button>
              {src && (
                <button type="button" onClick={link}>
                  {copied ? t('Link copied') : t('Copy link')}
                </button>
              )}
              <button type="button" onClick={() => void navigate(-1)}>
                {t('Back')}
              </button>
            </span>
            <small>{t('PgUp/PgDn speed · Home normal · P pause · arrows room · F follow player · keypad +/- zoom')}</small>
          </div>
        )}
      </div>
    </div>
  );
}
