// SPDX-License-Identifier: GPL-2.0-or-later
// Janela modal do design system v2 (OG-342): `<dialog>` nativo (foco preso, Esc fecha), clique fora
// fecha, título e ações no rodapé. Também é o fim de partida (OG-344).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button.js';

interface DialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly onClose: () => void;
  /** Rótulo do botão de fechar no canto (leitor de tela). */
  readonly closeLabel: string;
  readonly children: ReactNode;
  /** Botões do rodapé. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function Dialog({ open, title, onClose, closeLabel, children, actions, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    else if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className ? `ui-dialog ${className}` : 'ui-dialog'}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="ui-dialog-box">
        <header className="ui-panel-header">
          <h2 id={id} className="ui-panel-title">
            {title}
          </h2>
          <Button variant="ghost" className="ui-dialog-x" aria-label={closeLabel} onClick={onClose}>
            ×
          </Button>
        </header>
        <div className="ui-dialog-body">{children}</div>
        {actions && <footer className="ui-dialog-actions">{actions}</footer>}
      </div>
    </dialog>
  );
}

/** Botão "i" de mais informações ao lado de um rótulo. */
export function InfoButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" className="ui-info" aria-label={label} title={label} onClick={onClick}>
      i
    </button>
  );
}
