// SPDX-License-Identifier: GPL-2.0-or-later
// Tela inicial viva (OG-208): "Agora no Outgun" (jogadores online e salas com gente) e o ranking da
// temporada do mês (top 5 e a minha posição). Só leitura de endpoints que já existem; atualiza a
// cada 30 s enquanto a aba está visível.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../app/account.js';
import { api } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import type { RoomSummary } from './lobby.js';

/** "Agora no Outgun" acompanha o lobby (heartbeat de 3 s); o resto do portal relê a cada minuto (OG-283). */
export const LIVE_POLL_MS = 4000;
export const POLL_MS = 60_000;

/** GET periódico que pausa com a aba escondida; `undefined` = carregando, `null` = erro/ausente. */
export function usePolled<T>(path: string | null, everyMs = POLL_MS): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
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
    const id = setInterval(load, everyMs);
    addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      clearInterval(id);
      removeEventListener('visibilitychange', load);
    };
  }, [path, everyMs]);
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
  const data = usePolled<{ rooms: RoomSummary[] }>('/rooms', LIVE_POLL_MS);
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

interface Leaderboard {
  season: { name: string };
  total: number;
  entries: { position: number; username: string; clanTag: string | null; rating: number }[];
}

export function MonthRanking() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const board = usePolled<Leaderboard>('/leaderboard?limit=5');
  const mine = usePolled<{ rank: number; of: number }>(user ? '/account/ranking' : null);
  const rating = (r: number) => r.toLocaleString(prefs.locale, { maximumFractionDigits: 2 });
  return (
    <Panel title={board?.season ? t('Ranking: $1', board.season.name) : t('Ranking')} actions={<Link to="/ranking">{t('Full ranking')}</Link>}>
      {board === undefined ? (
        <p className="ui-muted">{t('Loading...')}</p>
      ) : board === null ? (
        <p className="ui-muted">{t('No active season right now.')}</p>
      ) : (
        <div className="ui-stack">
          {board.entries.length === 0 ? (
            <p className="ui-muted">{t('Nobody in the ranking yet. Be the first: play Ranked.')}</p>
          ) : (
          <Table
            caption={t('Top 5 of the season')}
            rows={board.entries}
            rowKey={(e) => e.username}
            onRowActivate={(e) => void navigate(`/players/${encodeURIComponent(e.username)}`)}
            empty=""
            columns={[
              { key: 'pos', header: '#', cell: (e) => `${e.position}º`, align: 'end' },
              { key: 'name', header: t('Player'), cell: (e) => (e.clanTag ? `(${e.clanTag}) ${e.username}` : e.username) },
              { key: 'rating', header: t('Rating'), cell: (e) => rating(e.rating), align: 'end' },
            ]}
          />
          )}
          {user &&
            (mine && mine.rank > 0 ? (
              <p className="home-rank">{t('You: $1º of $2', String(mine.rank), String(mine.of))}</p>
            ) : mine !== undefined ? (
              <div className="home-rank">
                <span className="ui-muted">{t('Play Ranked to enter the ranking.')}</span>
                <Button onClick={() => void navigate('/rooms', { state: { mode: 'ranked' } })}>{t('Ranked rooms')}</Button>
              </div>
            ) : null)}
        </div>
      )}
    </Panel>
  );
}
