// SPDX-License-Identifier: GPL-2.0-or-later
// Tela inicial viva (OG-208): "Agora no Outgun" (jogadores online e salas com gente) e o leaderboard
// do mês (líder de cada stat principal, OG-353) com o meu rating (OG-351). Só leitura de endpoints que já existem; atualiza a
// cada 30 s enquanto a aba está visível.
import { chatName } from '@outgun/protocol';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../app/account.js';
import { api } from '../app/api.js';
import { fallbackMs, useLive, useLiveConnected, type LiveTopic } from '../app/live.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import type { RoomSummary } from './lobby.js';
import { OVERALL, STAT_LABELS, statValue, type StatOverview } from './leaderboard.js';
import { RatingInfo } from './rating-help.js';

/** "Agora no Outgun" acompanha o lobby (heartbeat de 3 s); o resto do portal relê a cada minuto (OG-283). */
export const LIVE_POLL_MS = 4000;
export const POLL_MS = 60_000;

/**
 * GET periódico que pausa com a aba escondida; `undefined` = carregando, `null` = erro/ausente. Com
 * `topic`, relê na hora a cada aviso do portal ao vivo (OG-284) e a consulta fica de reserva.
 */
export function usePolled<T>(path: string | null, everyMs = POLL_MS, topic: LiveTopic | null = null): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const current = useRef(path);
  current.current = path;
  useLive(topic, () => {
    const at = current.current;
    if (at) api<T>(at).then((d) => current.current === at && setData(d), () => undefined);
  });
  const every = fallbackMs(everyMs, useLiveConnected() && topic !== null);
  useEffect(() => {
    if (!path) return setData(null);
    let alive = true;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api<T>(path).then(
        (d) => alive && setData(d),
        () => alive && setData((cur) => (cur === undefined ? null : cur)),
      );
    };
    load();
    const id = setInterval(load, every);
    addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      clearInterval(id);
      removeEventListener('visibilitychange', load);
    };
  }, [path, every]);
  return data;
}

/**
 * Jogadores online (pessoas nas salas no ar, sem os bots: OG-282) e as salas com gente, mais cheias de
 * pessoas primeiro. A coluna da sala continua contando os bots (sala cheia).
 */
export function liveRooms(rooms: readonly RoomSummary[], max = 3): { online: number; busy: RoomSummary[] } {
  const live = rooms.filter((r) => r.online && r.humans > 0);
  return {
    online: live.reduce((n, r) => n + r.humans, 0),
    busy: [...live].sort((a, b) => b.humans - a.humans || b.players - a.players || a.name.localeCompare(b.name)).slice(0, max),
  };
}

export function NowPlaying() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const data = usePolled<{ rooms: RoomSummary[] }>('/rooms', LIVE_POLL_MS, 'rooms');
  const { online, busy } = liveRooms(data?.rooms ?? []);
  return (
    <Panel title={t('Now on Outgun')} actions={<Link to="/rooms">{t('Rooms')}</Link>}>
      {data === undefined ? (
        <p className="ui-muted">{t('Loading...')}</p>
      ) : data === null ? (
        <p className="ui-muted">{t('Could not reach the server.')}</p>
      ) : (
        <div className="ui-stack">
          <p className="home-online">
            <strong>{online}</strong> {online === 1 ? t('player online') : t('players online')}
          </p>
          {busy.length === 0 ? (
            <p className="ui-muted">{t('Nobody is playing right now. Start a match with "Play now" and others will join.')}</p>
          ) : (
            <Table
              caption={t('Rooms with players')}
              rows={busy}
              rowKey={(r) => r.id}
              onRowActivate={(r) => void navigate(`/rooms/${encodeURIComponent(r.id)}`)}
              empty=""
              columns={[
                { key: 'name', header: t('Room'), cell: (r) => r.name },
                { key: 'mode', header: t('Mode'), cell: (r) => <Badge tone={r.mode === 'ranked' ? 'accent' : 'neutral'}>{r.mode === 'ranked' ? t('Ranked') : t('Casual')}</Badge> },
                { key: 'map', header: t('Map'), cell: (r) => r.map ?? '—' },
                { key: 'players', header: t('Players'), cell: (r) => `${r.players}/${r.maxPlayers}`, align: 'end' },
              ]}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

/** Líder do mês em cada stat principal do leaderboard (OG-353, RN-LDB) e o meu rating (OG-351). */
export function MonthRanking() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const board = usePolled<StatOverview>('/leaderboard/stats', POLL_MS, 'matches');
  const me = usePolled<{ skill: { value: number; calibrating: boolean } | null }>(user ? `/players/${encodeURIComponent(user.username)}` : null, POLL_MS, 'matches');
  // melhor do mês (índice geral, OG-358) e o líder de cada stat principal
  const leaders = [{ stat: OVERALL, top: board?.overall[0] }, ...(board?.stats ?? []).filter((s) => s.main).map((s) => ({ stat: s.stat, top: s.entries[0] }))];
  return (
    <Panel title={board?.season ? t('Leaderboard: $1', board.season.name) : t('Leaderboard')} actions={<Link to="/ranking">{t('Full leaderboard')}</Link>}>
      {board === undefined ? (
        <p className="ui-muted">{t('Loading...')}</p>
      ) : board === null ? (
        <p className="ui-muted">{t('No active season right now.')}</p>
      ) : (
        <div className="ui-stack">
          {leaders.every((l) => !l.top) ? (
            <p className="ui-muted">{t('Nobody in the leaderboard yet. Be the first: play Ranked.')}</p>
          ) : (
            <Table
              caption={t('Leaders of the month')}
              rows={leaders}
              rowKey={(l) => l.stat}
              onRowActivate={(l) => l.top && void navigate(`/players/${encodeURIComponent(l.top.username)}`)}
              empty=""
              columns={[
                { key: 'stat', header: t('Stat'), cell: (l) => (l.stat === OVERALL ? t('Best of the month') : t(STAT_LABELS[l.stat] ?? l.stat)) },
                { key: 'name', header: t('Player'), cell: (l) => (l.top ? chatName(l.top.username, l.top.clanLabel) : '—') },
                { key: 'value', header: '', cell: (l) => (l.top ? statValue(l.stat, l.top.value, prefs.locale) : ''), align: 'end' },
              ]}
            />
          )}
          {user &&
            (me?.skill ? (
              <p className="home-rank">
                {me.skill.calibrating ? t('Your rating: $1 (calibrating)', String(me.skill.value)) : t('Your rating: $1', String(me.skill.value))} <RatingInfo />
              </p>
            ) : me !== undefined ? (
              <div className="home-rank">
                <span className="ui-muted">{t('Play Ranked to get your rating.')}</span>
                <Button onClick={() => void navigate('/rooms', { state: { mode: 'ranked' } })}>{t('Ranked rooms')}</Button>
              </div>
            ) : null)}
        </div>
      )}
    </Panel>
  );
}
