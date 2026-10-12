// SPDX-License-Identifier: GPL-2.0-or-later
// Menu no estilo do original (src/menu.cpp, doc/menus.html): caixa com título, itens numerados,
// navegação só por teclado possível e mouse como alternativa.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BitmapText } from './BitmapText.js';
import { firstEnabled, menuKey, shortcutDigit } from './menu-nav.js';

export type MenuItem =
  | {
      readonly kind: 'action';
      readonly label: string;
      readonly onActivate: () => void;
      readonly disabled?: boolean;
      /** Texto à direita (ex.: "em breve"). */
      readonly note?: string;
    }
  | {
      readonly kind: 'choice';
      readonly label: string;
      readonly value: string;
      readonly onChange: (delta: -1 | 1) => void;
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
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

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
    else item.onChange(1);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
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
