// SPDX-License-Identifier: GPL-2.0-or-later
// Tela do lobby Ranked (OG-256, RN-RKL-07..12): por cima da partida enquanto a sala não está em jogo.
// Time vermelho à esquerda, azul à direita e, no centro, a série, a fase, o voto de mapa, o "Pronto" e
// a contagem; chat da sala embaixo. Tudo vem do `lobbyState` (game server, OG-252..254); as ações vão
// como `lobbyReady`/`lobbyVote`/`lobbySide`/`lobbySwapAnswer`.
import type { MessageOf } from '@outgun/protocol';
import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import type { GameHost } from '../game/host.js';
import { Badge, Button } from '../ui/Button.js';
import { TextField } from '../ui/Field.js';
import { MapPreview } from './MapPreview.js';
import { phaseLabel } from './ranked-rooms.js';

type LobbyState = MessageOf<'lobbyState'>;
const NONE = 255;

export interface LobbyView {
  lobby: LobbyState;
  /** Quando o `lobbyState` chegou (performance.now): os segundos contam a partir daí. */
  at: number;
  me: number;
  maxPlayers: number;
  names: ReadonlyMap<number, string>;
  maps: readonly { file: string; title: string }[];
  chat: { team: number; text: string }[];
}

/** Lado de um pid (`teamOf` do game server): primeira metade vermelha, segunda azul. */
export const sideOf = (pid: number, maxPlayers: number): 0 | 1 => (pid < maxPlayers / 2 ? 0 : 1);

/** Votos por mapa a partir dos membros. */
export function voteCounts(lobby: LobbyState, mapCount: number): number[] {
  const counts = Array.from({ length: mapCount }, () => 0);
  for (const m of lobby.members) if (m.vote >= 0 && m.vote < mapCount) counts[m.vote]!++;
  return counts;
}

/** Segundos que faltam na fase (o servidor manda no começo dela; aqui desconta o que passou). */
export function secondsLeft(view: Pick<LobbyView, 'lobby' | 'at'>, now: number): number {
  return Math.max(0, Math.ceil(view.lobby.seconds - (now - view.at) / 1000));
}

/** Fim da série (ou de uma md1): o resultado fica na tela e todos voltam ao menu inicial (D-41). */
export const FINISHED_SECONDS = 10;

