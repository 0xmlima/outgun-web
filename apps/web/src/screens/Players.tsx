// SPDX-License-Identifier: GPL-2.0-or-later
// Diretório de jogadores (OG-215, RN-SOC-04) em /players: busca por nome ou clã (sem diferença de
// maiúsculas e acentos, feita pela API), mais ativos da semana e clãs. Ranking da temporada em
// /ranking no visual v2 (substitui a tela do OG-085), com temporadas anteriores e o geral (OG-267),
// filtrado por formato (OG-258).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { ChoiceField, TextField } from '../ui/Field.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { Tabs } from '../ui/Tabs.js';
import { duration, FormatTabs, formatQuery, PlayerLink, Status, useApi, useFormatParam, type Leaderboard } from './stats.js';

interface Directory {
  active: { username: string; clanTag: string | null; matches: number; wins: number; playSeconds: number }[];
  clans: { tag: string; members: number; activeMembers: number; matches: number }[];
}
/** Ranking geral (OG-267): soma de todas as temporadas. */
interface Overall {
  seasons: number;
  total: number;
  entries: Leaderboard['entries'];
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
        <Panel title={t('Clans')} actions={<Link to="/clans">{t('All clans')}</Link>}>
          {dir.data && (
            <Table
              caption={t('Clans')}
              rows={dir.data.clans}
              rowKey={(r) => r.tag}
              onRowActivate={(r) => void navigate(`/clans/${encodeURIComponent(r.tag)}`)}
              empty={t('Nobody yet.')}
              columns={[
                { key: 'tag', header: t('Clan'), cell: (r) => <Link to={`/clans/${encodeURIComponent(r.tag)}`}>{r.tag}</Link> },
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

type BoardView = 'current' | 'past' | 'overall';
interface SeasonRow {
  id: number;
  name: string;
  active: boolean;
}

/** Ranking (OG-084) com a temporada atual, as anteriores (classificação final) e o geral (OG-267). */
export function LeaderboardScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(50);
  const [view, setView] = useState<BoardView>('current');
  const seasons = useApi<{ seasons: SeasonRow[] }>('/seasons');
  const past = (seasons.data?.seasons ?? []).filter((s) => !s.active);
  const [pastId, setPastId] = useState<string>('');
  const chosen = pastId || String(past[0]?.id ?? '');
  const [format, setFormat] = useFormatParam();
  const q = `limit=${limit}${formatQuery(format)}`;
  const path = view === 'overall' ? `/leaderboard/overall?${q}` : view === 'past' ? (chosen ? `/leaderboard?season=${chosen}&${q}` : '') : `/leaderboard?${q}`;
  const board = useApi<Leaderboard | Overall>(path || '/leaderboard?limit=1');
  const b = path ? board.data : null;
  const name = b && 'season' in b ? `${t('Ranking')} · ${b.season.name}` : view === 'overall' ? `${t('Ranking')} · ${t('All seasons')}` : t('Ranking');
  const title = format === 'all' ? name : `${name} · ${format}`;
  return (
    <Page title={title} subtitle={t('Rating = (score + 1) / (neg + 1); at least 100 points of score to appear. Only Ranked matches count.')} onBack={() => void navigate(-1)}>
      <Tabs
        label={t('Ranking')}
        value={view}
        onChange={(v) => {
          setView(v);
          setLimit(50);
        }}
        tabs={[
          { id: 'current', label: t('Current season') },
          { id: 'past', label: t('Past seasons') },
          { id: 'overall', label: t('All seasons') },
        ]}
      >
        <FormatTabs
          value={format}
          onChange={(f) => {
            setFormat(f);
            setLimit(50);
          }}
        />
        {view === 'past' && past.length > 0 && (
          <ChoiceField label={t('Season')} value={chosen} onChange={setPastId} options={past.map((s) => ({ value: String(s.id), label: s.name }))} />
        )}
        {view === 'past' && seasons.data && past.length === 0 && <p className="ui-muted">{t('No finished season yet.')}</p>}
        {path && <Status loading={b === undefined} missing={b === null} error={board.error} />}
        {b && (
          <Panel title={b && 'seasons' in b ? t('Ranked players in $1 seasons: $2', String(b.seasons), String(b.total)) : t('Ranked players: $1', String(b.total))}>
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
      </Tabs>
      <p className="ui-muted">
        <Button variant="ghost" onClick={() => void navigate('/players')}>
          {t('Players')}
        </Button>
      </p>
    </Page>
  );
}
