// SPDX-License-Identifier: GPL-2.0-or-later
// Aba OutCup do painel (OG-526, RN-CUP-11): abrir edição fora de época, cancelar, mudar datas antes
// do sorteio e, nos confrontos, dar resultado, remarcar, trocar jogador e desfazer W.O. Toda ação
// pede o motivo e vai para a auditoria.
import { useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { TextField } from '../ui/Field.js';
import { FormMessageLine, type FormMessage } from '../ui/Page.js';
import { cupTitle, roundLabel, type Cup, type CupMatch } from './outcup.js';
import { useApi } from './stats.js';

/** `datetime-local` (hora de quem usa o painel) ⇄ ISO. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => new Date(v).toISOString();

export function CupTab() {
  const { t, prefs } = usePrefs();
  const list = useApi<{ cups: { edition: string; status: string }[] }>('/cups', true, 'cup');
  const [edition, setEdition] = useState('');
  const shown = edition || list.data?.cups[0]?.edition || '';
  const cup = useApi<Cup>(shown ? `/cups/${shown}` : '', true, 'cup');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<FormMessage>(null);
  const [newEdition, setNewEdition] = useState('');
  const c = cup.data;
  const run = (path: string, method: string, body: Record<string, unknown>, ok: string) => {
    if (!reason.trim()) return setMessage({ text: t('Write the reason first (it goes to the audit log).'), error: true });
    setMessage(null);
    api(path, { method, body: { ...body, reason: reason.trim() } }).then(
      () => setMessage({ text: ok, error: false }),
      (e: unknown) => setMessage({ text: e instanceof ApiError ? e.message : t('Could not save. Try again.'), error: true }),
    );
  };
  const attention = (c?.matches ?? []).filter((m) => m.duoA && m.duoB && ['open', 'scheduled', 'live', 'dispute'].includes(m.status));
  const closed = (c?.matches ?? []).filter((m) => m.duoA && m.duoB && ['walkover', 'double_walkover', 'done'].includes(m.status) && m.resolution !== 'series' && m.resolution !== 'tiebreak');
  const name = (id: string | null) => c?.duos.find((d) => d.id === id)?.players.join(' + ') ?? '—';
  return (
    <section className="admin-tab">
      <div className="admin-summary">
        <span className="admin-muted">{t('Every action needs a reason and goes to the audit log.')}</span>
      </div>
      <div className="ui-row">
        <label>
          {t('Edition')}{' '}
          <select value={shown} onChange={(e) => setEdition(e.target.value)}>
            {(list.data?.cups ?? []).map((x) => (
              <option key={x.edition} value={x.edition}>
                {cupTitle(x.edition, prefs.locale)} ({x.status})
              </option>
            ))}
          </select>
        </label>
        {shown && <Link to={`/outcup/${shown}`}>{t('Open the cup page')}</Link>}
      </div>
      <TextField label={t('Reason')} value={reason} onChange={setReason} maxLength={500} />
      <FormMessageLine message={message} />
      <div className="ui-row">
        <TextField label={t('Open an edition now (YYYY-MM)')} value={newEdition} onChange={setNewEdition} maxLength={7} placeholder="2026-12" />
        <Button disabled={!/^\d{4}-\d{2}$/.test(newEdition)} onClick={() => run('/admin/cups', 'POST', { edition: newEdition }, t('Edition opened.'))}>
          {t('Open')}
        </Button>
      </div>
      {c && (
        <>
          <h3>
            {cupTitle(c.edition, prefs.locale)} <Badge>{c.status}</Badge>
          </h3>
          {c.status === 'registration' && <DatesForm cup={c} onSave={(dates) => run(`/admin/cups/${c.edition}`, 'PUT', dates, t('Dates saved.'))} />}
          {(c.status === 'registration' || c.status === 'running') && (
            <Button variant="danger" onClick={() => run(`/admin/cups/${c.edition}/cancel`, 'POST', {}, t('Edition cancelled.'))}>
              {t('Cancel this edition')}
            </Button>
          )}
          {attention.length > 0 && <h4>{t('Matches in progress')}</h4>}
          {attention.map((m) => (
            <MatchTools key={m.id} m={m} rounds={c.rounds ?? 1} names={[name(m.duoA), name(m.duoB)]} run={run} />
          ))}
          {closed.length > 0 && <h4>{t('Walkovers and admin results')}</h4>}
          {closed.map((m) => (
            <p key={m.id} className="ui-row">
              {roundLabel(m.round, c.rounds ?? 1, t)}: {name(m.duoA)} × {name(m.duoB)} · <Badge tone="danger">{m.status}</Badge>
              <Button variant="ghost" onClick={() => run(`/admin/cups/matches/${m.id}/reopen`, 'POST', {}, t('Result undone.'))}>
                {t('Undo')}
              </Button>
            </p>
          ))}
        </>
      )}
    </section>
  );
}

function DatesForm({ cup, onSave }: { cup: Cup; onSave: (dates: Record<string, string>) => void }) {
  const { t } = usePrefs();
  const [draw, setDraw] = useState(toLocalInput(cup.drawAt));
  const [start, setStart] = useState(toLocalInput(cup.startsAt));
  const [end, setEnd] = useState(toLocalInput(cup.endsAt));
  return (
    <div className="ui-row">
      <TextField label={t('Draw date')} type="datetime-local" value={draw} onChange={setDraw} />
      <TextField label={t('Start')} type="datetime-local" value={start} onChange={setStart} />
      <TextField label={t('End')} type="datetime-local" value={end} onChange={setEnd} />
      <Button onClick={() => onSave({ drawAt: fromLocalInput(draw), startsAt: fromLocalInput(start), endsAt: fromLocalInput(end) })}>{t('Save dates')}</Button>
    </div>
  );
}

function MatchTools({ m, rounds, names, run }: { m: CupMatch; rounds: number; names: [string, string]; run: (path: string, method: string, body: Record<string, unknown>, ok: string) => void }) {
  const { t } = usePrefs();
  const [at, setAt] = useState(m.scheduledAt ? toLocalInput(m.scheduledAt) : '');
  const [windowEnd, setWindowEnd] = useState(toLocalInput(m.windowEnd));
  const [out, setOut] = useState('');
  const [incoming, setIncoming] = useState('');
  const base = `/admin/cups/matches/${m.id}`;
  return (
    <div className="admin-card">
      <p>
        <strong>{roundLabel(m.round, rounds, t)}</strong>: {names[0]} × {names[1]} · <Badge tone={m.status === 'dispute' ? 'warning' : 'neutral'}>{m.status}</Badge>
      </p>
      <p className="ui-row">
        <Button onClick={() => run(`${base}/result`, 'POST', { winner: 'a' }, t('Result saved.'))}>{t('$1 wins', names[0])}</Button>
        <Button onClick={() => run(`${base}/result`, 'POST', { winner: 'b' }, t('Result saved.'))}>{t('$1 wins', names[1])}</Button>
        <Button variant="danger" onClick={() => run(`${base}/result`, 'POST', { winner: null }, t('Result saved.'))}>
          {t('Both out')}
        </Button>
      </p>
      <div className="ui-row">
        <TextField label={t('New time')} type="datetime-local" value={at} onChange={setAt} />
        <TextField label={t('Window ends')} type="datetime-local" value={windowEnd} onChange={setWindowEnd} />
        <Button onClick={() => run(`${base}/reschedule`, 'POST', { at: at ? fromLocalInput(at) : null, windowEnd: fromLocalInput(windowEnd) }, t('Match rescheduled.'))}>
          {at ? t('Reschedule') : t('Reopen for the pairs')}
        </Button>
      </div>
      <div className="ui-row">
        <TextField label={t('Player out')} value={out} onChange={setOut} maxLength={40} />
        <TextField label={t('Player in')} value={incoming} onChange={setIncoming} maxLength={40} />
        <Button disabled={!out || !incoming} onClick={() => run(`${base}/replace`, 'POST', { out, in: incoming }, t('Player replaced.'))}>
          {t('Replace')}
        </Button>
      </div>
    </div>
  );
}
