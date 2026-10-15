// SPDX-License-Identifier: GPL-2.0-or-later
// Relatório de partida (OG-214, RN-SOC-01/05), num link compartilhável: placar e vencedor, mapa,
// regras, tabela por time com destaque do melhor jogador, linha do tempo das capturas, replay e
// links para os perfis e os marcos conquistados na partida (OG-213). As estatísticas completas (as mesmas da F4 e do `save_stats` do original)
// ficam em "Estatísticas detalhadas".
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { MapPreview } from './MapPreview.js';
import { milestoneText } from './Profile.js';
import { clock, date, duration, PlayerLink, Status, useApi, type MatchPage, type PlayerLine } from './stats.js';

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

/** Melhor jogador: mais frags; desempate por capturas, kills e menos mortes. */
export function bestPlayer(players: readonly PlayerLine[]): PlayerLine | undefined {
  return [...players].sort((a, b) => b.frags - a.frags || b.captures - a.captures || b.kills - a.kills || a.deaths - b.deaths || a.slot - b.slot)[0];
}

/** Capturas com o placar depois de cada uma (o placar parte do `baseScore`). */
export function captureTimeline(captures: NonNullable<MatchPage['details']['captures']>, base: readonly [number, number] = [0, 0]) {
  let red = base[0];
  let blue = base[1];
  return captures.map((c) => {
    if (c.team === 0) red++;
    else blue++;
    return { ...c, red, blue };
  });
}

