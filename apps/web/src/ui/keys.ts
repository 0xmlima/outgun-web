// SPDX-License-Identifier: GPL-2.0-or-later
// Teclas dos componentes do design system v2 (OG-200), como funções puras para os testes. O gamepad
// chega aqui como teclas (gamepad.ts): setas, Enter e Esc.
import { firstEnabled, nextEnabled, type NavItem } from './menu-nav.js';

export type Orientation = 'vertical' | 'horizontal';

/**
 * Foco itinerante (abas, linhas de tabela, campos de um formulário): as setas do eixo movem para o
 * próximo item habilitado, dando a volta; Home/End vão às pontas quando `homeEnd`. Devolve o índice
 * novo ou `null` se a tecla não é de navegação.
 */
export function rovingKey(
  items: readonly NavItem[],
  current: number,
  key: string,
  orientation: Orientation,
  homeEnd = true,
): number | null {
  const [prev, next] = orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  let index: number;
  if (key === prev) index = nextEnabled(items, current, -1);
  else if (key === next) index = nextEnabled(items, current, 1);
  else if (homeEnd && key === 'Home') index = firstEnabled(items);
  else if (homeEnd && key === 'End') index = nextEnabled(items, items.length, -1);
  else return null;
  return index < 0 ? null : index;
}

/** Campo de escolha: ←/→ trocam o valor; Enter/Espaço vão ao próximo. Devolve o passo. */
export function choiceKey(key: string): -1 | 1 | null {
  if (key === 'ArrowLeft') return -1;
  if (key === 'ArrowRight' || key === 'Enter' || key === ' ') return 1;
  return null;
}

/** Alternador: Enter/Espaço invertem; ← desliga e → liga. */
export function toggleKey(checked: boolean, key: string): boolean | null {
  if (key === 'Enter' || key === ' ') return !checked;
  if (key === 'ArrowLeft') return false;
  if (key === 'ArrowRight') return true;
  return null;
}

export interface SliderRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Deslizante: ←/→ um passo, PageDown/PageUp dez passos, Home/End nas pontas. */
export function sliderKey(value: number, { min, max, step }: SliderRange, key: string): number | null {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  switch (key) {
    case 'ArrowLeft':
      return clamp(value - step);
    case 'ArrowRight':
      return clamp(value + step);
    case 'PageDown':
      return clamp(value - step * 10);
    case 'PageUp':
      return clamp(value + step * 10);
    case 'Home':
      return min;
    case 'End':
      return max;
  }
  return null;
}
