// SPDX-License-Identifier: GPL-2.0-or-later
// Explicação do rating (OG-342): botão "i" ao lado do rating que abre a fórmula, os pontos de cada
// evento (lidos da simulação, não ficam desatualizados), o modificador do time e as regras.
import { FRAG_POINTS, NEG_POINTS } from '@outgun/sim';
import { useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { Dialog, InfoButton } from '../ui/Dialog.js';

type Translate = (text: string, ...args: string[]) => string;

const FRAG_LABELS: Record<keyof typeof FRAG_POINTS, string> = {
  kill: 'Killing an enemy',
  carrierDefense: 'Killing near a teammate who carries a flag (carrier defense)',
  flagDefense: 'Killing near a flag on the ground (flag defense)',
  carrierKill: 'Killing the enemy flag carrier (extra)',
  flagTake: 'Taking the enemy flag',
  flagDropOnPurpose: 'Dropping the flag on purpose',
  capture: 'Capturing the flag',
  assist: 'Assisting the capture',
  teamCapture: 'Your team captures (each player)',
  teamKill: 'Killing a teammate',
  teamCarrierKill: 'Killing a teammate who carries the flag (extra)',
  suicide: 'Suicide',
};

const NEG_LABELS: Record<keyof typeof NEG_POINTS, string> = {
  death: 'Dying',
  deathWithFlag: 'Dying with the flag (extra)',
  enemyCapture: 'The enemy team captures (each player)',
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Linhas da tabela de eventos: [texto, pontos], primeiro os do score e depois os do neg. */
export function ratingEvents(t: Translate): { score: [string, string][]; neg: [string, string][] } {
  return {
    score: (Object.keys(FRAG_POINTS) as (keyof typeof FRAG_POINTS)[]).map((k) => [t(FRAG_LABELS[k]), signed(FRAG_POINTS[k])]),
    neg: (Object.keys(NEG_POINTS) as (keyof typeof NEG_POINTS)[]).map((k) => [t(NEG_LABELS[k]), signed(NEG_POINTS[k])]),
  };
}

function EventTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="ui-table rating-help-table">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([label, points]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="end">{points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "i" que abre a explicação do rating. */
export function RatingInfo() {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const events = ratingEvents(t);
  return (
    <>
      <InfoButton label={t('How the rating works')} onClick={() => setOpen(true)} />
      <Dialog
        open={open}
        title={t('How the rating works')}
        onClose={() => setOpen(false)}
        closeLabel={t('Close')}
        actions={
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t('Close')}
          </Button>
        }
      >
        <p className="rating-help-formula">
          <strong>rating = (score + 1) / (neg + 1)</strong>
        </p>
        <p>{t('Score goes up with what you do for your team; neg goes up when you die and when the enemy captures. The higher the rating, the better.')}</p>
        <p className="ui-muted">{t('Example: 300 score and 149 neg give (300 + 1) / (149 + 1) = 2.01.')}</p>
        <EventTable caption={t('Score (multiplied by the team modifier)')} rows={events.score} />
        <EventTable caption={t('Neg (no modifier)')} rows={events.neg} />
        <p>
          <strong>{t('Team modifier')}:</strong>{' '}
          {t("score points are multiplied by the enemy team's strength divided by your team's, between 1/3 and 3: the weaker team earns more and the stronger earns less. A player's strength is their season rating, or 1.0 below 100 score; a team's is the sum of its players.")}
        </p>
        <ul className="rating-help-rules">
          <li>{t('You appear in the ranking from 100 score in the season. Ties are broken by score.')}</li>
          <li>{t('Each format (3x3, 4x4, 5x5) has its own rating; the general one adds up the score and neg of all three.')}</li>
          <li>{t('Seasons are monthly and restart on the 1st at 00:00 (Brasília). The all-time ranking adds up every season.')}</li>
          <li>{t('Points are counted in whole numbers at the end of each match: fractions from the modifier are dropped.')}</li>
          <li>{t('Only Ranked counts. Casual matches and cancelled matches do not change your rating.')}</li>
        </ul>
      </Dialog>
    </>
  );
}
