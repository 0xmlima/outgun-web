// SPDX-License-Identifier: GPL-2.0-or-later
// Diretório de jogadores (OG-215, RN-SOC-04) em /players: busca por nome ou clã (sem diferença de
// maiúsculas e acentos, feita pela API), mais ativos da semana e clãs. Ranking da temporada em
// /ranking no visual v2 (substitui a tela do OG-085).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { TextField } from '../ui/Field.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { duration, PlayerLink, Status, useApi, type Leaderboard } from './stats.js';

interface Directory {
  active: { username: string; clanTag: string | null; matches: number; wins: number; playSeconds: number }[];
  clans: { tag: string; members: number; activeMembers: number; matches: number }[];
}
interface Found {
  total: number;
  players: { username: string; clanTag: string | null }[];
}

const withClan = (username: string, clanTag: string | null) => (clanTag ? `(${clanTag}) ${username}` : username);

/** Valor que só muda depois de `ms` sem alterações (busca enquanto digita). */
function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function PlayersScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const term = useDebounced(query.trim(), 250);
  const dir = useApi<Directory>('/directory');
  const open = (username: string) => void navigate(`/players/${encodeURIComponent(username)}`);
  return (
    <Page title={t('Players')} onBack={() => void navigate(-1)}>
      <Panel>
        <TextField label={t('Search by name or clan')} value={query} onChange={setQuery} maxLength={32} autoFocus />
        {term && <SearchResults term={term} onOpen={open} />}
      </Panel>
      <div className="report-grid">
        <Panel title={t('Most active this week')}>
          {dir.data ? (
            <Table
              caption={t('Most active this week')}
              rows={dir.data.active}
              rowKey={(r) => r.username}
              onRowActivate={(r) => open(r.username)}
              empty={t('Nobody yet.')}
              columns={[
                { key: 'name', header: t('Player'), cell: (r) => <PlayerLink name={withClan(r.username, r.clanTag)} username={r.username} /> },
                { key: 'matches', header: t('Matches'), cell: (r) => r.matches, align: 'end' },
                { key: 'wins', header: t('Wins'), cell: (r) => r.wins, align: 'end' },
                { key: 'time', header: t('Playing time'), cell: (r) => duration(r.playSeconds), align: 'end' },
              ]}
            />
          ) : (
            <Status loading={dir.data === undefined} missing={false} error={dir.error} />
          )}
        </Panel>
        <Panel title={t('Clans')}>
          {dir.data && (
            <Table
              caption={t('Clans')}
              rows={dir.data.clans}
              rowKey={(r) => r.tag}
              onRowActivate={(r) => setQuery(r.tag)}
              empty={t('Nobody yet.')}
              columns={[
                { key: 'tag', header: t('Clan'), cell: (r) => r.tag },
                { key: 'members', header: t('Members'), cell: (r) => r.members, align: 'end' },
                { key: 'active', header: t('Active this week'), cell: (r) => r.activeMembers, align: 'end' },
                { key: 'matches', header: t('Matches'), cell: (r) => r.matches, align: 'end' },
              ]}
            />
          )}
        </Panel>
      </div>
      <p className="ui-muted">
        <Button variant="ghost" onClick={() => void navigate('/ranking')}>
          {t('Ranking')}
        </Button>
      </p>
    </Page>
  );
}

function SearchResults({ term, onOpen }: { term: string; onOpen: (username: string) => void }) {
  const { t } = usePrefs();
  const [limit, setLimit] = useState(20);
  useEffect(() => setLimit(20), [term]);
  const found = useApi<Found>(`/players?${new URLSearchParams({ busca: term, limit: String(limit) })}`);
  const f = found.data;
  if (!f) return <Status loading={f === undefined} missing={false} error={found.error} />;
  return (
    <>
      <p className="ui-muted" role="status">
        {t('$1 players found', String(f.total))}
      </p>
      <Table
        caption={t('Search by name or clan')}
        rows={f.players}
        rowKey={(r) => r.username}
        onRowActivate={(r) => onOpen(r.username)}
        empty={t('Nobody found.')}
        columns={[{ key: 'name', header: t('Player'), cell: (r) => <PlayerLink name={withClan(r.username, r.clanTag)} username={r.username} /> }]}
      />
      {f.total > f.players.length && limit < 50 && (
        <div className="ui-row">
          <Button variant="ghost" onClick={() => setLimit(50)}>
            {t('More')}
          </Button>
        </div>
      )}
    </>
  );
}

export function LeaderboardScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(50);
  const board = useApi<Leaderboard>(`/leaderboard?limit=${limit}`);
  const b = board.data;
  return (
    <Page
      title={b ? `${t('Ranking')} · ${b.season.name}` : t('Ranking')}
      subtitle={t('Rating = (score + 1) / (neg + 1); at least 100 points of score to appear. Only Ranked matches count.')}
      onBack={() => void navigate(-1)}
    >
      <Status loading={b === undefined} missing={b === null} error={board.error} />
      {b && (
        <Panel title={t('Ranked players: $1', String(b.total))}>
          <Table
            caption={t('Ranking')}
            rows={b.entries}
            rowKey={(e) => e.username}
            onRowActivate={(e) => void navigate(`/players/${encodeURIComponent(e.username)}`)}
            empty={t('Nobody yet.')}
            columns={[
              { key: 'pos', header: '#', cell: (e) => e.position, align: 'end' },
              { key: 'name', header: t('Player'), cell: (e) => <PlayerLink name={withClan(e.username, e.clanTag)} username={e.username} /> },
              { key: 'rating', header: t('rating'), cell: (e) => e.rating.toFixed(2), align: 'end' },
              { key: 'score', header: t('score'), cell: (e) => Math.trunc(e.score), align: 'end' },
              { key: 'neg', header: t('neg'), cell: (e) => e.neg, align: 'end' },
              { key: 'matches', header: t('Matches'), cell: (e) => e.matches, align: 'end' },
            ]}
          />
          {b.total > b.entries.length && limit < 100 && (
            <div className="ui-row">
              <Button variant="ghost" onClick={() => setLimit(100)}>
                {t('More')}
              </Button>
            </div>
          )}
        </Panel>
      )}
      <p className="ui-muted">
        <Button variant="ghost" onClick={() => void navigate('/players')}>
          {t('Players')}
        </Button>
      </p>
    </Page>
  );
}
