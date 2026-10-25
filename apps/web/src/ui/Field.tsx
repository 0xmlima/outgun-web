// SPDX-License-Identifier: GPL-2.0-or-later
// Campos do design system v2 (OG-200): texto/senha, escolha, alternador e deslizante, sempre com
// rótulo visível. Num `FieldGroup`, ↑/↓ passam de um campo a outro (gamepad e teclado) e ←/→ mudam o
// valor; as teclas dos campos estão em keys.ts.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { choiceKey, rovingKey, sliderKey, toggleKey } from './keys.js';

/** Marca os controles que o `FieldGroup` percorre com ↑/↓. */
const CONTROL = 'data-ui-control';

interface FieldFrameProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode | undefined;
  readonly error?: ReactNode | undefined;
  readonly children: ReactNode;
  /** Valor exibido ao lado do rótulo (deslizante). */
  readonly value?: ReactNode;
}

function FieldFrame({ id, label, hint, error, value, children }: FieldFrameProps) {
  return (
    <div className={error ? 'ui-field invalid' : 'ui-field'}>
      <div className="ui-field-head">
        <label className="ui-field-label" htmlFor={id}>
          {label}
        </label>
        {value !== undefined && <output htmlFor={id} className="ui-field-value">{value}</output>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="ui-field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="ui-field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

interface TextFieldProps {
  readonly label: ReactNode;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'password' | 'email' | 'search';
  readonly autoComplete?: string;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly autoFocus?: boolean;
  /** Enter no campo (ex.: enviar o formulário). */
  readonly onEnter?: () => void;
}

export function TextField({ label, value, onChange, type = 'text', autoComplete = 'off', maxLength, placeholder, disabled, hint, error, autoFocus, onEnter }: TextFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        {...{ [CONTROL]: '' }}
        className="ui-input"
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' && onEnter) {
            ev.preventDefault();
            onEnter();
          }
        }}
      />
    </FieldFrame>
  );
}

/** Texto de várias linhas (OG-203): Enter quebra a linha; fora do percurso ↑/↓ do `FieldGroup`. */
export function TextAreaField({ label, value, onChange, maxLength, rows = 6, hint }: { readonly label: ReactNode; readonly value: string; readonly onChange: (value: string) => void; readonly maxLength?: number; readonly rows?: number; readonly hint?: ReactNode }) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <textarea id={id} className="ui-input ui-textarea" value={value} rows={rows} maxLength={maxLength} aria-describedby={hint ? `${id}-msg` : undefined} onChange={(ev) => onChange(ev.target.value)} />
    </FieldFrame>
  );
}

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
}

interface ChoiceFieldProps<T extends string> {
  readonly label: ReactNode;
  readonly value: T;
  readonly options: readonly ChoiceOption<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
}

/** Acima de tantas opções, clicar no valor abre a lista inteira em vez de passar para a próxima. */
const CHOICE_LIST_MIN = 5;

/**
 * Escolha trocada com ←/→ (o "< valor >" dos menus do original). Com muitas opções (ex.: resoluções com
 * várias taxas de atualização), clicar no valor, Enter ou Espaço abrem a lista inteira: ↑/↓ andam, Enter
 * escolhe, Esc fecha. Com poucas, clicar passa para a próxima, como as setas.
 */
