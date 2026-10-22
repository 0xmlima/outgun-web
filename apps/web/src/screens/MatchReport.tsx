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
import { clock, date, duration, PlayerLink, signedDelta, Status, SubstitutionBadges, useApi, type MatchPage, type PlayerLine, type SeriesView } from './stats.js';

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
  // OG-355: ausentes nas partidas anteriores à implantação
  ['Effective damage', (p) => (p.stats.effectiveDamage === undefined ? '—' : Math.round(p.stats.effectiveDamage))],
  ['Kills (enemy base)', (p) => p.stats.killsEnemyBase ?? '—'],
  ['Kills (own base)', (p) => p.stats.killsOwnBase ?? '—'],
  ['Kills (midfield)', (p) => p.stats.killsMidfield ?? '—'],
  ['Defenses', (p) => p.stats.defenses ?? '—'],
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

/** Eventos da ranqueada (OG-362); `events` null = partida sem registro. */
interface MatchEvents {
  players: { slot: number; name: string; username: string | null; team: number; isBot: boolean }[];
  events: (number | string)[][] | null;
}

/** Abates de cada jogador (linha) em cada adversário (coluna), dos eventos da partida (OG-364). */
export function killMatrix(data: MatchEvents): { names: string[]; teams: number[]; kills: number[][] } {
  const order = data.players.map((_, i) => i).sort((a, b) => data.players[a]!.team - data.players[b]!.team || a - b);
  const pos = new Map(order.map((idx, i) => [idx, i]));
  const kills = order.map(() => order.map(() => 0));
  for (const e of data.events ?? []) {
    if (e[1] !== 'kill') continue;
    const k = pos.get(e[2] as number);
    const v = pos.get(e[3] as number);
    if (k !== undefined && v !== undefined && k !== v) kills[k]![v]!++;
  }
  return { names: order.map((i) => data.players[i]!.name), teams: order.map((i) => data.players[i]!.team), kills };
}

