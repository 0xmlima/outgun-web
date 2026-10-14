// SPDX-License-Identifier: GPL-2.0-or-later
// Gamepad nas telas fora da partida (OG-200, RN-UI-01): o direcional e o analógico esquerdo viram
// setas, A vira Enter, B vira Esc e LB/RB pulam para o controle anterior/seguinte (como Shift+Tab e
// Tab: saem de uma lista para a barra superior ou uma tabela), com repetição ao segurar. As teclas
// são entregues ao elemento em foco como eventos de teclado, então todo componente que funciona por
// teclado funciona por gamepad.
import { useEffect } from 'react';

/** Botões do mapeamento "standard" da Gamepad API. */
const PAD_KEYS: readonly (readonly [button: number, key: string])[] = [
  [12, 'ArrowUp'],
  [13, 'ArrowDown'],
  [14, 'ArrowLeft'],
  [15, 'ArrowRight'],
  [0, 'Enter'],
  [1, 'Escape'],
  [4, 'FocusPrevious'],
  [5, 'FocusNext'],
];
const AXIS_THRESHOLD = 0.5;
export const REPEAT_DELAY_MS = 400;
export const REPEAT_INTERVAL_MS = 120;

export interface PadInput {
  readonly buttons: readonly boolean[];
  readonly axes: readonly number[];
}

/** Para cada tecla segurada: quando a próxima repetição sai. */
export type PadState = ReadonlyMap<string, number>;

function heldKeys({ buttons, axes }: PadInput): Set<string> {
  const held = new Set<string>();
  for (const [button, key] of PAD_KEYS) if (buttons[button]) held.add(key);
  const [x = 0, y = 0] = axes;
  if (y <= -AXIS_THRESHOLD) held.add('ArrowUp');
  if (y >= AXIS_THRESHOLD) held.add('ArrowDown');
  if (x <= -AXIS_THRESHOLD) held.add('ArrowLeft');
  if (x >= AXIS_THRESHOLD) held.add('ArrowRight');
  return held;
}

/** Teclas a disparar agora: as recém-apertadas e as setas seguradas na hora da repetição. */
export function padKeys(state: PadState, input: PadInput, now: number): { state: PadState; keys: string[] } {
  const next = new Map<string, number>();
  const keys: string[] = [];
  for (const key of heldKeys(input)) {
    const due = state.get(key);
    if (due === undefined) {
      keys.push(key);
      next.set(key, now + REPEAT_DELAY_MS);
    } else if (key.startsWith('Arrow') && now >= due) {
      keys.push(key);
      next.set(key, now + REPEAT_INTERVAL_MS);
    } else next.set(key, due);
  }
  return { state: next, keys };
}

const TABBABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Tab sintético não move o foco: anda pelos controles alcançáveis por Tab na ordem do documento. */
function moveFocus(step: 1 | -1): void {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (all.length === 0) return;
  const index = all.indexOf(document.activeElement as HTMLElement);
  const next = index < 0 ? (step > 0 ? 0 : all.length - 1) : (index + step + all.length) % all.length;
  all[next]?.focus();
}

/** Entrega a tecla ao elemento em foco; Enter que nenhum componente tratou vira clique. */
export function dispatchKey(key: string): void {
  if (key === 'FocusNext' || key === 'FocusPrevious') {
    moveFocus(key === 'FocusNext' ? 1 : -1);
    return;
  }
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  const handled = !target.dispatchEvent(event);
  if (!handled && key === 'Enter' && target !== document.body) target.click();
}

/** Liga o gamepad às telas enquanto o componente que chama estiver montado. */
export function useGamepadKeys(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let state: PadState = new Map();
    let frame = 0;
    const poll = () => {
      const pad = [...navigator.getGamepads()].find((p) => p?.connected);
      const input: PadInput = pad
        ? { buttons: pad.buttons.map((b) => b.pressed), axes: pad.axes }
        : { buttons: [], axes: [] };
      const result = padKeys(state, input, performance.now());
      state = result.state;
      for (const key of result.keys) dispatchKey(key);
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
}
