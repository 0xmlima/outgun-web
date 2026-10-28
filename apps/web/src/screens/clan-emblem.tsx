// SPDX-License-Identifier: GPL-2.0-or-later
// Editor do emblema do clã (OG-483, RN-EMB-01..03): moldura, símbolo, filete e inverter sobre as
// cores do clã (as do formulário, ainda sem salvar: o emblema muda junto e salva com elas), com
// prévia em vários tamanhos. Combinações que repetiriam o emblema de outro clã
// (RN-EMB-02) ficam desabilitadas.
import { useState } from 'react';
import { DEFAULT_EMBLEM, emblemFrameAllowed, EMBLEM_FRAMES, EMBLEM_FRAME_NAMES, EMBLEM_SYMBOLS, EMBLEM_SYMBOL_NAMES, emblemKey, type ClanEmblem } from '@outgun/protocol';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { Emblem, type EmblemClan } from '../ui/Emblem.js';
import { ToggleField } from '../ui/Field.js';
import { Form } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { useApi } from './stats.js';

interface Props {
  readonly clan: EmblemClan;
  /** Melhor posição do clã no hall de clãs (OG-488); null sem pódio. */
  readonly bestHall: number | null;
  readonly base: string;
  readonly tick: number;
  readonly onSave: (emblem: ClanEmblem | null) => void;
}

export function EmblemEditor({ clan, bestHall, base, tick, onSave }: Props) {
  const { t } = usePrefs();
  const [e, setE] = useState<ClanEmblem>(clan.emblem ?? DEFAULT_EMBLEM);
  const taken = new Set(useApi<{ taken: string[] }>(`${base}/emblem/taken?v=${tick}`).data?.taken ?? []);
  const isTaken = (x: ClanEmblem) => taken.has(emblemKey(x, clan.tag, clan.colors?.primary ?? null, clan.colors?.secondary ?? null));
  const busy = isTaken(e);
  const usedBy = t('Another clan already uses this emblem.');

  const group = <K extends 'frame' | 'symbol'>(key: K, values: readonly ClanEmblem[K][], names: Readonly<Record<ClanEmblem[K], string>>) => (
    <div className="ui-field">
      <span className="ui-field-label">{key === 'frame' ? t('Frame') : t('Symbol')}</span>
      <div className="emblem-options" role="radiogroup" aria-label={key === 'frame' ? t('Frame') : t('Symbol')}>
        {values.map((v) => {
          const option = { ...e, [key]: v };
          const locked = key === 'frame' && !emblemFrameAllowed(v as ClanEmblem['frame'], bestHall);
          const off = locked || isTaken(option);
          const name = t(names[v]);
          const why = locked ? t('Win a podium in the clan hall of fame.') : usedBy;
          return (
            <button key={v} type="button" role="radio" aria-checked={e[key] === v} disabled={off} title={off ? `${name}: ${why}` : name} aria-label={name} className={e[key] === v ? 'emblem-option selected' : 'emblem-option'} onClick={() => setE(option)}>
              <Emblem clan={clan} emblem={option} size={40} />
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Panel title={t('Clan emblem')}>
      <Form
        label={t('Clan emblem')}
        onSubmit={() => onSave(e)}
        actions={
          <>
            <Button type="submit" variant="primary" disabled={busy}>
              {t('Save emblem')}
            </Button>
            <Button variant="ghost" onClick={() => onSave(null)}>
              {t('Back to default')}
            </Button>
          </>
        }
      >
        <div className="emblem-preview">
          <Emblem clan={clan} emblem={e} size={128} title={t('Clan emblem')} />
          {(['dark', 'light'] as const).map((bg) => (
            <div key={bg} className={`emblem-sizes ${bg}`} aria-hidden="true">
              {[16, 32, 64].map((s) => (
                <Emblem key={s} clan={clan} emblem={e} size={s} />
              ))}
            </div>
          ))}
        </div>
        {busy && <p className="ui-field-error">{usedBy}</p>}
        {!clan.colors && <p className="ui-muted">{t('The emblem uses the clan colors. Without them it stays silver and black.')}</p>}
        {group('frame', EMBLEM_FRAMES, EMBLEM_FRAME_NAMES)}
        {group('symbol', EMBLEM_SYMBOLS, EMBLEM_SYMBOL_NAMES)}
        <ToggleField label={t('Fillet')} checked={e.fillet} onChange={(fillet) => setE({ ...e, fillet })} hint={t('An inner line in the symbol color.')} />
        <ToggleField label={t('Swap colors')} checked={e.inverted} onChange={(inverted) => setE({ ...e, inverted })} hint={t('Secondary color in the background, primary in the symbol.')} />
      </Form>
    </Panel>
  );
}
