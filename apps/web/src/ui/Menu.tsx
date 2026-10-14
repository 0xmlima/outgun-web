// SPDX-License-Identifier: GPL-2.0-or-later
// Menu no estilo do original (src/menu.cpp, doc/menus.html): caixa com título, itens numerados,
// navegação só por teclado possível e mouse como alternativa.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BitmapText } from './BitmapText.js';
import { firstEnabled, menuKey, nextEnabled, shortcutDigit } from './menu-nav.js';

export type MenuItem =
  | {
      readonly kind: 'action';
      readonly label: string;
      readonly onActivate: () => void;
      readonly disabled?: boolean;
      /** Texto à direita (ex.: "em breve"). */
      readonly note?: string;
      /** Delete sobre o item (ex.: voltar a tecla ao padrão). */
      readonly onDelete?: () => void;
    }
  | {
      /** Campo de texto (Textfield de src/menu.h): enquanto ativo, números e espaço são digitados. */
      readonly kind: 'text';
      readonly label: string;
      readonly value: string;
      readonly onChange: (value: string) => void;
      /** Mostra `*` no lugar dos caracteres (maskChar do original). */
      readonly password?: boolean;
      readonly maxLength?: number;
      /** Dica para o navegador e gerenciadores de senha (`username`, `current-password`...). */
      readonly autoComplete?: string;
      readonly disabled?: boolean;
      /** Enter no campo; sem isso, Enter vai para o próximo item. */
      readonly onEnter?: () => void;
    }
  | {
      readonly kind: 'choice';
      readonly label: string;
      readonly value: string;
      readonly onChange: (delta: -1 | 1) => void;
      readonly disabled?: boolean;
    }
  | {
      /** `Colorselect` (src/menu.cpp): ←/→ escolhe; Ctrl+←/→ (ou +/−) leva a cor junto. */
      readonly kind: 'colors';
      readonly label: string;
      /** Cores CSS na ordem atual. */
      readonly colors: readonly string[];
      readonly selected: number;
      readonly onMove: (delta: -1 | 1, carry: boolean) => void;
      readonly disabled?: boolean;
    };

interface MenuProps {
  readonly caption: string;
  readonly items: readonly MenuItem[];
  readonly onBack?: () => void;
  /** Conteúdo abaixo dos itens (texto de ajuda, avisos). */
  readonly children?: ReactNode;
}

export function Menu({ caption, items, onBack, children }: MenuProps) {
  const [current, setCurrent] = useState(() => firstEnabled(items));
  const buttons = useRef<(HTMLButtonElement | HTMLInputElement | null)[]>([]);

  useEffect(() => {
    buttons.current[current]?.focus();
  }, [current]);
  // Se o foco se perdeu (ex.: o item foi recriado ao trocar o idioma), devolve-o ao item atual.
  useEffect(() => {
    if (document.activeElement === document.body) buttons.current[current]?.focus();
  });

  const activate = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    if (item.kind === 'action') item.onActivate();
    else if (item.kind === 'choice') item.onChange(1);
    else if (item.kind === 'text' && item.onEnter) item.onEnter();
    else {
      const next = nextEnabled(items, index, 1);
      if (next > index) setCurrent(next);
    }
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    const item = items[current];
    if (item?.kind === 'colors' && !item.disabled) {
      const left = ev.key === 'ArrowLeft' || ev.key === '+';
      const right = ev.key === 'ArrowRight' || ev.key === '-';
      if (left || right) {
        ev.preventDefault();
        item.onMove(left ? -1 : 1, ev.ctrlKey || ev.metaKey || ev.key === '+' || ev.key === '-');
        return;
      }
    }
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'Delete' && item?.kind === 'action' && item.onDelete) {
      ev.preventDefault();
      item.onDelete();
      return;
    }
    // No campo de texto, só as teclas de navegação são do menu; o resto é digitação.
    if (item?.kind === 'text' && !['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(ev.key)) return;
    const action = menuKey(items, current, ev);
    if (!action) return;
    ev.preventDefault();
    switch (action.type) {
      case 'select':
        setCurrent(action.index);
        break;
      case 'activate':
        setCurrent(action.index);
        activate(action.index);
        break;
      case 'change': {
        const item = items[action.index];
        if (item?.kind === 'choice') item.onChange(action.delta);
        break;
      }
      case 'back':
        onBack?.();
        break;
    }
  };

  return (
    <section className="menu" aria-label={caption} onKeyDown={onKeyDown}>
      <h1 className="menu-caption">
        <BitmapText text={caption} />
      </h1>
      <ul className="menu-items" role="menu">
        {items.map((item, index) => {
          const digit = shortcutDigit(index);
          const classes = ['menu-item'];
          if (index === current) classes.push('active');
          if (item.disabled) classes.push('disabled');
          if (item.kind === 'text') {
            const shown = item.password ? '*'.repeat(item.value.length) : item.value;
            return (
              <li key={index} role="none">
                <label className={`${classes.join(' ')} menu-text`} onMouseEnter={() => !item.disabled && setCurrent(index)}>
                  <span className="menu-shortcut" aria-hidden="true">
                    {digit && <BitmapText text={digit} />}
                  </span>
                  <BitmapText className="menu-label" text={item.label} />
                  <span className="menu-field">
                    <BitmapText text={index === current ? `${shown}_` : shown || ' '} />
                    <input
                      ref={(el) => {
                        buttons.current[index] = el;
                      }}
                      type={item.password ? 'password' : 'text'}
                      value={item.value}
                      maxLength={item.maxLength}
                      autoComplete={item.autoComplete ?? 'off'}
                      spellCheck={false}
                      disabled={item.disabled}
                      aria-label={item.label}
                      tabIndex={index === current ? 0 : -1}
                      onFocus={() => setCurrent(index)}
                      onChange={(ev) => item.onChange(ev.target.value)}
                    />
                  </span>
                </label>
              </li>
            );
          }
          return (
            <li key={index} role="none">
              <button
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                type="button"
                role="menuitem"
                className={classes.join(' ')}
                aria-disabled={item.disabled ? true : undefined}
                tabIndex={index === current ? 0 : -1}
                onMouseEnter={() => !item.disabled && setCurrent(index)}
                onFocus={() => !item.disabled && setCurrent(index)}
                onClick={() => activate(index)}
              >
                <span className="menu-shortcut" aria-hidden="true">
                  {digit && <BitmapText text={digit} />}
                </span>
                <BitmapText className="menu-label" text={item.label} />
                {item.kind === 'choice' && (
                  <BitmapText className="menu-value" text={`< ${item.value} >`} />
                )}
                {item.kind === 'colors' && (
                  <span className="menu-colors" aria-label={item.label}>
                    {item.colors.map((c, i) => (
                      <span key={i} className={i === item.selected ? 'swatch selected' : 'swatch'} style={{ background: c }} />
                    ))}
                  </span>
                )}
                {item.kind === 'action' && item.note && (
                  <BitmapText className="menu-note" text={item.note} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
