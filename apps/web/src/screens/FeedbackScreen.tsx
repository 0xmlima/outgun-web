// SPDX-License-Identifier: GPL-2.0-or-later
// Feedback do beta (OG-106): tipo, nota de fidelidade ao Outgun original (o critério do lançamento),
// nota geral, se jogou o original e texto livre. O contexto (sala, mapa, versão, tela) vai junto.
// O tipo bug é o modelo de issue do GitHub (OG-429), para quem não tem conta lá.
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAccount } from '../app/account.js';
import { api, ApiError } from '../app/api.js';
import { areaLabels, autoContext, BUG_AREAS, EMPTY_BUG, frequencyLabels, severityLabels, type BugReport } from '../app/bug-report.js';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { ChoiceField, TextAreaField, TextField, ToggleField } from '../ui/Field.js';
import { Form, FormMessageLine, Page, type FormMessage } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';

type Kind = 'bug' | 'suggestion' | 'praise' | 'other';

export default function FeedbackScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAccount();
  const [kind, setKind] = useState<Kind>(params.get('tipo') === 'bug' ? 'bug' : 'praise');
  const [fidelity, setFidelity] = useState(0);
  const [overall, setOverall] = useState(0);
  const [veteran, setVeteran] = useState(false);
  const [text, setText] = useState('');
  const [bug, setBug] = useState<BugReport>(EMPTY_BUG);
  const [status, setStatus] = useState<FormMessage>(null);
  const [sent, setSent] = useState(false);
  if (user === null) return <Navigate to="/login" replace />;
  const isBug = kind === 'bug';
  const set = <K extends keyof BugReport>(key: K) => (value: BugReport[K]) => setBug((b) => ({ ...b, [key]: value }));

  const submit = () => {
    if (isBug && (!bug.summary.trim() || !bug.actual.trim())) {
      setStatus({ text: t('Fill in the summary and what happened.'), error: true });
      return;
    }
    const context: Record<string, string | number> = {
      ...(params.get('sala') ? { room: params.get('sala')! } : {}),
      ...(params.get('mapa') ? { map: params.get('mapa')! } : {}),
      ...autoContext(),
      screen: `${screen.width}x${screen.height}`,
    };
    const body = isBug ? { kind, text: '', context, bug } : { kind, ...(fidelity ? { fidelity } : {}), ...(overall ? { overall } : {}), veteran, text, context };
    api('/feedback', { body }).then(
      () => {
        setSent(true);
        setStatus({ text: t('Thank you! Your feedback was sent.'), error: false });
      },
      (e: unknown) =>
        setStatus({
          text: e instanceof ApiError && e.code === 'empty_feedback' ? t('Give a rating or write something.') : e instanceof ApiError && e.code === 'bug_incomplete' ? t('Fill in the summary and what happened.') : e instanceof ApiError ? e.message : String(e),
          error: true,
        }),
    );
  };

  const ratings = [
    { value: '0', label: '—' },
    ...['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n })),
  ];
  const stars = (value: number, set: (n: number) => void, label: string) => (
    <ChoiceField label={label} value={String(value)} options={ratings} onChange={(v) => set(Number(v))} />
  );
  const areas = areaLabels(t);
  const frequencies = frequencyLabels(t);
  const severities = severityLabels(t);

  return (
    <Page title={t('Send feedback')} onBack={() => void navigate(-1)} width="narrow">
      <Form
        label={t('Send feedback')}
        onSubmit={submit}
        actions={
          <Button type="submit" variant="primary" disabled={sent}>
            {t('Send')}
          </Button>
        }
      >
        <ChoiceField
          label={t('Type')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'praise', label: t('Praise') },
            { value: 'bug', label: t('Bug') },
            { value: 'suggestion', label: t('Suggestion') },
            { value: 'other', label: t('Other') },
          ]}
        />
        {isBug ? (
          <>
            <ChoiceField label={t('Where did it happen?')} value={bug.area} onChange={set('area')} options={BUG_AREAS.map((a) => ({ value: a, label: areas[a] }))} />
            <TextField label={t('Summary (what is wrong, in one sentence)')} value={bug.summary} maxLength={200} onChange={set('summary')} />
            <TextAreaField label={t('Steps to reproduce')} hint={t('One step per line.')} value={bug.steps} rows={4} maxLength={2000} onChange={set('steps')} />
            <TextAreaField label={t('What I expected')} value={bug.expected} rows={2} maxLength={1000} onChange={set('expected')} />
            <TextAreaField label={t('What happened')} value={bug.actual} rows={3} maxLength={2000} onChange={set('actual')} />
            <ChoiceField label={t('How often?')} value={bug.frequency} onChange={set('frequency')} options={(['always', 'sometimes', 'once'] as const).map((f) => ({ value: f, label: frequencies[f] }))} />
            <ChoiceField label={t('Severity')} value={bug.severity} onChange={set('severity')} options={(['critical', 'high', 'medium', 'low'] as const).map((s) => ({ value: s, label: severities[s] }))} />
            <TextAreaField
              label={t('Evidence (links to the match, screenshots, videos)')}
              hint={t('Your last match, the game version, your browser and the time go along automatically.')}
              value={bug.evidence}
              rows={2}
              maxLength={1000}
              onChange={set('evidence')}
            />
            <TextAreaField label={t('Known workaround')} value={bug.workaround} rows={2} maxLength={1000} onChange={set('workaround')} />
          </>
        ) : (
          <>
            {stars(fidelity, setFidelity, t('Does it feel like the original Outgun? (1 = not at all, 5 = just like it)'))}
            {stars(overall, setOverall, t('Overall rating'))}
            <ToggleField label={t('I played the original Outgun')} checked={veteran} onChange={setVeteran} />
            <TextAreaField label={t('Tell us more (what happened, where, how to reproduce)')} value={text} rows={8} maxLength={4000} onChange={setText} />
          </>
        )}
      </Form>
      <FormMessageLine message={status} />
      <MyReports refresh={sent} />
    </Page>
  );
}