export function RankedLobby({ view, host, onLeave, onFinished, onReport }: { view: LobbyView; host: GameHost | null; onLeave: () => void; onFinished: () => void; onReport?: () => void }) {
  const { t, prefs } = usePrefs();
  const { lobby, me, maxPlayers, names } = view;
  const [now, setNow] = useState(() => performance.now());
  const [chat, setChat] = useState('');
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  const send = (m: Parameters<GameHost['sendLobby']>[0]) => host?.sendLobby(m);
  const mine = lobby.members.find((m) => m.pid === me);
  const mySide = sideOf(me, maxPlayers);
  const side = (s: 0 | 1) => lobby.members.filter((m) => sideOf(m.pid, maxPlayers) === s);
  const otherFull = side(mySide === 0 ? 1 : 0).length >= lobby.teamSize;
  const open = lobby.phase !== 'game' && lobby.phase !== 'finished';
  const name = (pid: number) => names.get(pid) ?? `#${pid}`;
  const incoming = lobby.swaps.filter((s) => s.to === me);
  const outgoing = lobby.swaps.find((s) => s.from === me);
  const seconds = secondsLeft(view, now);
  const counts = voteCounts(lobby, view.maps.length);
  const ready = lobby.phase === 'ready' || lobby.phase === 'countdown';
  const homeIn = lobby.phase === 'finished' ? Math.max(0, Math.ceil(FINISHED_SECONDS - (now - view.at) / 1000)) : null;
  useEffect(() => {
    if (homeIn === 0) onFinished();
  }, [homeIn, onFinished]);

  const team = (s: 0 | 1) => {
    const list = side(s);
    const empty = Math.max(0, lobby.teamSize - list.length);
    return (
      <section className={`ranked-team ${s === 0 ? 'red' : 'blue'}`} aria-label={s === 0 ? t('Red team') : t('Blue team')}>
        <h2>{s === 0 ? t('Red team') : t('Blue team')}</h2>
        <ul>
          {list.map((m) => (
            <li key={m.pid} className={m.pid === me ? 'me' : undefined}>
              <span className="ranked-name">{name(m.pid)}</span>
              {ready && (m.ready ? <Badge tone="success">{t('Ready')}</Badge> : <Badge>{t('Not ready')}</Badge>)}
              {lobby.phase === 'vote' && m.vote >= 0 && <Badge>{t('Voted')}</Badge>}
              {open && s !== mySide && otherFull && !outgoing && (
                <Button variant="ghost" onClick={() => send({ type: 'lobbySide', target: m.pid })}>
                  {t('Ask to swap')}
                </Button>
              )}
            </li>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`free-${i}`} className="free">
              {t('Open slot')}
            </li>
          ))}
        </ul>
        {open && s !== mySide && !otherFull && (
          <Button onClick={() => send({ type: 'lobbySide', target: NONE })}>
            {t('Move to this side')}
          </Button>
        )}
      </section>
    );
  };

  return (
    // o lobby fica dentro da tela da partida, fora da moldura dos menus: leva o tema dos menus (OG-316)
    <div className="ranked-lobby" data-menu-theme={prefs.menuTheme} role="dialog" aria-label={t('Ranked lobby')}>
      {team(0)}
      <section className="ranked-center">
        <p className="ranked-series">
          {lobby.bestOf > 1
            ? `${t('Game $1 of $2', String(lobby.gameNo), String(lobby.bestOf))} · ${t('Red')} ${lobby.seriesRed} × ${lobby.seriesBlue} ${t('Blue')}`
            : t('Single game')}
          {' · '}
          {`${lobby.teamSize}x${lobby.teamSize}`}
        </p>
        <h2 className="ranked-phase">
          {lobby.phase === 'countdown'
            ? t('Starting in $1', String(seconds))
            : lobby.phase === 'finished'
              ? lobby.seriesRed === lobby.seriesBlue
                ? t('Series tied')
                : lobby.seriesRed > lobby.seriesBlue
                  ? t('Red team wins the series')
                  : t('Blue team wins the series')
              : t(phaseLabel(lobby.phase))}
        </h2>
        {lobby.phase === 'lobby' && <p className="ui-muted">{t('$1 of $2 players. The vote starts when the room is full.', String(lobby.members.length), String(lobby.teamSize * 2))}</p>}
        {(lobby.phase === 'vote' || lobby.phase === 'ready') && seconds > 0 && (
          <p className="ui-muted" role="timer">
            {lobby.phase === 'vote' ? t('$1 s to vote', String(seconds)) : t('$1 s to mark Ready', String(seconds))}
          </p>
        )}
        {lobby.phase === 'vote' && (
          <ul className="ranked-maps">
            {view.maps.map((m, i) => (
              <li key={`${i}-${m.file}`}>
                <button type="button" className={`ranked-map${mine?.vote === i ? ' chosen' : ''}`} aria-pressed={mine?.vote === i} onClick={() => send({ type: 'lobbyVote', map: mine?.vote === i ? -1 : i })}>
                  {m.file !== 'random' ? <MapPreview name={m.file} label={m.title} /> : <span className="ranked-map-random">?</span>}
                  <span>{m.title}</span>
                  <Badge>{t('$1 votes', String(counts[i] ?? 0))}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        {ready && lobby.chosenMap >= 0 && (
          <p>
            {t('Map')}: <strong>{view.maps[lobby.chosenMap]?.title ?? '?'}</strong>
          </p>
        )}
        {ready && mine && (
          <Button variant={mine.ready ? 'secondary' : 'primary'} size="lg" autoFocus onClick={() => send({ type: 'lobbyReady', ready: !mine.ready })}>
            {mine.ready ? t('Cancel ready') : t('Ready')}
          </Button>
        )}
        {incoming.map((s) => (
          <div key={s.from} className="ranked-swap" role="alert">
            <span>{t('$1 wants to swap sides with you.', name(s.from))}</span>
            <Button variant="primary" onClick={() => send({ type: 'lobbySwapAnswer', from: s.from, accept: true })}>
              {t('Accept')}
            </Button>
            <Button variant="ghost" onClick={() => send({ type: 'lobbySwapAnswer', from: s.from, accept: false })}>
              {t('Decline')}
            </Button>
          </div>
        ))}
        {outgoing && <p className="ui-muted">{t('Swap request sent to $1.', name(outgoing.to))}</p>}
        {onReport && (
          <Button variant="ghost" onClick={onReport}>
            {t('View match report')}
          </Button>
        )}
        {homeIn !== null ? (
          <>
            <p className="ui-muted" role="timer">
              {t('Back to the main menu in $1 s.', String(homeIn))}
            </p>
            <Button variant="primary" onClick={onFinished}>
              {t('Main menu')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onLeave}>
            {t('Leave room')}
          </Button>
        )}
      </section>
      {team(1)}
      <section className="ranked-chat" aria-label={t('Room chat')}>
        <ChatLog lines={view.chat} />
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            host?.say(chat);
            setChat('');
          }}
        >
          <TextField label={t('Message')} value={chat} onChange={setChat} maxLength={200} />
        </form>
      </section>
    </div>
  );
}

function ChatLog({ lines }: { lines: { team: number; text: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);
  return (
    <ol ref={ref} className="ranked-chat-log" aria-live="polite">
      {lines.map((l, i) => (
        <li key={i} className={l.team === 0 ? 'red' : l.team === 1 ? 'blue' : undefined}>
          {l.text}
        </li>
      ))}
    </ol>
  );
}
