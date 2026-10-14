// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { padKeys, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS, type PadState } from './gamepad.js';

const press = (...buttons: number[]) => ({ buttons: Array.from({ length: 16 }, (_, i) => buttons.includes(i)), axes: [0, 0] });
const idle = { buttons: [], axes: [] };

describe('gamepad nas telas (OG-200)', () => {
  it('direcional, A e B viram setas, Enter e Esc só ao apertar', () => {
    let state: PadState = new Map();
    let r = padKeys(state, press(13, 0), 0);
    expect(r.keys.sort()).toEqual(['ArrowDown', 'Enter']);
    state = r.state;
    r = padKeys(state, press(13, 0), 50);
    expect(r.keys).toEqual([]);
    r = padKeys(r.state, idle, 60);
    r = padKeys(r.state, press(1), 70);
    expect(r.keys).toEqual(['Escape']);
  });

  it('seta segurada repete depois da espera; Enter segurado não repete', () => {
    let r = padKeys(new Map(), press(15, 0), 0);
    r = padKeys(r.state, press(15, 0), REPEAT_DELAY_MS);
    expect(r.keys).toEqual(['ArrowRight']);
    r = padKeys(r.state, press(15, 0), REPEAT_DELAY_MS + REPEAT_INTERVAL_MS - 1);
    expect(r.keys).toEqual([]);
    r = padKeys(r.state, press(15, 0), REPEAT_DELAY_MS + REPEAT_INTERVAL_MS);
    expect(r.keys).toEqual(['ArrowRight']);
  });

  it('o analógico esquerdo também navega', () => {
    expect(padKeys(new Map(), { buttons: [], axes: [0, -0.9] }, 0).keys).toEqual(['ArrowUp']);
    expect(padKeys(new Map(), { buttons: [], axes: [0.8, 0] }, 0).keys).toEqual(['ArrowRight']);
    expect(padKeys(new Map(), { buttons: [], axes: [0.3, 0.3] }, 0).keys).toEqual([]);
  });
});