interface MyReport {
  id: number;
  kind: Kind;
  summary: string;
  status: 'new' | 'confirmed' | 'critical' | 'resolved' | 'dismissed';
  issue: { number: number; url: string; state: 'open' | 'closed' | 'not_planned' | null; fixedIn: string | null } | null;
  createdAt: string;
}

/** "Seus relatos" (OG-431): a situação de cada relato e, quando virou issue, o link e a versão da correção. */
function MyReports({ refresh }: { readonly refresh: boolean }) {
  const { t } = usePrefs();
  const [reports, setReports] = useState<MyReport[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ reports: MyReport[] }>('/feedback/mine').then(
      (r) => alive && setReports(r.reports),
      () => alive && setReports([]),
    );
    return () => {
      alive = false;
    };
  }, [refresh]);
  if (!reports?.length) return null;
  const situation = (r: MyReport): string => {
    if (r.issue?.state === 'closed') return r.issue.fixedIn ? t('Fixed in $1', r.issue.fixedIn) : t('Fixed');
    if (r.issue?.state === 'not_planned' || r.status === 'dismissed') return t('Will not be fixed');
    if (r.status === 'resolved') return t('Resolved');
    if (r.issue) return t('In the fix queue');
    return r.status === 'new' ? t('Received') : t('Confirmed');
  };
  return (
    <Panel title={t('Your reports')}>
      <ul className="feedback-mine">
        {reports.map((r) => (
          <li key={r.id}>
            <span className="feedback-mine-date">{new Date(r.createdAt).toLocaleDateString()}</span>
            <span className="feedback-mine-summary">{r.summary || '—'}</span>
            <span className="feedback-mine-status">
              {situation(r)}
              {r.issue && (
                <>
                  {' · '}
                  <a href={r.issue.url} target="_blank" rel="noreferrer">
                    #{r.issue.number}
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