export function ChoiceField<T extends string>({ label, value, options, onChange, disabled, hint }: ChoiceFieldProps<T>) {
  const id = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const long = options.length >= CHOICE_LIST_MIN;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const valueButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const step = (delta: number) => {
    const next = options[(index + delta + options.length) % options.length];
    if (next && next.value !== value) onChange(next.value);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) valueButton.current?.focus();
  };
  const pick = (v: T) => {
    if (v !== value) onChange(v);
    close(true);
  };
  // ao abrir, a opção atual em foco e à vista; clicar fora fecha
  useEffect(() => {
    if (!open) return;
    const current = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    current?.focus();
    current?.scrollIntoView({ block: 'nearest' });
    const outside = (ev: MouseEvent) => {
      if (!box.current?.contains(ev.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', outside);
    return () => removeEventListener('mousedown', outside);
  }, [open]);
  const onListKey = (ev: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (ev.key in move) items[Math.max(0, Math.min(items.length - 1, at + move[ev.key]!))]?.focus();
    else if (ev.key === 'Home') items[0]?.focus();
    else if (ev.key === 'End') items.at(-1)?.focus();
    else if (ev.key === 'Escape') close(true);
    else if (ev.key === 'Tab') close(false);
    else if (ev.key === 'Enter' || ev.key === ' ') {
      const option = options[at];
      if (option) pick(option.value);
    } else return;
    if (ev.key !== 'Tab') ev.preventDefault();
    ev.stopPropagation();
  };
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <div className="ui-choice" ref={box}>
        <button type="button" className="ui-choice-arrow" tabIndex={-1} aria-hidden="true" disabled={disabled} onClick={() => step(-1)}>
          ‹
        </button>
        <button
          id={id}
          ref={valueButton}
          {...{ [CONTROL]: '' }}
          type="button"
          className="ui-choice-value"
          disabled={disabled}
          aria-describedby={hint ? `${id}-msg` : undefined}
          aria-haspopup={long ? 'listbox' : undefined}
          aria-expanded={long ? open : undefined}
          onClick={() => (long ? setOpen((o) => !o) : step(1))}
          onKeyDown={(ev) => {
            const delta = choiceKey(ev.key);
            if (delta === null) return;
            ev.preventDefault();
            // nas listas longas, Enter/Espaço abrem a lista; ←/→ continuam passando uma a uma
            if (long && (ev.key === 'Enter' || ev.key === ' ')) setOpen(true);
            else step(delta);
          }}
        >
          {options[index]?.label}
        </button>
        <button type="button" className="ui-choice-arrow" tabIndex={-1} aria-hidden="true" disabled={disabled} onClick={() => step(1)}>
          ›
        </button>
        {open && (
          <ul ref={list} className="ui-choice-list" role="listbox" aria-labelledby={id} onKeyDown={onListKey}>
            {options.map((o) => (
              <li key={o.value} role="option" tabIndex={-1} aria-selected={o.value === value} onClick={() => pick(o.value)}>
                {o.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldFrame>
  );
}

interface ToggleFieldProps {
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
}

export function ToggleField({ label, checked, onChange, disabled, hint }: ToggleFieldProps) {
  const id = useId();
  return (
    <div className={disabled ? 'ui-field ui-toggle-field disabled' : 'ui-field ui-toggle-field'}>
      <div className="ui-toggle-row">
        <label className="ui-field-label" htmlFor={id}>
          {label}
        </label>
        <button
          id={id}
          {...{ [CONTROL]: '' }}
          type="button"
          role="switch"
          className="ui-switch"
          aria-checked={checked}
          aria-describedby={hint ? `${id}-msg` : undefined}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          onKeyDown={(ev) => {
            const next = toggleKey(checked, ev.key);
            if (next === null) return;
            ev.preventDefault();
            if (next !== checked) onChange(next);
          }}
        >
          <span className="ui-switch-thumb" />
        </button>
      </div>
      {hint && (
        <p id={`${id}-msg`} className="ui-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

interface SliderFieldProps {
  readonly label: ReactNode;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
  /** Texto do valor (ex.: "50%"). */
  readonly format?: (value: number) => string;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
}

export function SliderField({ label, value, min, max, step = 1, onChange, format = String, disabled, hint }: SliderFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} value={format(value)}>
      <input
        id={id}
        {...{ [CONTROL]: '' }}
        className="ui-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        aria-describedby={hint ? `${id}-msg` : undefined}
        style={{ '--fill': `${((value - min) / (max - min || 1)) * 100}%` } as CSSProperties}
        onChange={(ev) => onChange(Number(ev.target.value))}
        onKeyDown={(ev) => {
          // tratado aqui (e não pelo navegador) para o gamepad, que entrega teclas sintéticas
          const next = sliderKey(value, { min, max, step }, ev.key);
          if (next === null) return;
          ev.preventDefault();
          if (next !== value) onChange(next);
        }}
      />
    </FieldFrame>
  );
}

/** Formulário de campos: ↑/↓ movem o foco entre eles (os campos de texto não usam essas teclas). */
export function FieldGroup({ children, label }: { readonly children: ReactNode; readonly label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || !ref.current) return;
    const controls = [...ref.current.querySelectorAll<HTMLElement>(`[${CONTROL}]`)];
    const current = controls.indexOf(ev.target as HTMLElement);
    if (current < 0) return;
    const items = controls.map((c) => ({ disabled: c.matches(':disabled') }));
    const next = rovingKey(items, current, ev.key, 'vertical', false);
    if (next === null) return;
    ev.preventDefault();
    controls[next]?.focus();
  };
  return (
    <div ref={ref} className="ui-fields" role="group" aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
