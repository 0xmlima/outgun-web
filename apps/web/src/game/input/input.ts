// SPDX-License-Identifier: GPL-2.0-or-later
// Entrada do jogo: teclado (com as associações do jogador), gamepad e modo foco
// (plan/specs/entrada.md). Produz os controles de cada frame e avisa as ações de toque.
import { CONTROL } from '@outgun/sim';
import { boundCodes, controlBits, heldActions, pressedActions, type Bindings, type HeldAction, type PressAction } from './bindings.js';

export interface InputSample {
  /** Bits de `CONTROL` (movimento, correr, esquivar). */
  readonly controls: number;
  readonly fire: boolean;
  readonly dropFlag: boolean;
  readonly showPings: boolean;
}

/** Gamepad no layout "standard": botões 0/1/2 como os botões 1/2/3 do joystick do original. */
export const GAMEPAD = { fire: 0, run: 1, strafe: 2, start: 9, dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15, threshold: 0.5 } as const;

/** Bits e tiro de um gamepad (`ClientControls::fromJoystick`). */
export function gamepadSample(pad: Pick<Gamepad, 'axes' | 'buttons'>): { controls: number; fire: boolean; start: boolean } {
  const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  let controls = 0;
  if (y < -GAMEPAD.threshold || pressed(GAMEPAD.dpadUp)) controls |= CONTROL.up;
  if (y > GAMEPAD.threshold || pressed(GAMEPAD.dpadDown)) controls |= CONTROL.down;
  if (x < -GAMEPAD.threshold || pressed(GAMEPAD.dpadLeft)) controls |= CONTROL.left;
  if (x > GAMEPAD.threshold || pressed(GAMEPAD.dpadRight)) controls |= CONTROL.right;
  if (pressed(GAMEPAD.run)) controls |= CONTROL.run;
  if (pressed(GAMEPAD.strafe)) controls |= CONTROL.strafe;
  return { controls, fire: pressed(GAMEPAD.fire), start: pressed(GAMEPAD.start) };
}

/** Atalhos do navegador que o jogo segura mesmo sem associação (Alt sozinho, Ctrl+setas...). */
function shouldPrevent(ev: KeyboardEvent, codes: ReadonlySet<string>): boolean {
  if (codes.has(ev.code)) return true;
  // com Ctrl ou Alt do tiro/esquiva segurados, setas e teclas do jogo viram atalhos do navegador
  return (ev.ctrlKey || ev.altKey) && /^(Arrow|Numpad|Page|Home|End|Delete|Insert)/.test(ev.code);
}

export class GameInput {
  private readonly pressed = new Set<string>();
  private codes: Set<string>;
  private startWasPressed = false;
  private readonly listeners: ((action: PressAction | 'menu') => void)[] = [];
  private enabled = true;

  constructor(private bindings: Bindings) {
    this.codes = boundCodes(bindings);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.release);
  }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
    this.codes = boundCodes(bindings);
  }

  /** Com o menu aberto, o jogo não lê teclas (as teclas soltam). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.release();
  }

  onAction(listener: (action: PressAction | 'menu') => void): () => void {
    this.listeners.push(listener);
    return () => this.listeners.splice(this.listeners.indexOf(listener), 1);
  }

  private emit(action: PressAction | 'menu'): void {
    for (const l of [...this.listeners]) l(action);
  }

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    if (!this.enabled || ev.key === 'Escape') return;
    if (shouldPrevent(ev, this.codes)) ev.preventDefault();
    this.pressed.add(ev.code);
    if (!ev.repeat) for (const action of pressedActions(this.bindings, ev)) this.emit(action);
  };

  private readonly onKeyUp = (ev: KeyboardEvent) => {
    this.pressed.delete(ev.code);
    // Alt solto sozinho ativa a barra de menus no Windows/Firefox
    if (this.enabled && (ev.code === 'AltLeft' || ev.code === 'AltRight')) ev.preventDefault();
  };

  /** Solta tudo (perda de foco: troca de aba, menu aberto). */
  private readonly release = () => {
    this.pressed.clear();
  };

  /** Controles do frame: teclado + gamepads. */
  sample(): InputSample {
    const held: Set<HeldAction> = this.enabled ? heldActions(this.bindings, this.pressed) : new Set();
    let controls = controlBits(held);
    let fire = held.has('fire');
    let start = false;
    for (const pad of typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!pad || !this.enabled) continue;
      const s = gamepadSample(pad);
      controls |= s.controls;
      fire ||= s.fire;
      start ||= s.start;
    }
    if (start && !this.startWasPressed) this.emit('menu');
    this.startWasPressed = start;
    return { controls, fire, dropFlag: held.has('dropFlag'), showPings: held.has('showPings') };
  }

  destroy(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.release);
  }
}

/**
 * Modo foco: tela cheia com o teclado travado (Chrome/Edge capturam até Ctrl+W, Ctrl+T e Ctrl+N)
 * e o ponteiro escondido. Liga e desliga.
 */
export async function toggleFocusMode(element: HTMLElement): Promise<boolean> {
  const nav = navigator as Navigator & { keyboard?: { lock?: () => Promise<void>; unlock?: () => void } };
  if (document.fullscreenElement) {
    nav.keyboard?.unlock?.();
    if (document.pointerLockElement) document.exitPointerLock();
    await document.exitFullscreen();
    return false;
  }
  await element.requestFullscreen();
  await nav.keyboard?.lock?.().catch(() => undefined);
  try {
    await element.requestPointerLock();
  } catch {
    // ponteiro visível: sem problema
  }
  return true;
}
