// SPDX-License-Identifier: GPL-2.0-or-later
// Teclas dos menus, como em doc/menus.html ("Using the menus" e "Advanced keys"): setas e Tab
// movem, Home/End vão ao primeiro/último item, Espaço/Enter ativam, Esc volta, esquerda/direita
// mudam valores e o número mostrado à esquerda de um item o ativa direto.

export interface NavItem {
  readonly disabled?: boolean | undefined;
}

export type NavAction =
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'activate'; readonly index: number }
  | { readonly type: 'change'; readonly index: number; readonly delta: -1 | 1 }
  | { readonly type: 'back' };

export interface NavKey {
  readonly key: string;
  readonly shiftKey?: boolean;
}

/** Próximo item habilitado a partir de `from` no sentido `step`, dando a volta; -1 se não houver. */
export function nextEnabled(items: readonly NavItem[], from: number, step: 1 | -1): number {
  for (let i = 1; i <= items.length; i++) {
    const index = (((from + step * i) % items.length) + items.length) % items.length;
    if (!items[index]?.disabled) return index;
  }
  return -1;
}

export function firstEnabled(items: readonly NavItem[]): number {
  return nextEnabled(items, -1, 1);
}

/** Número de atalho (1..9, depois 0) do item `index`, contando todos os itens como no original. */
export function shortcutDigit(index: number): string | undefined {
  if (index < 9) return String(index + 1);
  return index === 9 ? '0' : undefined;
}

export function menuKey(items: readonly NavItem[], current: number, ev: NavKey): NavAction | null {
  const move = (index: number): NavAction | null =>
    index < 0 || index === current ? null : { type: 'select', index };
  switch (ev.key) {
    case 'ArrowDown':
      return move(nextEnabled(items, current, 1));
    case 'ArrowUp':
      return move(nextEnabled(items, current, -1));
    case 'Tab':
      return move(nextEnabled(items, current, ev.shiftKey ? -1 : 1));
    case 'Home':
      return move(firstEnabled(items));
    case 'End':
      return move(nextEnabled(items, items.length, -1));
    case 'Enter':
    case ' ':
      return current >= 0 && !items[current]?.disabled ? { type: 'activate', index: current } : null;
    case 'ArrowLeft':
    case 'ArrowRight':
      return current >= 0 && !items[current]?.disabled
        ? { type: 'change', index: current, delta: ev.key === 'ArrowLeft' ? -1 : 1 }
        : null;
    case 'Escape':
      return { type: 'back' };
  }
  if (/^[0-9]$/.test(ev.key)) {
    const index = ev.key === '0' ? 9 : Number(ev.key) - 1;
    if (index < items.length && !items[index]?.disabled) return { type: 'activate', index };
  }
  return null;
}
