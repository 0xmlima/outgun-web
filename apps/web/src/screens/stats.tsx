// SPDX-License-Identifier: GPL-2.0-or-later
// Perfil público, histórico, partida e ranking (OG-085). A partida mostra o mesmo que o HTML de
// estatísticas do original (`WorldBase::save_stats`): regras, times, jogadores e capturas.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { TextPage } from '../ui/TextPage.js';

type Mode = 'ranked' | 'casual';

interface Totals {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  frags: number;
  kills: number;
  deaths: number;
  captures: number;
  assists: number;
  flagsReturned: number;
  carriersKilled: number;
  shots: number;
  hits: number;
  playSeconds: number;
}

interface Profile {
  user: { id: string; username: string; clanTag: string | null; createdAt: string };
  ranking: { season: string; score: number; neg: number; rating: number; rank: number; of: number; matches: number; minimumScore: number } | null;
  totals: Record<Mode, Totals>;
}

interface MatchSummary {
  id: string;
  endedAt: string;
  mode: Mode;
  ranked: boolean;
  map: string;
  redScore: number;
  blueScore: number;
}

interface HistoryEntry extends MatchSummary {
  player: { team: number; frags: number; kills: number; deaths: number; captures: number; scoreDelta: number; negDelta: number };
}

interface PlayerLine {
  slot: number;
  name: string;
  username: string | null;
  team: number;
  isBot: boolean;
  frags: number;
  kills: number;
  deaths: number;
  captures: number;
  playSeconds: number;
  scoreDelta: number;
  negDelta: number;
  stats: Record<string, number>;
}

interface MatchDetails {
  mapTitle?: string;
  mapTime?: number;
  rules?: { captureLimit: number; winScoreDifference: number; timeLimit: number; extraTime: number; extraTimePeriods: number; suddenDeath: boolean };
  teams?: Record<string, number>[];
  captures?: { time: number; team: 0 | 1; capturer: string; assistant: string | null }[];
  baseScore?: [number, number];
}

interface MatchPage {
  match: MatchSummary & { startedAt: string; roomId: string | null };
  details: MatchDetails;
  players: PlayerLine[];
  replayUrl: string | null;
}

interface Leaderboard {
  season: { id: number; name: string; active: boolean };
  total: number;
  entries: { position: number; username: string; clanTag: string | null; score: number; neg: number; rating: number; matches: number }[];
}

