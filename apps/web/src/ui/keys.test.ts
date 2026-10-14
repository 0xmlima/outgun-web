// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { choiceKey, rovingKey, sliderKey, toggleKey } from './keys.js';
import { menuKey } from './menu-nav.js';
import { MAX_TOASTS, pushToast } from './Toast.js';

const items = [{}, { disabled: true }, {}, {}];

describe('teclado dos componentes do design system v2 (OG-200)', () => {
  it('MenuList: setas, Home/End, Enter, Esc e atalhos numéricos (menu-nav)', () => {
    expect(menuKey(items, 0, { key: 'ArrowDown' })).toEqual({ type: 'select', index: 2 });
    expect(menuKey(items, 0, { key: 'End' })).toEqual({ type: 'select', index: 3 });
    expect(menuKey(items, 2, { key: 'Enter' })).toEqual({ type: 'activate', index: 2 });
    expect(menuKey(items, 2, { key: '4' })).toEqual({ type: 'activate', index: 3 });
    expect(menuKey(items, 2, { key: '2' })).toBeNull();
    expect(menuKey(items, 2, { key: 'Escape' })).toEqual({ type: 'back' });
  });

  it('Tabs: ←/→ trocam de aba pulando as desabilitadas e dando a volta; Home/End nas pontas', () => {
    expect(rovingKey(items, 0, 'ArrowRight', 'horizontal')).toBe(2);
    expect(rovingKey(items, 0, 'ArrowLeft', 'horizontal')).toBe(3);
    expect(rovingKey(items, 3, 'Home', 'horizontal')).toBe(0);
    expect(rovingKey(items, 0, 'End', 'horizontal')).toBe(3);
    expect(rovingKey(items, 0, 'ArrowDown', 'horizontal')).toBeNull();
  });

  it('Table e FieldGroup: ↑/↓ movem; o FieldGroup deixa Home/End para o campo de texto', () => {
    expect(rovingKey(items, 2, 'ArrowUp', 'vertical')).toBe(0);
    expect(rovingKey(items, 3, 'ArrowDown', 'vertical')).toBe(0);
    expect(rovingKey(items, 3, 'Home', 'vertical', false)).toBeNull();
    expect(rovingKey([{ disabled: true }], 0, 'ArrowDown', 'vertical')).toBeNull();
  });

  it('ChoiceField: ←/→ trocam; Enter e Espaço avançam', () => {
    expect(choiceKey('ArrowLeft')).toBe(-1);
    expect(choiceKey('ArrowRight')).toBe(1);
    expect(choiceKey('Enter')).toBe(1);
    expect(choiceKey(' ')).toBe(1);
    expect(choiceKey('ArrowDown')).toBeNull();
  });

  it('ToggleField: Enter/Espaço invertem, ← desliga, → liga', () => {
    expect(toggleKey(false, ' ')).toBe(true);
    expect(toggleKey(true, 'Enter')).toBe(false);
    expect(toggleKey(true, 'ArrowLeft')).toBe(false);
    expect(toggleKey(false, 'ArrowRight')).toBe(true);
    expect(toggleKey(false, 'ArrowUp')).toBeNull();
  });

  it('SliderField: passo, dez passos e pontas, sem sair do intervalo', () => {
    const range = { min: 0, max: 100, step: 5 };
    expect(sliderKey(50, range, 'ArrowRight')).toBe(55);
    expect(sliderKey(0, range, 'ArrowLeft')).toBe(0);
    expect(sliderKey(50, range, 'PageUp')).toBe(100);
    expect(sliderKey(50, range, 'PageDown')).toBe(0);
    expect(sliderKey(50, range, 'Home')).toBe(0);
    expect(sliderKey(50, range, 'End')).toBe(100);
    expect(sliderKey(50, range, 'ArrowUp')).toBeNull();
  });

  it('Toast: no máximo três avisos; o mais antigo sai', () => {
    let list = pushToast([], { id: 1, message: 'a', tone: 'neutral' });
    for (let id = 2; id <= 5; id++) list = pushToast(list, { id, message: String(id), tone: 'neutral' });
    expect(list.map((t) => t.id)).toEqual([3, 4, 5]);
    expect(list).toHaveLength(MAX_TOASTS);
  });
});
