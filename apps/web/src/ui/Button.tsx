// SPDX-License-Identifier: GPL-2.0-or-later
// Botão e selo do design system v2 (OG-200).
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'lg';
  /** Ocupa a largura toda (pilhas de botões no celular). */
  readonly block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', block = false, className, type = 'button', ...rest }: ButtonProps) {
  const classes = ['ui-button', `ui-button-${variant}`, `ui-button-${size}`];
  if (block) classes.push('ui-button-block');
  if (className) classes.push(className);
  return <button type={type} className={classes.join(' ')} {...rest} />;
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children }: { readonly tone?: Tone; readonly children: ReactNode }) {
  return <span className={`ui-badge ui-tone-${tone}`}>{children}</span>;
}
