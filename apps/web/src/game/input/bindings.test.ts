// SPDX-License-Identifier: GPL-2.0-or-later
import { CONTROL } from '@outgun/sim';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_BINDINGS,
  chordLabel,
  chordOf,
  CLASSIC_BINDINGS,
  controlBits,
  heldActions,
  isGameKey,
  parseBindings,
  pressedActions,
  rebind,
  serializeBindings,
} from './bindings.js';
import { gamepadSample } from './input.js';

const ev = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});
const bits = (...codes: string[]) => controlBits(heldActions(CLASSIC_BINDINGS, new Set(codes)));

describe('teclas do original (plan/specs/entrada.md)', () => {
  it('teclado numérico com diagonais; 5 = baixo', () => {
    expect(bits('Numpad7')).toBe(CONTROL.up | CONTROL.left);
    expect(bits('Numpad3')).toBe(CONTROL.down | CONTROL.right);
    expect(bits('Numpad5')).toBe(CONTROL.down);
  });

  it('Shift corre, Alt/Alt Gr esquivam, Ctrl atira', () => {
    expect(bits('ShiftLeft', 'ArrowRight')).toBe(CONTROL.right | CONTROL.run);
    expect(bits('AltRight', 'ArrowUp')).toBe(CONTROL.up | CONTROL.strafe);
    expect(heldActions(CLASSIC_BINDINGS, new Set(['ControlRight'])).has('fire')).toBe(true);
    expect(heldActions(CLASSIC_BINDINGS, new Set(['PageDown'])).has('dropFlag')).toBe(true);
  });

  it('Ctrl+End troca de time; End sozinho não; Delete com Ctrl ainda é suicídio', () => {
    expect(pressedActions(CLASSIC_BINDINGS, ev('End', { ctrl: true }))).toEqual(['changeTeam']);
    expect(pressedActions(CLASSIC_BINDINGS, ev('End'))).toEqual([]);
    expect(pressedActions(CLASSIC_BINDINGS, ev('Delete', { ctrl: true }))).toEqual(['suicide']);
    expect(pressedActions(CLASSIC_BINDINGS, ev('F2'))).toEqual(['mapList']);
    expect(pressedActions(CLASSIC_BINDINGS, ev('KeyN', { ctrl: true }))).toEqual(['toggleNames']);
    expect(pressedActions(CLASSIC_BINDINGS, ev('F6'))).toEqual(['toggleNames']);
  });

  it('esquema Navegador não usa Ctrl nem Alt', () => {
    const all = Object.values(BROWSER_BINDINGS).flat();
    expect(all.some((c) => c.ctrl || c.alt || /^(Control|Alt)/.test(c.code))).toBe(false);
    expect(heldActions(BROWSER_BINDINGS, new Set(['Space'])).has('fire')).toBe(true);
  });
});

describe('remapeamento', () => {
  it('a nova tecla sai das outras ações, mas diagonais seguem nas duas direções', () => {
    const b = rebind(CLASSIC_BINDINGS, 'fire', { code: 'Space' });
    expect(b.fire[0]).toEqual({ code: 'Space' });
    const c = rebind(b, 'run', { code: 'Space' });
    expect(c.fire.some((x) => x.code === 'Space')).toBe(false);
    const d = rebind(CLASSIC_BINDINGS, 'up', { code: 'Numpad7' });
    expect(d.left.some((x) => x.code === 'Numpad7')).toBe(true);
  });

  it('acorde de um evento; modificador sozinho vale como tecla', () => {
    expect(chordOf(ev('End', { ctrl: true }))).toEqual({ code: 'End', ctrl: true });
    expect(chordOf(ev('ShiftLeft', { shift: true }))).toEqual({ code: 'ShiftLeft' });
    expect(chordLabel({ code: 'End', ctrl: true })).toBe('Ctrl+End');
    expect(chordLabel({ code: 'Numpad8' })).toBe('Pad 8');
    expect(chordLabel({ code: 'KeyN', ctrl: true })).toBe('Ctrl+N');
  });

  it('persistência: ida e volta; dados inválidos caem no padrão', () => {
    const b = rebind(CLASSIC_BINDINGS, 'fire', { code: 'Space' });
    expect(parseBindings(serializeBindings(b))).toEqual(b);
    expect(parseBindings('{lixo')).toEqual(CLASSIC_BINDINGS);
    expect(parseBindings('{"fire": 3}').fire).toEqual(CLASSIC_BINDINGS.fire);
  });
});

describe('gamepad (fromJoystick)', () => {
  const pad = (axes: number[], pressed: number[]) => ({
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: 0 })),
  });

  it('analógico com limiar 0,5, direcional e botões 0/1/2', () => {
    expect(gamepadSample(pad([-0.9, 0.2], [])).controls).toBe(CONTROL.left);
    expect(gamepadSample(pad([0, 0], [12, 15])).controls).toBe(CONTROL.up | CONTROL.right);
    const s = gamepadSample(pad([0.8, 0], [0, 1, 2]));
    expect(s.fire).toBe(true);
    expect(s.controls).toBe(CONTROL.right | CONTROL.run | CONTROL.strafe);
    expect(gamepadSample(pad([0, 0], [9])).start).toBe(true);
  });
});

describe('tecla do jogo para o chat (OG-336)', () => {
  const ev = (code: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

  it('N e P sozinhos não são do jogo (Ctrl+N, Ctrl+P); com Ctrl são', () => {
    expect(isGameKey(CLASSIC_BINDINGS, ev('KeyN'))).toBe(false);
    expect(isGameKey(CLASSIC_BINDINGS, ev('KeyN', { shiftKey: true }))).toBe(false);
    expect(isGameKey(CLASSIC_BINDINGS, ev('KeyN', { ctrlKey: true }))).toBe(true);
    expect(isGameKey(CLASSIC_BINDINGS, ev('KeyP'))).toBe(false);
    expect(isGameKey(CLASSIC_BINDINGS, ev('KeyP', { ctrlKey: true }))).toBe(true);
    expect(isGameKey(BROWSER_BINDINGS, ev('KeyZ'))).toBe(true);
  });

  it('P sozinho salvo como pausa sai e entra a pausa do esquema; associação própria em outra tecla fica', () => {
    const saved = serializeBindings({ ...CLASSIC_BINDINGS, pause: [{ code: 'KeyP' }, { code: 'Pause' }] });
    expect(parseBindings(saved).pause).toEqual([{ code: 'KeyP', ctrl: true }, { code: 'Pause' }]);
    expect(parseBindings(saved, BROWSER_BINDINGS).pause).toEqual([{ code: 'Home' }, { code: 'Pause' }]);
    const custom = serializeBindings({ ...CLASSIC_BINDINGS, pause: [{ code: 'KeyO' }] });
    expect(parseBindings(custom).pause).toEqual([{ code: 'KeyO' }]);
  });
});
