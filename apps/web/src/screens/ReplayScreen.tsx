// SPDX-License-Identifier: GPL-2.0-or-later
// Player de replay (OG-091): `/replay?src=URL&t=SEGUNDOS` (ou um arquivo escolhido em /replays), com a
// barra de tempo, a velocidade e um link compartilhável que guarda o ponto atual. Espectador ao vivo
// (OG-092): `/spectate?src=wss://.../rooms/ID/spectate` (ou `?sala=ID` no servidor padrão) toca o stream
// da sala com o atraso de `spectating_delay`.
import { GENERATED_MAP, serverHttpBase } from '../game/host.js';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { GAME_FONT } from '../ui/fonts.js';
import { decodeFrame, PROTOCOL_VERSION, type Replay } from '@outgun/protocol';
import { defaultServerUrl } from '../game/net/connection.js';
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
          font: GAME_FONT,
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

export function SpectateScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const src = params.get('src') ?? `${defaultServerUrl()}/rooms/${encodeURIComponent(params.get('sala') ?? 'main')}/spectate`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  const [delay, setDelay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = mountReplay(hostRef.current, null, {
      theme: prefs.graphicsTheme,
      visibleRooms: prefs.visibleRooms,
      continuousTextures: prefs.continuousTextures,
      font: GAME_FONT,
      colourTheme: prefs.colourTheme,
      preferThemeColours: prefs.preferThemeColours,
      live: true,
      onStatus: setStatus,
      onError: setError,
    });
    const ws = new WebSocket(src);
    ws.binaryType = 'arraybuffer';
    /** Partida em curso; `awaitingInit`: o próximo pacote é o estado inicial dela. */
    let replay: Replay | null = null;
    let awaitingInit = false;
    let mapText: Promise<string | undefined> = Promise.resolve(undefined);
    ws.onmessage = (ev) => {
      const r = decodeFrame(new Uint8Array(ev.data as ArrayBuffer), 's2c');
      if (!r.ok) return;
      const start = r.messages.find((m) => m.type === 'spectatorStart');
      const reject = r.messages.find((m) => m.type === 'reject');
      if (reject?.type === 'reject') return setError(reject.text || reject.reason);
      if (start?.type === 'spectatorStart') {
        if (start.protocol !== PROTOCOL_VERSION) return setError(t('This server uses another version of the game.'));
        setDelay(start.delay);
        replay = {
          version: 1,
          protocol: start.protocol,
          header: { roomId: '', mode: '', preset: '', map: start.map, mapTitle: start.mapTitle, maxPlayers: start.maxPlayers, startedAt: '', startFrame: 0, frames: 0 },
          init: [],
          frames: [],
        };
        // mapa gerado na hora (OG-015): o texto vem do game server antes de começar
        const current = replay;
        mapText = GENERATED_MAP.test(start.map)
          ? fetch(`${serverHttpBase(src)}/maps/${start.map}.txt`).then(
              (res) => (res.ok ? res.text() : undefined),
              () => undefined,
            )
          : Promise.resolve(undefined);
        void mapText.then((text) => {
          if (text !== undefined) current.header.mapText = text;
        });
        awaitingInit = true;
      } else if (replay && awaitingInit) {
        replay.init = r.messages;
        awaitingInit = false;
        const ready = replay;
        void mapText.then(() => host.setReplay(ready));
      } else replay?.frames.push(r.messages);
    };
    ws.onclose = (ev) => ev.code !== 1000 && setError(`${t('Disconnected')} (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`);
    return () => {
      ws.onclose = null;
      ws.close();
      host.destroy();
    };
    // as preferências valem na abertura
  }, [src]);

  return (
    <div className="game replay" data-status={error ? 'error' : status ? 'ready' : 'loading'}>
      <div ref={hostRef} className="game-host" />
      <div className="game-overlay">
        {error && (
          <p className="game-toast" role="alert">
            {error}
          </p>
        )}
        {!error && !status && delay !== null && (
          <p className="game-toast" role="status">
            {t('Live with $1 s delay: the match appears after the delay.', String(delay))}
          </p>
        )}
        {status && (
          <div className="replay-bar">
            <span>
              {t('Live')} · {status.mapTitle} · {t('$1 s delay', String(delay ?? 0))}
              {status.following ? ` · ${t('following $1', status.following)}` : ` · ${t('room $1', `${status.room[0]},${status.room[1]}`)}`}
            </span>
            <span className="replay-buttons">
              <button type="button" onClick={() => void navigate(-1)}>
                {t('Back')}
              </button>
            </span>
            <small>{t('Arrows room · F follow player · keypad +/- zoom')}</small>
          </div>
        )}
      </div>
    </div>
  );
}
