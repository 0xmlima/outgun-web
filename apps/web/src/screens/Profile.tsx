// SPDX-License-Identifier: GPL-2.0-or-later
// Perfil social (OG-212, RN-SOC-01/02/03): página com rolagem em /players/:nome. Cabeçalho (clã, cor,
// membro desde, última partida, rating de habilidade), números por modo e por período, evolução do
// rating de habilidade (OG-351), marcos (OG-213), partidas recentes (relatório e replay), companheiros, rivais e clã.
// O filtro de formato (OG-258, na URL) vale para os números do Ranked e as partidas (o rating é único).
// Tudo vem da API (OG-085, OG-211); o que o jogador escondeu (D-39) aparece como "privado".
import { chatName } from '@outgun/protocol';
import { MILESTONES } from '@outgun/content';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAccount } from '../app/account.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { Tabs } from '../ui/Tabs.js';
import { TitleBadges } from './HallOfFame.js';
import { useManifestLists } from './options.js';
import { MilestonesPanel } from './milestones-panel.js';
import { RatingInfo } from './rating-help.js';
import { date, duration, FormatTabs, formatQuery, percent, PlayerLink, Status, SubstitutionBadges, useApi, useFormatParam, type HistoryEntry, type Mode, type Profile, type Totals } from './stats.js';

interface Mate {
  username: string;
  clanTag: string | null;
  clanLabel: string | null;
  matches: number;
  wins: number;
  losses: number;
}
interface Social {
  hidden: boolean;
  companions: Mate[];
  rivals: (Mate & { draws: number; balance: number })[];
  clan: { tag: string; members: string[] } | null;
}
interface PeriodTotals {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  playSeconds: number;
}
interface Progress {
  hidden: boolean;
  /** Rating de habilidade após cada ranqueada (OG-351). */
  series: { at: string; value: number }[];
  periods: { days7: PeriodTotals; days30: PeriodTotals; all: PeriodTotals } | null;
}

/** Nome com a tag decorada pelo estilo do clã (OG-338). */
const withClan = (username: string, clanLabel: string | null) => chatName(username, clanLabel);
const kd = (kills: number, deaths: number) => (deaths > 0 ? (kills / deaths).toFixed(2) : String(kills));
/** Nome e descrição de um marco no idioma da interface (inglês fora do pt-BR). */
export function milestoneText(id: string, locale: string): { name: string; description: string } {
  const m = MILESTONES.find((x) => x.id === id);
  const l = locale === 'pt-BR' ? 'pt-BR' : 'en';
  return m ? { name: m.name[l], description: m.description[l] } : { name: id, description: '' };
}

