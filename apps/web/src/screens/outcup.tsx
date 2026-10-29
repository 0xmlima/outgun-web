// SPDX-License-Identifier: GPL-2.0-or-later
// OutCup (OG-523, OG-524, OG-525, D-88, RN-CUP) em /outcup e /outcup/:edicao: inscrição, chave,
// calendário das fases, minha dupla e o confronto (`?confronto=<id>`) com os horários de cada
// jogador, a proposta e o aceite do horário, e a sala na hora do jogo. Também o arquivo das edições
// e os selos de campeão e vice do perfil.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAccount } from '../app/account.js';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button, type Tone } from '../ui/Button.js';
import { FormMessageLine, Page, type FormMessage } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Status, useApi } from './stats.js';

interface Game {
  id: string;
  gameNo: number | null;
  redScore: number;
  blueScore: number;
  map: string;
}
export interface CupMatch {
  id: string;
  round: number;
  slot: number;
  duoA: string | null;
  duoB: string | null;
  bestOf: number;
  windowStart: string;
  windowEnd: string;
  status: 'pending' | 'open' | 'scheduled' | 'live' | 'done' | 'walkover' | 'double_walkover' | 'bye' | 'dispute';
  scheduledAt: string | null;
  proposedAt: string | null;
  proposedBy: string | null;
  winner: string | null;
  scoreA: number | null;
  scoreB: number | null;
  resolution: string | null;
  roomId: string | null;
  games: Game[];
}
interface Duo {
  id: string;
  players: string[];
  seed: number;
  rating: number;
}
export interface Cup {
  edition: string;
  status: 'registration' | 'running' | 'finished' | 'cancelled';
  registrationOpensAt: string;
  drawAt: string;
  startsAt: string;
  endsAt: string;
  rounds: number | null;
  cancelReason: string | null;
  entrants: string[];
  leftOut: string | null;
  duos: Duo[];
  matches: CupMatch[];
  champion: string | null;
  runnerUp: string | null;
  me: { entered: boolean; duoId: string | null } | null;
}
interface MatchDetail {
  match: CupMatch;
  duoA: Duo | null;
  duoB: Duo | null;
  availability: { name: string; duo: 'a' | 'b'; me: boolean; hours: string[] }[] | null;
  common: string[];
  myDuo: 'a' | 'b' | null;
}
interface CupSummary {
  edition: string;
  status: Cup['status'];
  duos: number;
  entrants: number;
  champion: string[] | null;
  runnerUp: string[] | null;
}

type T = ReturnType<typeof usePrefs>['t'];
const HOUR = 3600_000;

/** "OutCup · Dezembro 2026" (RN-CUP-01). */
export function cupTitle(edition: string, locale: string): string {
  const [y, m] = edition.split('-').map(Number);
  if (!y || !m) return 'OutCup';
  const month = new Date(Date.UTC(y, m - 1, 15)).toLocaleString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `OutCup · ${month[0]!.toUpperCase()}${month.slice(1)}`;
}

/** Nome da fase pelo número de duplas que restam. */
export function roundLabel(round: number, rounds: number, t: T): string {
  const left = 2 ** (rounds - round);
  return left === 2 ? t('Final') : left === 4 ? t('Semi-finals') : left === 8 ? t('Quarter-finals') : left === 16 ? t('Round of 16') : left === 32 ? t('Round of 32') : t('Round $1', String(round + 1));
}

const when = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const day = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
/** Fim exclusivo (meia-noite) mostrado como o último dia da janela. */
const lastDay = (iso: string, locale: string) => day(new Date(new Date(iso).getTime() - 60_000).toISOString(), locale);

function statusOf(m: CupMatch, locale: string, t: T): { text: string; tone: Tone } {
  switch (m.status) {
    case 'pending':
      return { text: t('Waiting for the previous round'), tone: 'neutral' };
    case 'open':
      return m.proposedAt ? { text: t('Time proposed: $1', when(m.proposedAt, locale)), tone: 'warning' } : { text: t('Waiting for a time'), tone: 'warning' };
    case 'scheduled':
      return { text: t('Scheduled: $1', when(m.scheduledAt!, locale)), tone: 'accent' };
    case 'live':
      return { text: t('Room open'), tone: 'success' };
    case 'done':
      return { text: m.resolution === 'admin' ? t('Decided by the admin') : m.resolution === 'tiebreak' ? t('Played (tiebreak by captures)') : t('Played'), tone: 'neutral' };
    case 'walkover':
      return { text: t('Walkover'), tone: 'danger' };
    case 'double_walkover':
      return { text: t('Both out by walkover'), tone: 'danger' };
    case 'bye':
      return { text: t('Bye'), tone: 'neutral' };
    case 'dispute':
      return { text: t('With the admin'), tone: 'warning' };
  }
}

