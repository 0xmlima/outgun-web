// SPDX-License-Identifier: GPL-2.0-or-later
// Lista de opções do design system v2 (OG-200): as teclas dos menus do original (menu-nav.ts: setas,
// Home/End, Enter/Espaço, Esc e atalhos numéricos), mouse, toque e gamepad. Tab sai da lista, como
// em qualquer página web.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { firstEnabled, menuKey, shortcutDigit } from './menu-nav.js';

export interface MenuListItem {
  readonly label: ReactNode;
  /** Linha menor abaixo do rótulo. */
  readonly description?: ReactNode;
  /** À direita (ex.: um `Badge` ou o valor atual). */
  readonly aside?: ReactNode;
  readonly onActivate: () => void;
  readonly disabled?: boolean;
  /** A ação principal da tela (ex.: "Jogar agora"), em destaque. */
  readonly primary?: boolean;
}

interface MenuListProps {
  /** Nome da lista para leitores de tela. */
  readonly label: string;
  readonly items: readonly MenuListItem[];
  /** Esc. */
  readonly onBack?: () => void;
  /** Põe o foco no primeiro item ao montar (telas cujo conteúdo principal é a lista). */
  readonly autoFocus?: boolean;
  readonly className?: string;
}

export function MenuList({ label, items, onBack, autoFocus = false, className }: MenuListProps) {
  const [current, setCurrent] = useState(() => firstEnabled(items));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[current]?.focus();
  }, []);

  const select = (index: number) => {
    setCurrent(index);
    refs.current[index]?.focus();
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.key === 'Tab') return;
    const action = menuKey(items, current, ev);
    if (!action) return;
    ev.preventDefault();
    switch (action.type) {
      case 'select':
        select(action.index);
        break;
      case 'activate':
        select(action.index);
        items[action.index]?.onActivate();
        break;
      case 'back':
        onBack?.();
        break;
      case 'change':
        break;
    }
  };

  return (
    <ul className={className ? `ui-menu ${className}` : 'ui-menu'} role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const digit = shortcutDigit(index);
        const classes = ['ui-menu-item'];
        if (index === current) classes.push('current');
        if (item.primary) classes.push('primary');
        return (
          <li key={index} role="none" className={item.primary ? 'primary' : undefined}>
            <button
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              className={classes.join(' ')}
              aria-disabled={item.disabled ? true : undefined}
              tabIndex={index === current ? 0 : -1}
              onFocus={() => !item.disabled && setCurrent(index)}
              onClick={() => !item.disabled && item.onActivate()}
            >
              <span className="ui-menu-text">
                <span className="ui-menu-label">{item.label}</span>
                {item.description && <span className="ui-menu-description">{item.description}</span>}
              </span>
              {item.aside && <span className="ui-menu-aside">{item.aside}</span>}
              {digit && (
                <kbd className="ui-menu-shortcut" aria-hidden="true">
                  {digit}
                </kbd>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
