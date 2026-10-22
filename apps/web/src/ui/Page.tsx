// SPDX-License-Identifier: GPL-2.0-or-later
// Página do design system v2 (OG-202): título, botão de voltar e Esc para voltar (como nos menus do
// original), conteúdo estreito (formulários) ou largo (tabelas, opções).
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { Button } from './Button.js';
import { FieldGroup } from './Field.js';

interface PageProps {
  readonly title: ReactNode;
  /** Voltar (botão e Esc). */
  readonly onBack?: () => void;
  readonly backLabel?: string;
  /** `full`: telas de trabalho (moderação) que aproveitam a largura do monitor. */
  readonly width?: 'narrow' | 'wide' | 'full';
  /** Linha abaixo do título. */
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
}

export function Page({ title, onBack, backLabel, width = 'wide', subtitle, children }: PageProps) {
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !onBack || ev.defaultPrevented) return;
    ev.preventDefault();
    onBack();
  };
  return (
    <div className={`ui-container ui-pagebody ${width}`} onKeyDown={onKeyDown}>
      <header className="ui-pagehead">
        {onBack && (
          <Button variant="ghost" className="ui-back" onClick={onBack} aria-label={backLabel}>
            ‹
          </Button>
        )}
        <div>
          <h1 className="ui-pagetitle">{title}</h1>
          {subtitle && <p className="ui-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

export type FormMessage = { readonly text: string; readonly error: boolean } | null;

/** Mensagem geral de um formulário (erros de um campo ficam junto dele, em `error` do campo). */
export function FormMessageLine({ message }: { readonly message: FormMessage }) {
  if (!message) return null;
  return (
    <p className={message.error ? 'ui-form-message error' : 'ui-form-message'} role={message.error ? 'alert' : 'status'}>
      {message.text}
    </p>
  );
}

interface FormProps {
  readonly onSubmit: () => void;
  /** Nome do formulário para leitores de tela. */
  readonly label: string;
  readonly children: ReactNode;
  /** Botões ao pé (o de enviar deve ter `type="submit"`). */
  readonly actions: ReactNode;
}

/**
 * Formulário web de verdade (`<form>` com botão de enviar): Enter envia e os gerenciadores de senha
 * reconhecem os campos de usuário e senha.
 */
export function Form({ onSubmit, label, children, actions }: FormProps) {
  return (
    <form
      className="ui-form"
      aria-label={label}
      noValidate
      onSubmit={(ev: FormEvent) => {
        ev.preventDefault();
        onSubmit();
      }}
    >
      <FieldGroup>{children}</FieldGroup>
      <div className="ui-form-actions">{actions}</div>
    </form>
  );
}
