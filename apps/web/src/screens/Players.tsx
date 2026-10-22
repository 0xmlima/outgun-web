// SPDX-License-Identifier: GPL-2.0-or-later
// Diretório de jogadores (OG-215, RN-SOC-04) em /players: busca por nome ou clã (sem diferença de
// maiúsculas e acentos, feita pela API), mais ativos da semana e clãs. Em /ranking, o leaderboard de
// atributos (OG-353), que substituiu o ranking por score/neg (D-66), e o ranking de clãs (OG-274).
import { chatName } from '@outgun/protocol';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { ChoiceField, TextField } from '../ui/Field.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { Tabs } from '../ui/Tabs.js';
import { useAccount } from '../app/account.js';
import { OVERALL, OverallDetailView, StatDetailView, StatOverviewView, STAT_LABELS, statScope } from './leaderboard.js';
import { duration, FormatTabs, PlayerLink, Status, useApi, useFormatParam } from './stats.js';

interface Directory {
  active: { username: string; clanTag: string | null; clanLabel: string | null; matches: number; wins: number; playSeconds: number }[];
  clans: { tag: string; members: number; activeMembers: number; matches: number }[];
}
interface Found {
  total: number;
  players: { username: string; clanTag: string | null; clanLabel: string | null }[];
}

/** Nome com a tag decorada pelo estilo do clã (OG-338). */
const withClan = (username: string, clanLabel: string | null) => chatName(username, clanLabel);

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
                { key: 'name', header: t('Player'), cell: (r) => <PlayerLink name={withClan(r.username, r.clanLabel)} username={r.username} /> },
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
        columns={[{ key: 'name', header: t('Player'), cell: (r) => <PlayerLink name={withClan(r.username, r.clanLabel)} username={r.username} /> }]}
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

interface SeasonRow {
  id: number;
  name: string;
  active: boolean;
}

/**
 * Leaderboard de atributos (OG-353, D-66, RN-LDB) no lugar do ranking por score/neg: temporada do mês
 * (a atual ou uma anterior) ou "sempre", filtro de formato, visão geral ou um stat; e os clãs.
 */
export function LeaderboardScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { user } = useAccount();
  const [view, setView] = useState<'players' | 'clans'>('players');
  const seasons = useApi<{ seasons: SeasonRow[] }>('/seasons');
  const [period, setPeriod] = useState('current');
  const [format, setFormat] = useFormatParam();
  const [stat, setStat] = useState('');
  const scope = statScope(period, format);
  const past = (seasons.data?.seasons ?? []).filter((x) => !x.active);
  const subtitle =
    view === 'clans'
      ? t('Clan vs clan matches: win 3 points, draw 1; ties broken by capture difference; at least 3 matches to appear.')
      : t('One ranking for each stat, restarting every month. Only Ranked matches count; at least 5 matches in the period to appear.');
  return (
    <Page title={t('Leaderboard')} subtitle={subtitle} onBack={() => void navigate(-1)}>
      <Tabs
        label={t('Leaderboard')}
        value={view}
        onChange={setView}
        tabs={[
          { id: 'players', label: t('Players') },
          { id: 'clans', label: t('Clans') },
        ]}
      >
        {view === 'clans' ? (
          <ClanBoard />
        ) : (
          <>
            <div className="ui-row leaderboard-filters">
              <ChoiceField
                label={t('Period')}
                value={period}
                onChange={setPeriod}
                options={[
                  { value: 'current', label: t('This month') },
                  ...past.map((x) => ({ value: String(x.id), label: x.name })),
                  { value: 'all', label: t('All time') },
                ]}
              />
              <ChoiceField
                label={t('Stat')}
                value={stat}
                onChange={setStat}
                options={[{ value: '', label: t('Overview') }, { value: OVERALL, label: t('Overall of the month') }, ...Object.entries(STAT_LABELS).map(([id, label]) => ({ value: id, label: t(label) }))]}
              />
            </div>
            <FormatTabs value={format} onChange={setFormat} />
            {stat === OVERALL ? <OverallDetailView scope={scope} me={user?.username} /> : stat ? <StatDetailView stat={stat} scope={scope} me={user?.username} /> : <StatOverviewView scope={scope} onPick={setStat} />}
            <p className="ui-muted">{t('Per 10 minutes: totals divided by the time played, so whoever plays less can compete. Raw damage is hits on enemies × 70 and includes overkill.')}</p>
            <p className="ui-muted">{t('Effective damage leaves out overkill. Base = the room where a team flag starts; defenses = kills next to an ally carrier or your own flag. Multi-kill = 2 or more kills up to 4 s apart; trade = killing, within 3 s, the enemy who just killed an ally; first kill = the first of the match and after each capture. These stats count from the date shown.')}</p>
          </>
        )}
      </Tabs>
      <p className="ui-muted">
        <Button variant="ghost" onClick={() => void navigate('/players')}>
          {t('Players')}
        </Button>
        <Button variant="ghost" onClick={() => void navigate('/hall-da-fama')}>
          {t('Hall of fame')}
        </Button>
      </p>
    </Page>
  );
}

interface ClanStanding {
  position: number;
  tag: string;
  name: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  captureDiff: number;
}

/** Ranking de clãs (OG-274, D-47): temporada atual ou geral, por pontos em clã x clã. */
function ClanBoard() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'season' | 'overall'>('season');
  const board = useApi<{ season: { name: string } | null; total: number; entries: ClanStanding[] }>(`/leaderboard/clans?limit=100${scope === 'overall' ? '&overall=true' : ''}`, true);
  const b = board.data;
  return (
    <>
      <ChoiceField
        label={t('Period')}
        value={scope}
        onChange={setScope}
        options={[
          { value: 'season', label: t('Current season') },
          { value: 'overall', label: t('All seasons') },
        ]}
      />
      <Status loading={b === undefined} missing={b === null} error={board.error} />
      {b && (
        <Panel title={b.season ? `${t('Clans')} · ${b.season.name}` : `${t('Clans')} · ${t('All seasons')}`}>
          <Table
            caption={t('Clans')}
            rows={b.entries}
            rowKey={(e) => e.tag}
            onRowActivate={(e) => void navigate(`/clans/${encodeURIComponent(e.tag)}`)}
            empty={t('Nobody yet.')}
            columns={[
              { key: 'pos', header: '#', cell: (e) => e.position, align: 'end' },
              { key: 'clan', header: t('Clan'), cell: (e) => <Link to={`/clans/${encodeURIComponent(e.tag)}`}>{`(${e.tag}) ${e.name}`}</Link> },
              { key: 'points', header: t('Points'), cell: (e) => e.points, align: 'end' },
              { key: 'matches', header: t('Matches'), cell: (e) => e.matches, align: 'end' },
              { key: 'record', header: `${t('Wins')}/${t('Draws')}/${t('Losses')}`, cell: (e) => `${e.wins}/${e.draws}/${e.losses}`, align: 'end' },
              { key: 'diff', header: t('Capture difference'), cell: (e) => (e.captureDiff > 0 ? `+${e.captureDiff}` : e.captureDiff), align: 'end' },
            ]}
          />
        </Panel>
      )}
    </>
  );
}
