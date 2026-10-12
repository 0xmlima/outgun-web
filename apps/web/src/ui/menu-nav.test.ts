// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { firstEnabled, menuKey, shortcutDigit } from './menu-nav.js';

const items = [{}, { disabled: true }, {}, {}];

describe('teclas dos menus (doc/menus.html)', () => {
  it('setas e Tab pulam itens desabilitados e dão a volta', () => {
    expect(menuKey(items, 0, { key: 'ArrowDown' })).toEqual({ type: 'select', index: 2 });
    expect(menuKey(items, 2, { key: 'ArrowUp' })).toEqual({ type: 'select', index: 0 });
    expect(menuKey(items, 3, { key: 'ArrowDown' })).toEqual({ type: 'select', index: 0 });
    expect(menuKey(items, 0, { key: 'Tab', shiftKey: true })).toEqual({ type: 'select', index: 3 });
    expect(menuKey(items, 0, { key: 'Tab' })).toEqual({ type: 'select', index: 2 });
  });

  it('Home e End vão ao primeiro e ao último item habilitado', () => {
    expect(menuKey(items, 3, { key: 'Home' })).toEqual({ type: 'select', index: 0 });
    expect(menuKey(items, 0, { key: 'End' })).toEqual({ type: 'select', index: 3 });
    expect(menuKey(items, 3, { key: 'End' })).toBeNull();
  });

  it('Enter, Espaço e números ativam; números de itens desabilitados não', () => {
    expect(menuKey(items, 2, { key: 'Enter' })).toEqual({ type: 'activate', index: 2 });
    expect(menuKey(items, 2, { key: ' ' })).toEqual({ type: 'activate', index: 2 });
    expect(menuKey(items, 0, { key: '4' })).toEqual({ type: 'activate', index: 3 });
    expect(menuKey(items, 0, { key: '2' })).toBeNull();
    expect(menuKey(items, 0, { key: '9' })).toBeNull();
  });

  it('esquerda/direita mudam valores e Esc volta', () => {
    expect(menuKey(items, 2, { key: 'ArrowLeft' })).toEqual({ type: 'change', index: 2, delta: -1 });
    expect(menuKey(items, 2, { key: 'ArrowRight' })).toEqual({ type: 'change', index: 2, delta: 1 });
    expect(menuKey(items, 2, { key: 'Escape' })).toEqual({ type: 'back' });
  });

  it('menu sem itens habilitados não seleciona nada', () => {
    expect(firstEnabled([{ disabled: true }])).toBe(-1);
    expect(menuKey([{ disabled: true }], -1, { key: 'Enter' })).toBeNull();
  });

  it('atalhos numéricos 1..9 e 0', () => {
    expect(shortcutDigit(0)).toBe('1');
    expect(shortcutDigit(9)).toBe('0');
    expect(shortcutDigit(10)).toBeUndefined();
  });
});
