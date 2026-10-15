// SPDX-License-Identifier: GPL-2.0-or-later
// Opções → Controles: esquema de teclas e remapeamento de cada ação (OG-063, plan/specs/entrada.md).
// Aba da página de opções no design system v2 (OG-202): cada ação mostra as teclas atuais; "Adicionar
// tecla" espera a próxima tecla e Delete (ou "Padrão") volta a ação ao esquema.
import { useEffect, useState } from 'react';
import { usePrefs } from '../app/prefs.js';
import {
  ACTION_LABELS,
  ACTIONS,
  chordLabel,
  chordOf,
  CLASSIC_BINDINGS,
  rebind,
  SCHEMES,
  serializeBindings,
  type Action,
  type Scheme,
} from '../game/input/bindings.js';
import { altName, reservedChord } from '../game/input/shortcuts.js';
import { Button } from '../ui/Button.js';
import { ChoiceField, FieldGroup } from '../ui/Field.js';
import { Panel } from '../ui/Panel.js';

const SCHEME_LABELS: Record<Scheme, string> = { classic: 'Classic', browser: 'Browser (no Ctrl/Alt)' };

export function ControlsPanel() {
  const { t, prefs, setPrefs } = usePrefs();
  const [capturing, setCapturing] = useState<Action | null>(null);
  /** Último acorde associado que o navegador ou o sistema tomam (OG-232). */
  const [reserved, setReserved] = useState<string | null>(null);
  const bindings = prefs.bindings;

  // Captura a próxima tecla (com modificadores) para a ação escolhida.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key !== 'Escape') {
        // modificadores sozinhos só valem ao serem soltos sem outra tecla: espera o keyup
        if (/^(Control|Alt|Shift|Meta)/.test(ev.code)) return;
        const chord = chordOf(ev);
        setPrefs({ bindings: rebind(bindings, capturing, chord) });
        setReserved(reservedChord(chord) ? chordLabel(chord, altName()) : null);
      }
      setCapturing(null);
    };
    const onUp = (ev: KeyboardEvent) => {
      if (!/^(Control|Alt|Shift)/.test(ev.code)) return;
      ev.preventDefault();
      setPrefs({ bindings: rebind(bindings, capturing, { code: ev.code }) });
      setReserved(null);
      setCapturing(null);
    };
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onUp, true);
    return () => {
      removeEventListener('keydown', onKey, true);
      removeEventListener('keyup', onUp, true);
    };
  }, [capturing, bindings, setPrefs]);

  const current = serializeBindings(bindings);
  const scheme = (Object.keys(SCHEMES) as Scheme[]).find((s) => serializeBindings(SCHEMES[s]) === current);
  const schemes = Object.keys(SCHEMES) as Scheme[];
  const restore = (action: Action) => setPrefs({ bindings: { ...bindings, [action]: (SCHEMES[scheme ?? 'classic'] ?? CLASSIC_BINDINGS)[action] } });

  return (
    <Panel title={t('Controls')} actions={<Button onClick={() => setPrefs({ bindings: CLASSIC_BINDINGS })}>{t('Restore defaults')}</Button>}>
      <p className="ui-muted" role="status">
        {capturing ? t('Press a key for $1 (Esc cancels)', t(ACTION_LABELS[capturing])) : t('Enter adds a key, Delete restores the default.')}
      </p>
      {reserved && !capturing && (
        <p className="ui-form-message error" role="alert">
          {t('$1 may be taken by the browser or the system. Pick another key or play in focus mode (F10).', reserved)}
        </p>
      )}
      <p className="ui-muted">{t('Focus mode (F10) plays in full screen and, in Chrome and Edge, keeps browser shortcuts such as Ctrl+W or Cmd+1 inside the game. System shortcuts (Alt+Tab, Cmd+Tab) always leave the game.')}</p>
      <FieldGroup>
        <ChoiceField
          label={t('Control scheme')}
          value={scheme ?? 'custom'}
          options={[...schemes.map((s) => ({ value: s, label: t(SCHEME_LABELS[s]) })), ...(scheme ? [] : [{ value: 'custom', label: t('Custom') }])]}
          onChange={(next) => next !== 'custom' && setPrefs({ bindings: SCHEMES[next as Scheme] })}
        />
        <ul className="controls-list">
          {ACTIONS.map((action) => (
            <li key={action} className={capturing === action ? 'controls-row capturing' : 'controls-row'}>
              <span className="controls-action">{t(ACTION_LABELS[action])}</span>
              <span className="controls-keys">
                {bindings[action].length === 0 ? <span className="ui-muted">—</span> : bindings[action].map((chord, i) => (
                      <kbd key={i} className={reservedChord(chord) ? 'reserved' : undefined} title={reservedChord(chord) ? t('May be taken by the browser or the system') : undefined}>
                        {chordLabel(chord, altName())}
                      </kbd>
                    ))}
              </span>
              <span className="controls-buttons">
                <Button
                  data-ui-control=""
                  aria-label={`${t(ACTION_LABELS[action])}: ${t('Add key')}`}
                  onClick={() => setCapturing(action)}
                  onKeyDown={(ev) => {
                    if (ev.key !== 'Delete') return;
                    ev.preventDefault();
                    restore(action);
                  }}
                >
                  {capturing === action ? t('Press a key...') : t('Add key')}
                </Button>
                <Button variant="ghost" onClick={() => restore(action)}>
                  {t('Default')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </FieldGroup>
    </Panel>
  );
}
