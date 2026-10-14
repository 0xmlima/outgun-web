// SPDX-License-Identifier: GPL-2.0-or-later
// Feedback do beta (OG-106): tipo, nota de fidelidade ao Outgun original (o critério do lançamento),
// nota geral, se jogou o original e texto livre. O contexto (sala, mapa, versão, tela) vai junto.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAccount } from '../app/account.js';
import { api, ApiError } from '../app/api.js';
import { usePrefs } from '../app/prefs.js';
import { TextPage } from '../ui/TextPage.js';

type Kind = 'bug' | 'suggestion' | 'praise' | 'other';

export default function FeedbackScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAccount();
  const [kind, setKind] = useState<Kind>('praise');
  const [fidelity, setFidelity] = useState(0);
  const [overall, setOverall] = useState(0);
  const [veteran, setVeteran] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [sent, setSent] = useState(false);
  if (user === null) return <Navigate to="/login" replace />;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const context: Record<string, string | number> = {
      ...(params.get('sala') ? { room: params.get('sala')! } : {}),
      ...(params.get('mapa') ? { map: params.get('mapa')! } : {}),
      version: import.meta.env.VITE_RELEASE ?? 'dev',
      screen: `${screen.width}x${screen.height}`,
    };
    api('/feedback', { body: { kind, ...(fidelity ? { fidelity } : {}), ...(overall ? { overall } : {}), veteran, text, context } }).then(
      () => {
        setSent(true);
        setStatus({ text: t('Thank you! Your feedback was sent.'), error: false });
      },
      (e: unknown) => setStatus({ text: e instanceof ApiError && e.code === 'empty_feedback' ? t('Give a rating or write something.') : e instanceof ApiError ? e.message : String(e), error: true }),
    );
  };

  const stars = (value: number, set: (n: number) => void, label: string) => (
    <fieldset className="feedback-rating">
      <legend>{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n}>
          <input type="radio" name={label} checked={value === n} onChange={() => set(n)} /> {n}
        </label>
      ))}
    </fieldset>
  );

  return (
    <TextPage caption={t('Send feedback')} onBack={() => void navigate(-1)}>
      <form className="admin admin-form feedback" onSubmit={submit}>
        <label>
          {t('Type')}{' '}
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="praise">{t('Praise')}</option>
            <option value="bug">{t('Bug')}</option>
            <option value="suggestion">{t('Suggestion')}</option>
            <option value="other">{t('Other')}</option>
          </select>
        </label>
        {stars(fidelity, setFidelity, t('Does it feel like the original Outgun? (1 = not at all, 5 = just like it)'))}
        {stars(overall, setOverall, t('Overall rating'))}
        <label>
          <input type="checkbox" checked={veteran} onChange={(e) => setVeteran(e.target.checked)} /> {t('I played the original Outgun')}
        </label>
        <label className="admin-block">
          {t('Tell us more (what happened, where, how to reproduce)')}
          <textarea value={text} rows={8} maxLength={4000} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" disabled={sent}>
          {t('Send')}
        </button>
        {status && (
          <p className={`stats-note${status.error ? ' error' : ''}`} role={status.error ? 'alert' : 'status'}>
            {status.text}
          </p>
        )}
      </form>
    </TextPage>
  );
}