export function OutCupScreen() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const { edition } = useParams();
  const [params, setParams] = useSearchParams();
  const cup = useApi<Cup | null>(edition ? `/cups/${edition}` : '/cups/current', true, 'cup');
  const archive = useApi<{ cups: CupSummary[] }>('/cups', true, 'cup');
  const [message, setMessage] = useState<FormMessage>(null);
  const c = cup.data;
  const selected = params.get('confronto');
  const select = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set('confronto', id);
        else p.delete('confronto');
        return p;
      },
      { replace: true },
    );

  const entry = (join: boolean) => {
    if (!c) return;
    setMessage(null);
    api<Cup>(`/cups/${c.edition}/entry`, { method: join ? 'POST' : 'DELETE' }).then(
      () => setMessage({ text: join ? t('You are signed up. The pairs are drawn when sign-ups close.') : t('You left this edition.'), error: false }),
      (e: unknown) =>
        setMessage({ text: e instanceof ApiError && e.code === 'banned' ? t('Banned accounts cannot sign up.') : e instanceof ApiError && e.code === 'registration_closed' ? t('Sign-ups are closed.') : t('Could not save. Try again.'), error: true }),
    );
  };

  return (
    <Page title={c ? cupTitle(c.edition, prefs.locale) : 'OutCup'} subtitle={t('The monthly 2v2 cup: sign up alone, play with a drawn partner, knockout until the title.')} onBack={() => void navigate(-1)}>
      <Status loading={c === undefined} missing={false} error={cup.error} />
      {c === null && <p className="ui-muted">{t('No OutCup edition yet. Sign-ups open on the 20th of each month.')}</p>}
      {c && (
        <>
          <CupHeader cup={c} t={t} locale={prefs.locale} />
          {c.status === 'registration' && (
            <Panel title={t('Sign-ups')}>
              <p>
                {t('Sign-ups close on $1, when the game draws the pairs at random. Games start on $2; each round has a window of about a week and the final ends by the last day of the month.', when(c.drawAt, prefs.locale), day(c.startsAt, prefs.locale))}
              </p>
              <p className="ui-muted">{t('$1 signed up. The cup needs at least 8 (4 pairs).', String(c.entrants.length))}</p>
              {user ? (
                c.me?.entered ? (
                  <Button variant="ghost" onClick={() => entry(false)}>
                    {t('Leave this edition')}
                  </Button>
                ) : new Date(c.registrationOpensAt) <= new Date() ? (
                  <Button variant="primary" onClick={() => entry(true)}>
                    {t('Sign me up')}
                  </Button>
                ) : (
                  <p className="ui-muted">{t('Sign-ups open on $1.', when(c.registrationOpensAt, prefs.locale))}</p>
                )
              ) : (
                <p>
                  <Link to="/login">{t('Sign in to take part.')}</Link>
                </p>
              )}
              <FormMessageLine message={message} />
              {c.entrants.length > 0 && <p className="outcup-entrants">{c.entrants.join(' · ')}</p>}
            </Panel>
          )}
          {c.status === 'cancelled' && (
            <Panel title={t('Edition cancelled')}>
              <p>{c.cancelReason === 'min_duos' ? t('This edition did not reach the minimum of 4 pairs (8 sign-ups).') : (c.cancelReason ?? '')}</p>
            </Panel>
          )}
          {(c.status === 'running' || c.status === 'finished') && c.rounds && (
            <>
              <MyCup cup={c} t={t} locale={prefs.locale} onSelect={select} />
              <Calendar cup={c} t={t} locale={prefs.locale} />
              <Bracket cup={c} t={t} locale={prefs.locale} selected={selected} onSelect={select} />
              {selected && <MatchPanel id={selected} cup={c} onClose={() => select(null)} />}
            </>
          )}
        </>
      )}
      <Archive list={archive.data?.cups ?? []} current={c?.edition ?? null} t={t} locale={prefs.locale} />
    </Page>
  );
}

