// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { chordLabel } from './bindings.js';
import { altName, reservedChord } from './shortcuts.js';

describe('atalhos do navegador e do sistema (OG-232)', () => {
  it('Windows/Linux: Ctrl+W/T/N/Tab/número, Alt+Tab/F4 e Alt+número (Firefox) são reservados', () => {
    for (const code of ['KeyW', 'KeyT', 'KeyN', 'Tab', 'Digit1', 'PageDown']) expect(reservedChord({ code, ctrl: true }, false)).toBe(true);
    expect(reservedChord({ code: 'Tab', alt: true }, false)).toBe(true);
    expect(reservedChord({ code: 'F4', alt: true }, false)).toBe(true);
    expect(reservedChord({ code: 'Digit1', alt: true }, false)).toBe(true);
    expect(reservedChord({ code: 'KeyA', ctrl: true }, false)).toBe(false);
    expect(reservedChord({ code: 'ControlRight' }, false)).toBe(false);
  });

  it('Mac: Ctrl+setas e Ctrl+espaço (sistema); Ctrl+W e Option+número são do jogo', () => {
    expect(reservedChord({ code: 'ArrowLeft', ctrl: true }, true)).toBe(true);
    expect(reservedChord({ code: 'Space', ctrl: true }, true)).toBe(true);
    expect(reservedChord({ code: 'KeyW', ctrl: true }, true)).toBe(false);
    expect(reservedChord({ code: 'Digit1', alt: true }, true)).toBe(false);
  });

  it('no Mac o Alt se chama Option', () => {
    expect(chordLabel({ code: 'Digit1', alt: true }, altName(true))).toBe('Option+1');
    expect(chordLabel({ code: 'AltLeft' }, altName(true))).toBe('Option');
    expect(chordLabel({ code: 'AltRight' }, altName(false))).toBe('Alt Gr');
  });
});
