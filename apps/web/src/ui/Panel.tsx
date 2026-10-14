// SPDX-License-Identifier: GPL-2.0-or-later
// Painel do design system v2 (OG-200): superfície com título opcional e ações no cabeçalho.
import { useId, type ReactNode } from 'react';

interface PanelProps {
  readonly title?: ReactNode;
  /** Botões à direita do título. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Panel({ title, actions, children, className }: PanelProps) {
  const id = useId();
  return (
    <section className={className ? `ui-panel ${className}` : 'ui-panel'} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <header className="ui-panel-header">
          {title && (
            <h2 id={id} className="ui-panel-title">
              {title}
            </h2>
          )}
          {actions && <div className="ui-panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
