// SPDX-License-Identifier: GPL-2.0-or-later
// Opções → Controles: esquema de teclas e remapeamento de cada ação (OG-063, plan/specs/entrada.md).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
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
import { BitmapText } from '../ui/BitmapText.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

const SCHEME_LABELS: Record<Scheme, string> = { classic: 'Classic', browser: 'Browser (no Ctrl/Alt)' };

export function ControlsScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const navigate = useNavigate();
  const [capturing, setCapturing] = useState<Action | null>(null);
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
        setPrefs({ bindings: rebind(bindings, capturing, chordOf(ev)) });
      }
      setCapturing(null);
    };
    const onUp = (ev: KeyboardEvent) => {
      if (!/^(Control|Alt|Shift)/.test(ev.code)) return;
      ev.preventDefault();
      setPrefs({ bindings: rebind(bindings, capturing, { code: ev.code }) });
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

  const items: MenuItem[] = [
    {
      kind: 'choice',
      label: t('Control scheme'),
      value: scheme ? t(SCHEME_LABELS[scheme]) : t('Custom'),
      onChange: (delta) => {
        const i = scheme ? schemes.indexOf(scheme) : -1;
        setPrefs({ bindings: SCHEMES[schemes[(i + delta + schemes.length) % schemes.length]!] });
      },
    },
    ...ACTIONS.map(
      (action): MenuItem => ({
        kind: 'action',
        label: t(ACTION_LABELS[action]),
        note: bindings[action].slice(0, 3).map(chordLabel).join(', ') || '-',
        onActivate: () => setCapturing(action),
        onDelete: () => setPrefs({ bindings: { ...bindings, [action]: (SCHEMES[scheme ?? 'classic'] ?? CLASSIC_BINDINGS)[action] } }),
      }),
    ),
    { kind: 'action', label: t('Restore defaults'), onActivate: () => setPrefs({ bindings: CLASSIC_BINDINGS }) },
  ];

  return (
    <Menu caption={t('Controls')} items={items} onBack={() => !capturing && void navigate('/options')}>
      <p className="menu-help">
        <BitmapText text={capturing ? t('Press a key for $1 (Esc cancels)', t(ACTION_LABELS[capturing])) : t('Enter adds a key, Delete restores the default.')} />
      </p>
    </Menu>
  );
}