function KillMatrix({ data }: { data: MatchEvents | null | undefined }) {
  const { t } = usePrefs();
  if (data === undefined) return null;
  const m = data?.events ? killMatrix(data) : null;
  const team = (n: number) => (n === 0 ? 'team-red' : 'team-blue');
  return (
    <section className="stats-section">
      <h2>{t('Kills by victim')}</h2>
      {!m ? (
        <p className="ui-muted">{t('No data for this match.')}</p>
      ) : (
        <table className="stats-table wide">
          <caption className="ui-muted">{t('Row = killer, column = victim.')}</caption>
          <thead>
            <tr>
              <th>{t('Player')}</th>
              {m.names.map((n, i) => (
                <th key={i} className={team(m.teams[i]!)}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.kills.map((row, k) => (
              <tr key={k}>
                <th className={team(m.teams[k]!)}>{m.names[k]}</th>
                {row.map((n, v) => (
                  <td key={v}>{k === v ? '—' : n || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

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

/** Texto do resultado da série: vencedor, empate ou placar parcial. */
export function seriesResult(s: SeriesView, t: (text: string, ...args: string[]) => string): string {
  if (!s.finished) return t('Series in progress: $1 × $2', String(s.redWins), String(s.blueWins));
  if (s.winner === null) return t('Series tied $1 × $2', String(s.redWins), String(s.blueWins));
  return t(s.winner === 0 ? 'Red team wins the series $1 × $2' : 'Blue team wins the series $1 × $2', String(s.redWins), String(s.blueWins));
}

/** Jogos da série (OG-257, RN-RKL-03): placar da série e links para os outros relatórios. */
function SeriesPanel({ series, current }: { series: SeriesView; current?: string }) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  return (
    <Panel title={`${t('Series')} · ${series.format} · ${series.bestOf === 1 ? t('Single game') : t('Best of $1', String(series.bestOf))}`} actions={current ? <Link to={`/series/${series.id}`}>{t('Series page')}</Link> : undefined}>
      <p className="report-series-result">
        <strong>{seriesResult(series, t)}</strong>
      </p>
      <Table
        caption={t('Games of the series')}
        rows={series.matches}
        rowKey={(g) => g.id}
        onRowActivate={(g) => g.id !== current && void navigate(`/matches/${g.id}`)}
        empty={t('No games yet.')}
        columns={[
          { key: 'game', header: t('Game'), cell: (g) => (g.id === current ? <Badge tone="accent">{t('Game $1', String(g.gameNo ?? '?'))}</Badge> : t('Game $1', String(g.gameNo ?? '?'))) },
          {
            key: 'map',
            header: t('Map'),
            cell: (g) => (
              <>
                {g.mapTitle}
                <SubstitutionBadges withBots={g.withBots} shortHanded={g.shortHanded} />
              </>
            ),
          },
          { key: 'score', header: t('Score'), cell: (g) => `${g.redScore} – ${g.blueScore}`, align: 'end' },
        ]}
      />
    </Panel>
  );
}

/** Página da série (OG-257): resultado final e os relatórios de cada jogo. */
export function SeriesScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const page = useApi<{ series: SeriesView }>(`/series/${encodeURIComponent(id)}`);
  const s = page.data?.series;
  if (!s) {
    return (
      <Page title={t('Series')} onBack={() => void navigate(-1)}>
        <Status loading={page.data === undefined} missing={page.data === null} error={page.error} />
      </Page>
    );
  }
  return (
    <Page title={`${t('Series')} ${s.format}`} subtitle={`${date(s.startedAt, prefs.locale)} · ${s.bestOf === 1 ? t('Single game') : t('Best of $1', String(s.bestOf))}`} onBack={() => void navigate(-1)}>
      <section className="report-score" aria-label={t('Score')}>
        <span className="report-team red">{t('Red')}</span>
        <span className="report-points">
          {s.redWins} – {s.blueWins}
        </span>
        <span className="report-team blue">{t('Blue')}</span>
        <Badge tone={s.winner === null ? 'neutral' : 'success'}>{seriesResult(s, t)}</Badge>
      </section>
      <SeriesPanel series={s} />
    </Page>
  );
}

export function MatchScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const page = useApi<MatchPage>(`/matches/${encodeURIComponent(id)}`);
  const events = useApi<MatchEvents>(`/matches/${encodeURIComponent(id)}/events`);
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
  // rating de habilidade (OG-351): variação de cada conta e chance prevista de cada time
  const skill = new Map((m.skill ?? []).map((c) => [c.username, c]));
  const chance = ([0, 1] as const).map((team) => (m.skill ?? []).find((c) => c.team === team)?.winChance);

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
        ...(skill.size > 0
          ? [{ key: 'rating', header: t('Rating'), cell: (p: PlayerLine) => { const c = p.username ? skill.get(p.username) : undefined; return c ? `${signedDelta(c.after - c.before)} (${c.after})` : '—'; }, align: 'end' as const }]
          : []),
      ]}
    />
  );

  return (
    <Page
      title={d.mapTitle ?? m.match.map}
      subtitle={`${date(m.match.endedAt, prefs.locale)} · ${m.match.mode === 'ranked' ? t('Ranked') : t('Casual')}${m.match.mode === 'ranked' && !ranked ? ` (${t('did not count for the ranking')})` : ''}${m.format ? ` · ${m.format}` : ''}${m.series && m.series.bestOf > 1 && m.gameNo ? ` · ${t('Game $1 of $2', String(m.gameNo), String(m.series.bestOf))}` : ''} · ${duration(seconds)}`}
      onBack={() => void navigate(-1)}
    >
      <section className="report-score" aria-label={t('Score')}>
        <span className="report-team red">{t('Red')}</span>
        <span className="report-points">
          {redScore} – {blueScore}
        </span>
        <span className="report-team blue">{t('Blue')}</span>
        <Badge tone={redScore === blueScore ? 'neutral' : 'success'}>{winner}</Badge>
        <SubstitutionBadges withBots={m.match.withBots} shortHanded={m.match.shortHanded} />
        {m.match.clanWar && (
          <Badge tone="accent">
            {t('Clan vs clan')}
            {m.clans && (
              <>
                {' · '}
                <Link to={`/clans/${encodeURIComponent(m.clans.red.tag)}`}>{m.clans.red.tag}</Link> × <Link to={`/clans/${encodeURIComponent(m.clans.blue.tag)}`}>{m.clans.blue.tag}</Link>
              </>
            )}
          </Badge>
        )}
        {chance[0] !== undefined && chance[1] !== undefined && (
          <span className="ui-muted">{t('Predicted win chance: red $1% · blue $2%', String(Math.round(100 * chance[0])), String(Math.round(100 * chance[1])))}</span>
        )}
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
        {m.series && <SeriesPanel series={m.series} current={m.match.id} />}
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
            {[...new Set(m.milestones.map((x) => x.username))].map((username) => (
              <li key={username}>
                <PlayerLink name={username} username={username} />{' '}
                {m.milestones!.filter((x) => x.username === username).map((x) => (
                  <Badge key={x.milestone} tone="accent">
                    {milestoneText(x.milestone, prefs.locale).name}
                  </Badge>
                ))}
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
        <KillMatrix data={events.data} />
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
