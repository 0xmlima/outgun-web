// SPDX-License-Identifier: GPL-2.0-or-later
import { CONTROL } from '@outgun/sim';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLASSIC_BINDINGS } from './bindings.js';
import { GameInput } from './input.js';

/** Eventos de teclado sintéticos num `EventTarget` no lugar da janela (os testes rodam no Node). */
let target: EventTarget;
const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, key: code, repeat, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }));

beforeEach(() => {
  target = new EventTarget();
  Object.assign(globalThis, {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'addEventListener');
  Reflect.deleteProperty(globalThis, 'removeEventListener');
});

describe('entrada por evento (OG-371)', () => {
  it('um toque de tiro mais curto que um quadro chega como apertar e soltar', () => {
    const input = new GameInput(CLASSIC_BINDINGS);
    const fire: boolean[] = [];
    input.onChange(() => fire.push(input.sample().fire));
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft'); // 5 ms depois, antes de qualquer quadro
    expect(fire).toEqual([true, false]);
    input.destroy();
  });

  it('cada tecla da diagonal avisa na hora; a repetição automática não', () => {
    const input = new GameInput(CLASSIC_BINDINGS);
    const controls: number[] = [];
    input.onChange(() => controls.push(input.sample().controls));
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowUp', true);
    key('keydown', 'ArrowRight');
    key('keyup', 'ArrowRight');
    expect(controls).toEqual([CONTROL.up, CONTROL.up | CONTROL.right, CONTROL.up]);
    input.destroy();
  });

  it('menu aberto solta as teclas e avisa', () => {
    const input = new GameInput(CLASSIC_BINDINGS);
    const controls: number[] = [];
    input.onChange(() => controls.push(input.sample().controls));
    key('keydown', 'ArrowLeft');
    input.setEnabled(false);
    expect(controls).toEqual([CONTROL.left, 0]);
    input.destroy();
  });
});