export function MatchScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const page = useApi<MatchPage>(`/matches/${encodeURIComponent(id)}`);
  const [copied, setCopied] = useState(false);
  const m = page.data;
  if (!m) {
    return (
      <Page title={t('Match report')} onBack={() => void navigate(-1)}>
        <Status loading={m === undefined} missing={m === null} error={page.error} />
      </Page>
    );
  }
  const d = m.details;
  const rules = d.rules;
  const minutes = (frames: number) => `${Math.trunc(frames / 600)} min`;
  const { redScore, blueScore } = m.match;
  const best = bestPlayer(m.players);
  const seconds = (Date.parse(m.match.endedAt) - Date.parse(m.match.startedAt)) / 1000;
  const winner = redScore > blueScore ? t('Red team wins') : blueScore > redScore ? t('Blue team wins') : t('Draw');
  const timeline = captureTimeline(d.captures ?? [], d.baseScore);
  const ranked = m.match.ranked;

  const teamTable = (team: 0 | 1) => (
    <Table
      caption={team === 0 ? t('Red team') : t('Blue team')}
      rows={m.players.filter((p) => p.team === team)}
      rowKey={(p) => String(p.slot)}
      columns={[
        {
          key: 'name',
          header: t('Player'),
          cell: (p) => (
            <span className="report-player">
              <PlayerLink name={p.name} username={p.username} />
              {p === best && <Badge tone="accent">{t('Best player')}</Badge>}
            </span>
          ),
        },
        { key: 'frags', header: t('Frags'), cell: (p) => p.frags, align: 'end' },
        { key: 'kills', header: t('Kills'), cell: (p) => p.kills, align: 'end' },
        { key: 'deaths', header: t('Deaths'), cell: (p) => p.deaths, align: 'end' },
        { key: 'captures', header: t('Captures'), cell: (p) => p.captures, align: 'end' },
        { key: 'assists', header: t('Assists'), cell: (p) => p.stats.assists ?? 0, align: 'end' },
        { key: 'accuracy', header: t('Accuracy'), cell: (p) => `${Math.round(100 * (p.stats.accuracy ?? 0))}%`, align: 'end' },
        { key: 'returns', header: t('Flags returned'), cell: (p) => p.stats.flagsReturned ?? 0, align: 'end' },
        ...(ranked
          ? [{ key: 'rank', header: t('Ranking'), cell: (p: PlayerLine) => (p.username ? `${p.scoreDelta >= 0 ? '+' : ''}${p.scoreDelta} / +${p.negDelta}` : '—'), align: 'end' as const }]
          : []),
      ]}
    />
  );

  return (
    <Page
      title={d.mapTitle ?? m.match.map}
      subtitle={`${date(m.match.endedAt, prefs.locale)} · ${m.match.mode === 'ranked' ? t('Ranked') : t('Casual')}${m.match.mode === 'ranked' && !ranked ? ` (${t('did not count for the ranking')})` : ''} · ${duration(seconds)}`}
      onBack={() => void navigate(-1)}
    >
      <section className="report-score" aria-label={t('Score')}>
        <span className="report-team red">{t('Red')}</span>
        <span className="report-points">
          {redScore} – {blueScore}
        </span>
        <span className="report-team blue">{t('Blue')}</span>
        <Badge tone={redScore === blueScore ? 'neutral' : 'success'}>{winner}</Badge>
      </section>
      <div className="ui-row report-actions">
        {m.replayUrl && (
          <Button variant="primary" onClick={() => void navigate(`/replay?src=${encodeURIComponent(m.replayUrl!)}`)}>
            {t('Watch replay')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(location.href).then(() => setCopied(true))}>
          {copied ? t('Link copied') : t('Copy link')}
        </Button>
      </div>
      <div className="report-grid">
        <Panel title={t('Map')}>
          <MapPreview name={m.match.map} label={d.mapTitle ?? m.match.map} />
          {rules && (
            <dl className="ui-pairs">
              <div>
                <dt>{t('Capture limit')}</dt>
                <dd>{rules.captureLimit === 0 ? t('none') : `${rules.captureLimit}${rules.winScoreDifference > 1 ? ` (${t('difference of $1', String(rules.winScoreDifference))})` : ''}`}</dd>
              </div>
              <div>
                <dt>{t('Time limit')}</dt>
                <dd>{rules.timeLimit === 0 ? t('none') : minutes(rules.timeLimit)}</dd>
              </div>
              {rules.timeLimit !== 0 && (
                <div>
                  <dt>{t('Extra time')}</dt>
                  <dd>
                    {rules.extraTime === 0 ? t('none') : `${rules.extraTimePeriods > 1 ? `${rules.extraTimePeriods}×` : ''}${minutes(rules.extraTime)}`}
                    {rules.extraTime !== 0 && rules.suddenDeath ? ` (${t('sudden death')})` : ''}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Panel>
        <Panel title={t('Captures')}>
          {timeline.length === 0 ? (
            <p className="ui-muted">{t('No captures.')}</p>
          ) : (
            <ol className="report-timeline">
              {timeline.map((c, i) => (
                <li key={i} className={c.team === 0 ? 'red' : 'blue'}>
                  <span className="report-clock">{clock(c.time)}</span>
                  <span>
                    <strong>{c.capturer}</strong>
                    {c.assistant ? ` + ${c.assistant}` : ''}
                  </span>
                  <span className="report-running">
                    {c.red}–{c.blue}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
      {m.milestones && m.milestones.length > 0 && (
        <Panel title={t('Milestones')}>
          <ul className="report-milestones">
            {m.milestones.map((x) => (
              <li key={`${x.username}-${x.milestone}`}>
                <PlayerLink name={x.username} username={x.username} /> <Badge tone="accent">{milestoneText(x.milestone, prefs.locale).name}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={`${t('Red team')} · ${redScore}`} className="report-team-panel red">
        {teamTable(0)}
      </Panel>
      <Panel title={`${t('Blue team')} · ${blueScore}`} className="report-team-panel blue">
        {teamTable(1)}
      </Panel>
      <details className="report-details">
        <summary>{t('Detailed statistics')}</summary>
        {d.teams && (
          <section className="stats-section">
            <h2>{t('Team stats')}</h2>
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
          </section>
        )}
        <section className="stats-section">
          <h2>{t('Player stats')}</h2>
          <table className="stats-table wide">
            <thead>
              <tr>
                <th>{t('Player')}</th>
                {PLAYER_COLUMNS.map(([label]) => (
                  <th key={label}>{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.players.map((p) => (
                <tr key={p.slot} className={p.team === 0 ? 'team-red' : 'team-blue'}>
                  <td className="name">
                    <PlayerLink name={p.name} username={p.username} />
                  </td>
                  {PLAYER_COLUMNS.map(([label, value]) => (
                    <td key={label}>{value(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </details>
      <p className="ui-muted">
        <Link to="/ranking">{t('Ranking')}</Link>
      </p>
    </Page>
  );
}

/**
 * "Ver relatório" no fim da partida: o game server manda o resultado à API logo depois do fim, então
 * espera até ~20 s pela partida da sala terminada depois de `after` e abre o relatório dela.
 */
export function LastMatchScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const after = params.get('after');
  const [match, setMatch] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const query = after ? `?${new URLSearchParams({ after })}` : '';
    const attempt = () =>
      api<{ id: string }>(`/rooms/${encodeURIComponent(id)}/last-match${query}`).then(
        (r) => alive && setMatch(r.id),
        () => {
          if (!alive) return;
          if (++tries >= 10) setMatch(null);
          else setTimeout(attempt, 2000);
        },
      );
    void attempt();
    return () => {
      alive = false;
    };
  }, [id, after]);
  if (match) return <Navigate to={`/matches/${match}`} replace />;
  return (
    <Page title={t('Match report')} onBack={() => void navigate(-1)}>
      <p className="ui-muted">{match === null ? t('The report is not ready yet.') : t('Waiting for the match report...')}</p>
    </Page>
  );
}