/** Carrega `path` da API; `null` = não encontrado. */
function useApi<T>(path: string): { data: T | null | undefined; error: string | null } {
  const [state, setState] = useState<{ data: T | null | undefined; error: string | null }>({ data: undefined, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: undefined, error: null });
    api<T>(path).then(
      (data) => alive && setState({ data, error: null }),
      (e: unknown) => alive && setState(e instanceof ApiError && e.status === 404 ? { data: null, error: null } : { data: undefined, error: e instanceof ApiError ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

/** `m:ss`, como o tempo de bandeira e das capturas do original. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Duração longa: `1 h 05 min` ou `12 min`. */
export function duration(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min >= 60 ? `${Math.trunc(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
}

export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '-');

const date = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

function Status({ loading, missing, error }: { loading: boolean; missing: boolean; error: string | null }) {
  const { t } = usePrefs();
  if (error) return <p className="stats-note error">{t('Could not reach the server.')}</p>;
  if (missing) return <p className="stats-note">{t('Not found.')}</p>;
  if (loading) return <p className="stats-note">{t('Loading...')}</p>;
  return null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stats-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PlayerLink({ name, username }: { name: string; username: string | null }) {
  return username ? <Link to={`/players/${encodeURIComponent(username)}`}>{name}</Link> : <>{name}</>;
}

export function ProfileScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { name = '' } = useParams();
  const [mode, setMode] = useState<Mode | ''>('');
  const [limit, setLimit] = useState(20);
  const profile = useApi<Profile>(`/players/${encodeURIComponent(name)}`);
  const history = useApi<{ total: number; matches: HistoryEntry[] }>(`/players/${encodeURIComponent(name)}/matches?limit=${limit}${mode ? `&mode=${mode}` : ''}`);
  const p = profile.data;
  const caption = p ? (p.user.clanTag ? `(${p.user.clanTag}) ${p.user.username}` : p.user.username) : name;
  const rows: [string, (x: Totals) => ReactNode][] = [
    [t('Matches'), (x) => x.matches],
    [t('Wins'), (x) => x.wins],
    [t('Losses'), (x) => x.losses],
    [t('Draws'), (x) => x.draws],
    [t('Frags'), (x) => x.frags],
    [t('Kills'), (x) => x.kills],
    [t('Deaths'), (x) => x.deaths],
    [t('Captures'), (x) => x.captures],
    [t('Assists'), (x) => x.assists],
    [t('Flags returned'), (x) => x.flagsReturned],
    [t('Carriers killed'), (x) => x.carriersKilled],
    [t('Hit accuracy'), (x) => percent(x.hits, x.shots)],
    [t('Playing time'), (x) => duration(x.playSeconds)],
  ];
  return (
    <TextPage caption={caption} onBack={() => void navigate(-1)}>
      <Status loading={p === undefined} missing={p === null} error={profile.error} />
      {p && (
        <>
          <Section title={t('Ranking')}>
            {p.ranking ? (
              <p className="stats-line">
                {p.ranking.season}:{' '}
                {p.ranking.rank > 0
                  ? t('position $1 of $2', String(p.ranking.rank), String(p.ranking.of))
                  : t('not ranked yet ($1 points needed)', String(p.ranking.minimumScore))}
                {' · '}
                {t('score')} {Math.trunc(p.ranking.score)} · {t('neg')} {p.ranking.neg} · {t('rating')} {p.ranking.rating.toFixed(2)} · <Link to="/ranking">{t('Ranking')}</Link>
              </p>
            ) : (
              <p className="stats-line">-</p>
            )}
          </Section>
          <Section title={t('Statistics')}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('Ranked')}</th>
                  <th>{t('Casual')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{value(p.totals.ranked)}</td>
                    <td>{value(p.totals.casual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title={t('Matches')}>
            <p className="stats-tabs">
              {(['', 'ranked', 'casual'] as const).map((m) => (
                <button key={m} type="button" className={m === mode ? 'active' : ''} onClick={() => setMode(m)}>
                  {m === '' ? t('All') : m === 'ranked' ? t('Ranked') : t('Casual')}
                </button>
              ))}
            </p>
            {history.data && history.data.matches.length === 0 && <p className="stats-note">{t('No matches yet.')}</p>}
            {history.data && history.data.matches.length > 0 && (
              <table className="stats-table wide">
                <thead>
                  <tr>
                    <th>{t('Date')}</th>
                    <th>{t('Mode')}</th>
                    <th>{t('Map')}</th>
                    <th>{t('Score')}</th>
                    <th>{t('Result')}</th>
                    <th>{t('Frags')}</th>
                    <th>{t('Kills')}</th>
                    <th>{t('Deaths')}</th>
                    <th>{t('Captures')}</th>
                    <th>{t('Ranking')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.matches.map((m) => {
                    const mine = m.player.team === 0 ? m.redScore : m.blueScore;
                    const theirs = m.player.team === 0 ? m.blueScore : m.redScore;
                    return (
                      <tr key={m.id} className={m.player.team === 0 ? 'team-red' : 'team-blue'}>
                        <td>
                          <Link to={`/matches/${m.id}`}>{date(m.endedAt, prefs.locale)}</Link>
                        </td>
                        <td>{m.mode === 'ranked' ? t('Ranked') : t('Casual')}</td>
                        <td>{m.map}</td>
                        <td>
                          {m.redScore}–{m.blueScore}
                        </td>
                        <td>{mine > theirs ? t('Win') : mine < theirs ? t('Loss') : t('Draw')}</td>
                        <td>{m.player.frags}</td>
                        <td>{m.player.kills}</td>
                        <td>{m.player.deaths}</td>
                        <td>{m.player.captures}</td>
                        <td>{m.ranked ? `${m.player.scoreDelta >= 0 ? '+' : ''}${m.player.scoreDelta} / +${m.player.negDelta}` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {history.data && history.data.total > history.data.matches.length && (
              <p className="stats-tabs">
                <button type="button" onClick={() => setLimit((l) => Math.min(100, l + 20))} disabled={limit >= 100}>
                  {t('More')}
                </button>
              </p>
            )}
          </Section>
        </>
      )}
    </TextPage>
  );
}

/** Colunas da tabela de jogadores do `save_stats`. */
const PLAYER_COLUMNS: [string, (p: PlayerLine) => ReactNode][] = [
  ['Frags', (p) => p.frags],
  ['Captures', (p) => p.captures],
  ['Assists', (p) => p.stats.assists ?? 0],
  ['Kills', (p) => p.kills],
  ['Deaths', (p) => p.deaths],
  ['Suicides', (p) => p.stats.suicides ?? 0],
  ['Flags taken', (p) => p.stats.flagsTaken ?? 0],
  ['Flags dropped', (p) => p.stats.flagsDropped ?? 0],
  ['Flags returned', (p) => p.stats.flagsReturned ?? 0],
  ['Carriers killed', (p) => p.stats.carriersKilled ?? 0],
  ['Carry time', (p) => clock(p.stats.flagCarryingTime ?? 0)],
  ['Cons. kills', (p) => p.stats.consecutiveKills ?? 0],
  ['Cons. deaths', (p) => p.stats.consecutiveDeaths ?? 0],
  ['Shots', (p) => p.stats.shots ?? 0],
  ['Accuracy', (p) => `${Math.round(100 * (p.stats.accuracy ?? 0))}%`],
  ['Shots taken', (p) => p.stats.shotsTaken ?? 0],
  ['Movement', (p) => `${Math.round(p.stats.movement ?? 0)} u`],
];

const TEAM_ROWS: [string, (t: Record<string, number>) => ReactNode][] = [
  ['Captures', (x) => x.score ?? 0],
  ['Kills', (x) => x.kills ?? 0],
  ['Deaths', (x) => x.deaths ?? 0],
  ['Suicides', (x) => x.suicides ?? 0],
  ['Flags taken', (x) => x.flagsTaken ?? 0],
  ['Flags dropped', (x) => x.flagsDropped ?? 0],
  ['Flags returned', (x) => x.flagsReturned ?? 0],
  ['Shots', (x) => x.shots ?? 0],
  ['Hit accuracy', (x) => `${Math.round(100 * (x.accuracy ?? 0))}%`],
  ['Shots taken', (x) => x.shotsTaken ?? 0],
  ['Total movement', (x) => `${Math.trunc(x.movement ?? 0)} u`],
];

export function MatchScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const page = useApi<MatchPage>(`/matches/${encodeURIComponent(id)}`);
  const m = page.data;
  const d = m?.details ?? {};
  const rules = d.rules;
  const minutes = (frames: number) => `${Math.trunc(frames / 600)} min`;
  let red = d.baseScore?.[0] ?? 0;
  let blue = d.baseScore?.[1] ?? 0;
  return (
    <TextPage caption={m ? `${d.mapTitle ?? m.match.map} ${m.match.redScore}-${m.match.blueScore}` : t('Match')} onBack={() => void navigate(-1)}>
      <Status loading={m === undefined} missing={m === null} error={page.error} />
      {m && (
        <>
          <Section title={t('Game info')}>
            <table className="stats-table">
              <tbody>
                <tr>
                  <th>{t('Date')}</th>
                  <td>{date(m.match.endedAt, prefs.locale)}</td>
                </tr>
                <tr>
                  <th>{t('Mode')}</th>
                  <td>
                    {m.match.mode === 'ranked' ? t('Ranked') : t('Casual')}
                    {m.match.mode === 'ranked' && !m.match.ranked ? ` (${t('did not count for the ranking')})` : ''}
                  </td>
                </tr>
                <tr>
                  <th>{t('Map')}</th>
                  <td>
                    {d.mapTitle ?? m.match.map} ({clock(d.mapTime ?? 0)})
                  </td>
                </tr>
                {rules && (
                  <>
                    <tr>
                      <th>{t('Capture limit')}</th>
                      <td>{rules.captureLimit === 0 ? t('none') : `${rules.captureLimit}${rules.winScoreDifference > 1 ? ` (${t('difference of $1', String(rules.winScoreDifference))})` : ''}`}</td>
                    </tr>
                    <tr>
                      <th>{t('Time limit')}</th>
                      <td>{rules.timeLimit === 0 ? t('none') : minutes(rules.timeLimit)}</td>
                    </tr>
                    {rules.timeLimit !== 0 && (
                      <tr>
                        <th>{t('Extra time')}</th>
                        <td>
                          {rules.extraTime === 0 ? t('none') : `${rules.extraTimePeriods > 1 ? `${rules.extraTimePeriods}×` : ''}${minutes(rules.extraTime)}`}
                          {rules.extraTime !== 0 && rules.suddenDeath ? ` (${t('sudden death')})` : ''}
                        </td>
                      </tr>
                    )}
                  </>
                )}
                {m.replayUrl && (
                  <tr>
                    <th>{t('Replay')}</th>
                    <td>
                      <a href={m.replayUrl}>{t('Watch')}</a>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>
          {d.teams && (
            <Section title={t('Team stats')}>
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>{t('Team')}</th>
                    <th className="team-red">{t('Red')}</th>
                    <th className="team-blue">{t('Blue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {TEAM_ROWS.map(([label, value]) => (
                    <tr key={label}>
                      <th>{t(label)}</th>
                      <td>{value(d.teams![0] ?? {})}</td>
                      <td>{value(d.teams![1] ?? {})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          <Section title={t('Player stats')}>
            <table className="stats-table wide">
              <thead>
                <tr>
                  <th>{t('Player')}</th>
                  {PLAYER_COLUMNS.map(([label]) => (
                    <th key={label}>{t(label)}</th>
                  ))}
                  {m.match.ranked && <th>{t('Ranking')}</th>}
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((team) => [
                  <tr key={`h${team}`} className={team === 0 ? 'team-red' : 'team-blue'}>
                    <th colSpan={PLAYER_COLUMNS.length + (m.match.ranked ? 2 : 1)}>{team === 0 ? t('Red team') : t('Blue team')}</th>
                  </tr>,
                  ...m.players
                    .filter((p) => p.team === team)
                    .map((p) => (
                      <tr key={p.slot}>
                        <td className="name">
                          <PlayerLink name={p.name} username={p.username} />
                        </td>
                        {PLAYER_COLUMNS.map(([label, value]) => (
                          <td key={label}>{value(p)}</td>
                        ))}
                        {m.match.ranked && <td>{p.username ? `${p.scoreDelta >= 0 ? '+' : ''}${p.scoreDelta} / +${p.negDelta}` : '-'}</td>}
                      </tr>
                    )),
                ])}
              </tbody>
            </table>
          </Section>
          {d.captures && d.captures.length > 0 && (
            <Section title={t('Captures')}>
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>{t('Time')}</th>
                    <th>{t('Team')}</th>
                    <th>{t('Score')}</th>
                    <th>{t('Capturer')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.captures.map((c, i) => {
                    if (c.team === 0) red++;
                    else blue++;
                    return (
                      <tr key={i} className={c.team === 0 ? 'team-red' : 'team-blue'}>
                        <td>{clock(c.time)}</td>
                        <td>{c.team === 0 ? t('Red') : t('Blue')}</td>
                        <td>
                          {red}–{blue}
                        </td>
                        <td>
                          {c.capturer}
                          {c.assistant ? ` + ${c.assistant}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </TextPage>
  );
}

export function LeaderboardScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(50);
  const board = useApi<Leaderboard>(`/leaderboard?limit=${limit}`);
  const b = board.data;
  return (
    <TextPage caption={b ? `${t('Ranking')} - ${b.season.name}` : t('Ranking')} onBack={() => void navigate(-1)}>
      <Status loading={b === undefined} missing={b === null} error={board.error} />
      {b && (
        <Section title={t('Ranked players: $1', String(b.total))}>
          <p className="stats-line">{t('Rating = (score + 1) / (neg + 1); at least 100 points of score to appear. Only Ranked matches count.')}</p>
          {b.entries.length > 0 && (
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Player')}</th>
                  <th>{t('rating')}</th>
                  <th>{t('score')}</th>
                  <th>{t('neg')}</th>
                  <th>{t('Matches')}</th>
                </tr>
              </thead>
              <tbody>
                {b.entries.map((e) => (
                  <tr key={e.username}>
                    <td>{e.position}</td>
                    <td className="name">
                      <PlayerLink name={e.clanTag ? `(${e.clanTag}) ${e.username}` : e.username} username={e.username} />
                    </td>
                    <td>{e.rating.toFixed(2)}</td>
                    <td>{Math.trunc(e.score)}</td>
                    <td>{e.neg}</td>
                    <td>{e.matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {b.total > b.entries.length && (
            <p className="stats-tabs">
              <button type="button" onClick={() => setLimit((l) => Math.min(100, l + 50))} disabled={limit >= 100}>
                {t('More')}
              </button>
            </p>
          )}
        </Section>
      )}
    </TextPage>
  );
}