function CupHeader({ cup, t, locale }: { cup: Cup; t: T; locale: string }) {
  const name = (id: string | null) => cup.duos.find((d) => d.id === id)?.players.join(' + ');
  const champion = name(cup.champion);
  return (
    <div className="outcup-head">
      <Badge tone={cup.status === 'running' ? 'success' : cup.status === 'registration' ? 'accent' : cup.status === 'cancelled' ? 'danger' : 'neutral'}>
        {cup.status === 'registration' ? t('Sign-ups open') : cup.status === 'running' ? t('In progress') : cup.status === 'finished' ? t('Finished') : t('Cancelled')}
      </Badge>
      <span className="ui-muted">
        {day(cup.startsAt, locale)} – {lastDay(cup.endsAt, locale)}
        {cup.duos.length > 0 && ` · ${t('$1 pairs', String(cup.duos.length))}`}
      </span>
      {champion && (
        <p className="outcup-champion">
          {t('Champions')}: <strong>{champion}</strong>
        </p>
      )}
    </div>
  );
}

function MyCup({ cup, t, locale, onSelect }: { cup: Cup; t: T; locale: string; onSelect: (id: string) => void }) {
  if (!cup.me) return null;
  if (!cup.me.duoId) return cup.me.entered && cup.leftOut ? <p className="ui-muted">{t('You were left out of the draw this time (odd number of sign-ups).')}</p> : null;
  const duo = cup.duos.find((d) => d.id === cup.me!.duoId);
  const mine = cup.matches.filter((m) => m.duoA === cup.me!.duoId || m.duoB === cup.me!.duoId);
  const next = mine.find((m) => ['open', 'scheduled', 'live', 'dispute'].includes(m.status));
  const out = mine.some((m) => (m.status === 'done' || m.status === 'walkover' || m.status === 'double_walkover') && m.winner !== cup.me!.duoId);
  const opp = next ? cup.duos.find((d) => d.id === (next.duoA === cup.me!.duoId ? next.duoB : next.duoA)) : undefined;
  return (
    <Panel title={t('My pair')}>
      <p>
        <strong>{duo?.players.join(' + ')}</strong> · {t('seed $1', String(duo?.seed ?? 0))}
      </p>
      {next && opp ? (
        <p>
          {t('Next match: against $1 ($2).', opp.players.join(' + '), roundLabel(next.round, cup.rounds!, t))} {statusOf(next, locale, t).text}.{' '}
          <Button variant="primary" onClick={() => onSelect(next.id)}>
            {t('Open the match')}
          </Button>
        </p>
      ) : out ? (
        <p className="ui-muted">{t('Your run in this edition is over. Thanks for playing!')}</p>
      ) : cup.status === 'finished' ? null : (
        <p className="ui-muted">{t('Your next opponent comes from the match above in the bracket.')}</p>
      )}
    </Panel>
  );
}