export function ProfileScreen() {
  const { t, prefs } = usePrefs();
  const { user: me } = useAccount();
  const navigate = useNavigate();
  const { name = '' } = useParams();
  const base = `/players/${encodeURIComponent(name)}`;
  const [mode, setMode] = useState<Mode>('casual');
  const [historyMode, setHistoryMode] = useState<Mode | 'all'>('all');
  const [limit, setLimit] = useState(10);
  // filtro de formato (OG-258): números do Ranked e partidas; o Casual não tem formato
  const [format, setFormat] = useFormatParam();
  const profile = useApi<Profile>(format === 'all' ? base : `${base}?format=${format}`, true, 'matches');
  const social = useApi<Social>(`${base}/social`);
  const [duelPeriod, setDuelPeriod] = useState<'month' | 'all'>('month');
  const duels = useApi<Duels>(`${base}/kills?period=${duelPeriod}`);
  const progress = useApi<Progress>(`${base}/progress`);
  const history = useApi<{ total: number; hidden: boolean; matches: HistoryEntry[] }>(
    `${base}/matches?limit=${limit}${historyMode === 'all' ? '' : `&mode=${historyMode}`}${historyMode === 'casual' ? '' : formatQuery(format)}`,
    false,
    'matches',
  );
  const colours = useManifestLists().playerColours;
  const p = profile.data;
  if (!p) {
    return (
      <Page title={name} onBack={() => void navigate(-1)}>
        <Status loading={p === undefined} missing={p === null} error={profile.error} />
      </Page>
    );
  }
  const owner = me?.username === p.user.username;
  const colour = p.favoriteColors[0] !== undefined ? colours[p.favoriteColors[0]] : undefined;
  const subtitle = [
    t('Member since $1', new Date(p.user.createdAt).toLocaleDateString(prefs.locale, { dateStyle: 'medium' })),
    p.lastMatchAt ? t('last match $1', date(p.lastMatchAt, prefs.locale)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const totals = p.totals[mode];
  const numbers: [string, (x: Totals) => string | number][] = [
    [t('Matches'), (x) => x.matches],
    [t('Wins'), (x) => x.wins],
    [t('Losses'), (x) => x.losses],
    [t('Draws'), (x) => x.draws],
    [t('Kills'), (x) => x.kills],
    [t('Deaths'), (x) => x.deaths],
    ['K/D', (x) => kd(x.kills, x.deaths)],
    [t('Captures'), (x) => x.captures],
    [t('Assists'), (x) => x.assists],
    [t('Flags returned'), (x) => x.flagsReturned],
    [t('Accuracy'), (x) => percent(x.hits, x.shots)],
    [t('Playing time'), (x) => duration(x.playSeconds)],
  ];
  const pr = progress.data;
  const skill = p.skill;
  const s = social.data;
  const privateNote = <p className="ui-muted">{t('This player keeps it private.')}</p>;

  return (
    <Page
      title={
        <span className="profile-name">
          {colour && <span className="profile-colour" style={{ background: colour }} aria-hidden="true" />}
          {withClan(p.user.username, p.user.clanLabel)}
        </span>
      }
      subtitle={subtitle}
      onBack={() => void navigate(-1)}
    >
      <div className="ui-row profile-head">
        {skill ? (
          <Badge tone={skill.calibrating ? 'neutral' : 'accent'}>
            {skill.calibrating ? t('Rating $1 · calibrating ($2/$3)', String(skill.value), String(skill.matches), '10') : t('Rating $1', String(skill.value))}
          </Badge>
        ) : (
          <Badge>{t('No rating yet: play Ranked')}</Badge>
        )}
        <RatingInfo />
        <TitleBadges titles={p.titles ?? []} />
        <Link to="/ranking">{t('Ranking')}</Link>
        <Link to="/players">{t('Players')}</Link>
        {owner && <Link to="/account">{t('Profile privacy')}</Link>}
      </div>
      <FormatTabs
        value={format}
        onChange={(f) => {
          setFormat(f);
          setLimit(10);
          if (f !== 'all') setMode('ranked');
        }}
      />

      <div className="report-grid">
        <Panel title={t('Statistics')}>
          <Tabs
            label={t('Mode')}
            value={mode}
            onChange={setMode}
            tabs={[
              { id: 'casual', label: t('Casual') },
              { id: 'ranked', label: t('Ranked') },
            ]}
          >
            <dl className="ui-pairs profile-numbers">
              {numbers.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value(totals)}</dd>
                </div>
              ))}
            </dl>
          </Tabs>
        </Panel>
        <Panel title={t('Activity')}>
          {pr?.hidden || pr?.periods === null ? (
            privateNote
          ) : pr?.periods ? (
            <Table
              caption={t('Activity')}
              rowKey={(r) => r.key}
              rows={[
                { key: 'days7', label: t('7 days'), v: pr.periods.days7 },
                { key: 'days30', label: t('30 days'), v: pr.periods.days30 },
                { key: 'all', label: t('All'), v: pr.periods.all },
              ]}
              columns={[
                { key: 'label', header: '', cell: (r) => r.label },
                { key: 'matches', header: t('Matches'), cell: (r) => r.v.matches, align: 'end' },
                { key: 'wins', header: t('Wins'), cell: (r) => r.v.wins, align: 'end' },
                { key: 'kd', header: 'K/D', cell: (r) => kd(r.v.kills, r.v.deaths), align: 'end' },
                { key: 'captures', header: t('Captures'), cell: (r) => r.v.captures, align: 'end' },
                { key: 'time', header: t('Playing time'), cell: (r) => duration(r.v.playSeconds), align: 'end' },
              ]}
            />
          ) : (
            <Status loading={pr === undefined} missing={false} error={progress.error} />
          )}
        </Panel>
      </div>

      <Panel title={t('Rating')} actions={<RatingInfo />}>
        {pr?.hidden ? privateNote : pr && pr.series.length > 1 ? <RatingChart series={pr.series} locale={prefs.locale} /> : <p className="ui-muted">{t('No ranked matches yet.')}</p>}
      </Panel>

      <MilestonesPanel p={p} />

      <Panel title={t('Recent matches')}>
        <Tabs
          label={t('Mode')}
          value={historyMode}
          onChange={(m) => {
            setHistoryMode(m);
            setLimit(10);
          }}
          tabs={[
            { id: 'all', label: t('All') },
            { id: 'casual', label: t('Casual') },
            { id: 'ranked', label: t('Ranked') },
          ]}
        >
          {history.data?.hidden ? (
            privateNote
          ) : history.data ? (
            <>
              <Table
                caption={t('Recent matches')}
                rows={history.data.matches}
                rowKey={(m) => m.id}
                onRowActivate={(m) => void navigate(`/matches/${m.id}`)}
                empty={t('No matches yet.')}
                columns={[
                  { key: 'date', header: t('Date'), cell: (m) => <Link to={`/matches/${m.id}`}>{date(m.endedAt, prefs.locale)}</Link> },
                  { key: 'result', header: t('Result'), cell: (m) => <MatchResult m={m} /> },
                  { key: 'map', header: t('Map'), cell: (m) => m.mapTitle },
                  {
                    key: 'mode',
                    header: t('Mode'),
                    cell: (m) => (
                      <>
                        {m.mode === 'ranked' ? (m.format ? `${t('Ranked')} ${m.format}` : t('Ranked')) : t('Casual')}
                        {m.clanWar && <Badge tone="accent">{t('Clan vs clan')}</Badge>}
                        <SubstitutionBadges withBots={m.withBots} shortHanded={m.shortHanded} />
                      </>
                    ),
                  },
                  { key: 'kd', header: `${t('Kills')}/${t('Deaths')}`, cell: (m) => `${m.player.kills}/${m.player.deaths}`, align: 'end' },
                  { key: 'captures', header: t('Captures'), cell: (m) => m.player.captures, align: 'end' },
                  {
                    key: 'replay',
                    header: '',
                    cell: (m) =>
                      m.replayUrl ? (
                        <Button
                          variant="ghost"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void navigate(`/replay?src=${encodeURIComponent(m.replayUrl!)}`);
                          }}
                        >
                          {t('Watch')}
                        </Button>
                      ) : null,
                  },
                ]}
              />
              {history.data.total > history.data.matches.length && limit < 100 && (
                <div className="ui-row">
                  <Button variant="ghost" onClick={() => setLimit((l) => Math.min(100, l + 20))}>
                    {t('More')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Status loading missing={false} error={history.error} />
          )}
        </Tabs>
      </Panel>

      <div className="report-grid">
        <Panel title={t('Teammates')}>{s?.hidden ? privateNote : <MateTable caption={t('Teammates')} rows={s?.companions ?? []} />}</Panel>
        <Panel title={t('Rivals')}>{s?.hidden ? privateNote : <MateTable caption={t('Rivals')} rows={s?.rivals ?? []} />}</Panel>
        <Panel title={t('Who killed whom')}>
          <Tabs
            label={t('Period')}
            tabs={[
              { id: 'month', label: t('This month') },
              { id: 'all', label: t('All time') },
            ]}
            value={duelPeriod}
            onChange={setDuelPeriod}
          >
            {duels.data?.hidden ? (
              privateNote
            ) : duels.data ? (
              <div className="report-grid">
                <DuelTable caption={t('Favourite victims')} rows={duels.data.victims} />
                <DuelTable caption={t('Who kills you most')} rows={duels.data.killers} />
              </div>
            ) : (
              <Status loading={duels.data === undefined} missing={false} error={duels.error} />
            )}
          </Tabs>
        </Panel>
        {s?.clan && (
          <Panel title={`${t('Clan')} · ${s.clan.tag}`} actions={<Link to={`/clans/${encodeURIComponent(s.clan.tag)}`}>{t('Clan page')}</Link>}>
            <ul className="profile-clan">
              {s.clan.members.map((m) => (
                <li key={m}>
                  <PlayerLink name={m} username={m} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </Page>
  );
}

function MatchResult({ m }: { m: HistoryEntry }) {
  const { t } = usePrefs();
  const mine = m.player.team === 0 ? m.redScore : m.blueScore;
  const theirs = m.player.team === 0 ? m.blueScore : m.redScore;
  const tone = mine > theirs ? 'success' : mine < theirs ? 'danger' : 'neutral';
  return (
    <Badge tone={tone}>
      {mine > theirs ? t('Win') : mine < theirs ? t('Loss') : t('Draw')} {mine}–{theirs}
    </Badge>
  );
}

/** Quem matou quem (OG-364): abates entre o jogador e cada adversário nas ranqueadas com eventos. */
interface Duel {
  username: string;
  clanTag: string | null;
  clanLabel: string | null;
  kills: number;
}
interface Duels {
  hidden: boolean;
  victims: Duel[];
  killers: Duel[];
}

function DuelTable({ caption, rows }: { caption: string; rows: Duel[] }) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  return (
    <Table
      caption={caption}
      rows={rows}
      rowKey={(r) => r.username}
      onRowActivate={(r) => void navigate(`/players/${encodeURIComponent(r.username)}`)}
      empty={t('No data yet (counted from Ranked matches since the event log).')}
      columns={[
        { key: 'name', header: caption, cell: (r) => <PlayerLink name={withClan(r.username, r.clanLabel)} username={r.username} /> },
        { key: 'kills', header: t('Kills'), cell: (r) => r.kills, align: 'end' },
      ]}
    />
  );
}

function MateTable({ caption, rows }: { caption: string; rows: Mate[] }) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  return (
    <Table
      caption={caption}
      rows={rows}
      rowKey={(r) => r.username}
      onRowActivate={(r) => void navigate(`/players/${encodeURIComponent(r.username)}`)}
      empty={t('Nobody yet.')}
      columns={[
        { key: 'name', header: t('Player'), cell: (r) => <PlayerLink name={withClan(r.username, r.clanLabel)} username={r.username} /> },
        { key: 'matches', header: t('Matches'), cell: (r) => r.matches, align: 'end' },
        { key: 'wins', header: t('Wins'), cell: (r) => r.wins, align: 'end' },
        { key: 'losses', header: t('Losses'), cell: (r) => r.losses, align: 'end' },
      ]}
    />
  );
}

const H = 200;
const PAD = { left: 44, right: 12, top: 12, bottom: 24 };

/** Evolução do rating na temporada: linha única, eixo discreto, cruz e valor ao passar o ponteiro. */
export function RatingChart({ series, locale }: { series: { at: string; value: number }[]; locale: string }) {
  const { t } = usePrefs();
  const [hover, setHover] = useState<number | null>(null);
  // o SVG tem a largura real do painel: textos em px de verdade (no celular não encolhem)
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const times = series.map((p) => Date.parse(p.at));
  const values = series.map((p) => p.value);
  const [t0, t1] = [times[0]!, times[times.length - 1]!];
  let [lo, hi] = [Math.min(...values), Math.max(...values)];
  if (hi - lo < 50) [lo, hi] = [Math.max(0, lo - 25), hi + 25];
  const x = (ms: number) => PAD.left + ((ms - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]!).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const ticks = [lo, (lo + hi) / 2, hi];
  const day = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  const onMove = (ev: PointerEvent<SVGSVGElement>) => {
    const box = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(x(times[i]!) - px) < Math.abs(x(times[best]!) - px)) best = i;
    setHover(best);
  };
  const h = hover === null ? null : { cx: x(times[hover]!), cy: y(values[hover]!), p: series[hover]! };
  const last = values[values.length - 1]!;
  return (
    <figure className="rating-chart" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('Rating from $1 to $2 (lowest $3, highest $4)', String(values[0]), String(last), String(Math.min(...values)), String(Math.max(...values)))}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="tick" x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {Math.round(v)}
            </text>
          </g>
        ))}
        <text className="tick" x={PAD.left} y={H - 6}>
          {day(t0)}
        </text>
        <text className="tick" x={W - PAD.right} y={H - 6} textAnchor="end">
          {day(t1)}
        </text>
        <path className="line" d={path} />
        <circle className="dot" cx={x(t1)} cy={y(last)} r={4} />
        {h && (
          <g>
            <line className="cross" x1={h.cx} x2={h.cx} y1={PAD.top} y2={H - PAD.bottom} />
            <circle className="dot" cx={h.cx} cy={h.cy} r={5} />
          </g>
        )}
      </svg>
      {h && (
        <div className="rating-tip" style={{ left: `${(h.cx / W) * 100}%`, top: `${(h.cy / H) * 100}%` }}>
          <strong>{h.p.value}</strong> <span className="ui-muted">{date(h.p.at, locale)}</span>
        </div>
      )}
    </figure>
  );
}
