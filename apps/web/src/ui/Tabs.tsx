// SPDX-License-Identifier: GPL-2.0-or-later
// Abas do design system v2 (OG-200), no padrão WAI-ARIA: ←/→ trocam de aba (ativação automática),
// Home/End vão às pontas e Tab entra no conteúdo.
import { useId, useRef, type ReactNode } from 'react';
import { rovingKey } from './keys.js';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

interface TabsProps<T extends string> {
  readonly label: string;
  readonly tabs: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** Conteúdo da aba atual. */
  readonly children?: ReactNode;
}

export function Tabs<T extends string>({ label, tabs, value, onChange, children }: TabsProps<T>) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = tabs.findIndex((t) => t.id === value);
  return (
    <div className="ui-tabs">
      <div
        className="ui-tablist"
        role="tablist"
        aria-label={label}
        onKeyDown={(ev) => {
          const next = rovingKey(tabs, current, ev.key, 'horizontal');
          if (next === null) return;
          ev.preventDefault();
          refs.current[next]?.focus();
          onChange(tabs[next]!.id);
        }}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="ui-tab"
            aria-selected={index === current}
            aria-controls={`${base}-panel`}
            tabIndex={index === current ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children !== undefined && (
        <div id={`${base}-panel`} role="tabpanel" className="ui-tabpanel" aria-labelledby={`${base}-tab-${value}`}>
          {children}
        </div>
      )}
    </div>
  );
}