function Calendar({ cup, t, locale }: { cup: Cup; t: T; locale: string }) {
  const rounds = cup.rounds!;
  const now = Date.now();
  return (
    <Panel title={t('Calendar')}>
      <ol className="outcup-calendar">
        {Array.from({ length: rounds }, (_, r) => {
          const first = cup.matches.find((m) => m.round === r);
          if (!first) return null;
          const live = now >= Date.parse(first.windowStart) && now < Date.parse(first.windowEnd);
          return (
            <li key={r} className={live ? 'is-now' : undefined}>
              <span className="outcup-when">
                {day(first.windowStart, locale)} – {lastDay(first.windowEnd, locale)}
              </span>
              <span>{roundLabel(r, rounds, t)}</span>
              <span className="ui-muted">{t('best of $1', String(first.bestOf))}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function Bracket({ cup, t, locale, selected, onSelect }: { cup: Cup; t: T; locale: string; selected: string | null; onSelect: (id: string) => void }) {
  const rounds = cup.rounds!;
  const duo = (id: string | null) => cup.duos.find((d) => d.id === id);
  return (
    <Panel title={t('Bracket')}>
      <div className="outcup-bracket-wrap">
        <div className="outcup-bracket">
          {Array.from({ length: rounds }, (_, r) => (
            <div key={r} className="outcup-round">
              <h3>{roundLabel(r, rounds, t)}</h3>
              <div className="outcup-list">
                {cup.matches
                  .filter((m) => m.round === r)
                  .map((m) => {
                    const st = statusOf(m, locale, t);
                    const row = (id: string | null, score: number | null) => {
                      const d = duo(id);
                      const cls = m.winner ? (m.winner === id ? 'is-win' : 'is-lose') : '';
                      return (
                        <span className={`outcup-row ${cls} ${cup.me?.duoId && id === cup.me.duoId ? 'is-mine' : ''}`}>
                          <span>{d ? d.players.join(' + ') : m.status === 'bye' && r === 0 ? t('skips the round') : t('to be decided')}</span>
                          <span className="outcup-score">{score ?? ''}</span>
                        </span>
                      );
                    };
                    return (
                      <button key={m.id} type="button" className={`outcup-match${selected === m.id ? ' is-selected' : ''}`} onClick={() => onSelect(m.id)} aria-label={`${roundLabel(r, rounds, t)} · ${st.text}`}>
                        {row(m.duoA, m.scoreA)}
                        {row(m.duoB, m.scoreB)}
                        <span className={`outcup-status ui-tone-${st.tone}`}>{st.text}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          <div className="outcup-round">
            <h3>{t('Champions')}</h3>
            <div className="outcup-list">
              <div className="outcup-trophy">{duo(cup.champion)?.players.join(' + ') ?? 'OutCup'}</div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function MatchPanel({ id, cup, onClose }: { id: string; cup: Cup; onClose: () => void }) {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const res = useApi<MatchDetail>(`/cups/matches/${id}`, true, 'cup');
  const [message, setMessage] = useState<FormMessage>(null);
  const d = res.data;
  if (!d) return <Status loading={d === undefined} missing={d === null} error={res.error} />;
  const m = d.match;
  const rounds = cup.rounds!;
  const st = statusOf(m, prefs.locale, t);
  const names = (x: Duo | null) => x?.players.join(' + ') ?? t('to be decided');
  const failed = (e: unknown) =>
    setMessage({
      text:
        e instanceof ApiError && e.code === 'not_available'
          ? t('All four players must have marked this hour.')
          : e instanceof ApiError && e.code === 'invalid_time'
            ? t('Pick a whole hour inside the round window, at least 30 minutes ahead.')
            : e instanceof ApiError && e.code === 'invalid_hour'
              ? t('Hours must be inside the round window.')
              : t('Could not save. Try again.'),
      error: true,
    });
  const post = (path: string, body: unknown, ok: string) => {
    setMessage(null);
    api<MatchDetail>(`/cups/matches/${m.id}/${path}`, { method: path === 'availability' ? 'PUT' : 'POST', body }).then(() => setMessage({ text: ok, error: false }), failed);
  };
  const watch = () => {
    api<{ room: { spectateUrl: string | null } } | { spectateUrl: string | null }>(`/rooms/${m.roomId}`).then((r) => {
      const url = 'room' in r ? r.room.spectateUrl : r.spectateUrl;
      if (url) void navigate(`/spectate?src=${encodeURIComponent(url)}`);
      else setMessage({ text: t('The room is not on air yet.'), error: true });
    }, failed);
  };
  const otherProposed = d.myDuo && m.proposedAt && m.proposedBy && m.proposedBy !== (d.myDuo === 'a' ? m.duoA : m.duoB);
  const mineProposed = d.myDuo && m.proposedAt && m.proposedBy === (d.myDuo === 'a' ? m.duoA : m.duoB);
  const scheduling = d.myDuo !== null && (m.status === 'open' || m.status === 'scheduled');
  return (
    <Panel
      title={`${roundLabel(m.round, rounds, t)} · ${t('best of $1', String(m.bestOf))}`}
      actions={
        <Button variant="ghost" onClick={onClose}>
          {t('Close')}
        </Button>
      }
      className="outcup-detail"
    >
      <p className="outcup-vs">
        <span className="outcup-red">{names(d.duoA)}</span> <span className="ui-muted">×</span> <span className="outcup-blue">{names(d.duoB)}</span>
      </p>
      <p>
        <Badge tone={st.tone}>{st.text}</Badge>{' '}
        <span className="ui-muted">
          {t('Window: $1 to $2', when(m.windowStart, prefs.locale), when(new Date(Date.parse(m.windowEnd) - 60_000).toISOString(), prefs.locale))}
        </span>
      </p>
      {m.status === 'live' && m.roomId && (
        <p className="ui-row">
          {d.myDuo && (
            <Button variant="primary" onClick={() => void navigate(`/play?sala=${encodeURIComponent(m.roomId!)}`)}>
              {t('Join the room')}
            </Button>
          )}
          <Button onClick={watch}>{t('Watch')}</Button>
        </p>
      )}
      {m.status === 'scheduled' && d.myDuo && <p className="ui-muted">{t('The room opens 15 minutes before. A pair that is not complete 15 minutes after the start loses by walkover.')}</p>}
      {m.games.length > 0 && (
        <ol className="outcup-games">
          {m.games.map((g) => (
            <li key={g.id}>
              <Link to={`/matches/${g.id}`}>
                {t('Game $1', String(g.gameNo ?? ''))} · {g.map} · {g.redScore} × {g.blueScore}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {otherProposed && (
        <p className="ui-row">
          {t('The other pair proposed $1.', when(m.proposedAt!, prefs.locale))}
          <Button variant="primary" onClick={() => post('answer', { accept: true }, t('Match scheduled.'))}>
            {t('Accept')}
          </Button>
          <Button variant="ghost" onClick={() => post('answer', { accept: false }, t('Proposal declined.'))}>
            {t('Decline')}
          </Button>
        </p>
      )}
      {mineProposed && <p className="ui-muted">{t('Your pair proposed $1. Waiting for the other pair.', when(m.proposedAt!, prefs.locale))}</p>}
      {d.availability && (scheduling || m.status === 'pending') && (
        <AvailabilityGrid detail={d} t={t} locale={prefs.locale} onSave={(hours) => post('availability', { hours }, t('Hours saved.'))} onPropose={(at) => post('propose', { at }, t('Time proposed to the other pair.'))} canPropose={scheduling} />
      )}
      <FormMessageLine message={message} />
    </Panel>
  );
}

/** Grade de horas da janela (no fuso de quem vê): as minhas marcadas e quantos dos 4 podem em cada hora. */
function AvailabilityGrid({ detail, t, locale, onSave, onPropose, canPropose }: { detail: MatchDetail; t: T; locale: string; onSave: (hours: string[]) => void; onPropose: (at: string) => void; canPropose: boolean }) {
  const m = detail.match;
  const mineInitial = useMemo(() => new Set((detail.availability ?? []).find((a) => a.me)?.hours.map((h) => Date.parse(h)) ?? []), [detail]);
  const [mine, setMine] = useState<Set<number>>(mineInitial);
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const a of detail.availability ?? []) if (!a.me) for (const h of a.hours) c.set(Date.parse(h), (c.get(Date.parse(h)) ?? 0) + 1);
    return c;
  }, [detail]);
  const now = Date.now();
  const days = useMemo(() => {
    const out: { label: string; hours: number[] }[] = [];
    for (let h = Date.parse(m.windowStart); h < Date.parse(m.windowEnd); h += HOUR) {
      const label = new Date(h).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
      const last = out[out.length - 1];
      if (last && last.label === label) last.hours.push(h);
      else out.push({ label, hours: [h] });
    }
    return out;
  }, [m.windowStart, m.windowEnd, locale]);
  const toggle = (h: number) =>
    setMine((s) => {
      const n = new Set(s);
      if (n.has(h)) n.delete(h);
      else n.add(h);
      return n;
    });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="outcup-availability">
      <h3>{t('When can you play?')}</h3>
      <p className="ui-muted">{t('Click the hours you can play (your time zone: $1). The number shows how many of the other three can; a gold hour works for all four.', tz)}</p>
      <div className="outcup-grid-wrap">
        <table className="outcup-grid">
          <tbody>
            {days.map((dRow) => (
              <tr key={dRow.label}>
                <th scope="row">{dRow.label}</th>
                {dRow.hours.map((h) => {
                  const others = counts.get(h) ?? 0;
                  const on = mine.has(h);
                  const all = on && others === 3;
                  const hour = new Date(h).getHours();
                  return (
                    <td key={h}>
                      <button type="button" disabled={h < now} className={`${on ? 'is-on' : ''} ${all ? 'is-all' : ''}`} aria-pressed={on} title={`${new Date(h).toLocaleString(locale)} · ${t('$1 of the other 3', String(others))}`} onClick={() => toggle(h)}>
                        <span>{String(hour).padStart(2, '0')}</span>
                        {others > 0 && <small>{others}</small>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ui-row">
        <Button variant="primary" onClick={() => onSave([...mine].sort((a, b) => a - b).map((h) => new Date(h).toISOString()))}>
          {t('Save my hours')}
        </Button>
      </p>
      {canPropose && (
        <div>
          <h3>{t('Propose a time')}</h3>
          {detail.common.filter((h) => Date.parse(h) > now + 30 * 60_000).length === 0 ? (
            <p className="ui-muted">{t('No hour works for all four yet. Mark more hours or ask the others in the chat.')}</p>
          ) : (
            <p className="ui-row">
              {detail.common
                .filter((h) => Date.parse(h) > now + 30 * 60_000)
                .slice(0, 12)
                .map((h) => (
                  <Button key={h} onClick={() => onPropose(h)}>
                    {when(h, locale)}
                  </Button>
                ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Archive({ list, current, t, locale }: { list: CupSummary[]; current: string | null; t: T; locale: string }) {
  const past = list.filter((c) => c.edition !== current);
  if (past.length === 0) return null;
  return (
    <Panel title={t('Past editions')}>
      <ul className="outcup-archive">
        {past.map((c) => (
          <li key={c.edition}>
            <Link to={`/outcup/${c.edition}`}>{cupTitle(c.edition, locale)}</Link>
            <span className="ui-muted">
              {c.status === 'cancelled' ? t('Cancelled') : c.champion ? `${t('Champions')}: ${c.champion.join(' + ')}` : c.status === 'running' ? t('In progress') : t('$1 signed up', String(c.entrants))}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Selos de campeão e vice da OutCup no perfil (RN-CUP-13). */
export function CupTitleBadges({ name }: { readonly name: string }) {
  const { t, prefs } = usePrefs();
  const res = useApi<{ titles: { edition: string; position: number }[] }>(`/players/${encodeURIComponent(name)}/cup-titles`, true);
  const titles = res.data?.titles ?? [];
  if (titles.length === 0) return null;
  return (
    <>
      {titles.map((x) => (
        <Link key={x.edition} to={`/outcup/${x.edition}`}>
          <Badge tone={x.position === 1 ? 'accent' : 'neutral'}>
            {x.position === 1 ? t('OutCup champion') : t('OutCup runner-up')} · {cupTitle(x.edition, prefs.locale).replace('OutCup · ', '')}
          </Badge>
        </Link>
      ))}
    </>
  );
}

/** Destaque da OutCup na tela inicial (OG-523): inscrições abertas ou a fase em disputa, com a sala ao vivo. */
export function OutCupBanner() {
  const { t, prefs } = usePrefs();
  const res = useApi<Cup | null>('/cups/current', true, 'cup');
  const c = res.data;
  if (!c || (c.status !== 'registration' && c.status !== 'running')) return null;
  const now = Date.now();
  if (c.status === 'registration' && Date.parse(c.registrationOpensAt) > now) return null;
  const live = c.matches.filter((m) => m.status === 'live').length;
  const round = c.rounds ? c.matches.find((m) => now >= Date.parse(m.windowStart) && now < Date.parse(m.windowEnd)) : undefined;
  return (
    <Link className="outcup-banner" to={`/outcup/${c.edition}`}>
      <strong>{cupTitle(c.edition, prefs.locale)}</strong>
      <span>
        {c.status === 'registration'
          ? c.me?.entered
            ? t('You are signed up. Draw on $1.', when(c.drawAt, prefs.locale))
            : t('Sign-ups open until $1.', when(c.drawAt, prefs.locale))
          : live > 0
            ? t('$1 match(es) on air now.', String(live))
            : round
              ? roundLabel(round.round, c.rounds!, t)
              : t('In progress')}
      </span>
    </Link>
  );
}
