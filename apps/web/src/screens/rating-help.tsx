// SPDX-License-Identifier: GPL-2.0-or-later
// Explicação do rating (OG-342, reescrita no OG-351 para o OpenSkill, D-65/RN-SKL): botão "i" ao lado
// do rating que abre o que é o rating de habilidade, como ele muda e o que conta.
import { useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { Dialog, InfoButton } from '../ui/Dialog.js';

/** Regras mostradas no "i" (chaves em inglês, traduzidas em `@outgun/i18n`). */
export const RATING_RULES = [
  'Everyone starts at 0. The first matches move the rating fast; with fewer than 10 Ranked matches you are still calibrating.',
  'One rating for all formats (3x3, 4x4, 5x5), kept for good: it does not restart each month and does not drop if you stop playing.',
  'Only the result counts (win, loss or draw), not the score margin.',
  'Everyone who started the match gets the team result, even if they left. Substitute bots have no rating.',
  'Only Ranked counts. Casual matches and cancelled matches do not change your rating.',
  'The monthly competition is the leaderboard, with a ranking for each individual stat.',
] as const;

/** "i" que abre a explicação do rating de habilidade. */
export function RatingInfo() {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
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
        <p>{t('Your rating measures your skill from the results of your Ranked matches, using OpenSkill (Plackett-Luce model).')}</p>
        <p className="rating-help-formula">
          <strong>rating = (mu - 3 x sigma) x 100</strong>
        </p>
        <ul className="rating-help-rules">
          <li>
            <strong>mu</strong>: {t('your estimated skill. It goes up when your team wins and down when it loses.')}
          </li>
          <li>
            <strong>sigma</strong>: {t('how sure the system is about you. It starts high and shrinks with each match.')}
          </li>
        </ul>
        <p>{t('Beating a stronger team earns a lot; losing to a stronger team costs little. The bigger the surprise, the bigger the change.')}</p>
        <p className="ui-muted">{t('Example: in a 3x3 where the other team was the favourite (86%), beating them gave +77; losing to them would have cost -20.')}</p>
        <ul className="rating-help-rules">
          {RATING_RULES.map((rule) => (
            <li key={rule}>{t(rule)}</li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
