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
/** Botões de toque no Ranked (OG-264): Select pausa; no voto, Y = bot e X = um a menos (o jogo está parado). */
const GAMEPAD_PRESS: readonly [number, PressAction][] = [
  [8, 'pause'],
  [3, 'voteBot'],
  [2, 'voteShort'],
];

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
  private readonly padWasPressed = new Set<number>();
  private readonly listeners: ((action: PressAction | 'menu') => void)[] = [];
  private readonly changeListeners: (() => void)[] = [];
  private enabled = true;
  /** Momento (`performance.now()`) da última tecla do jogo apertada ou solta (OG-369). */
  lastChangeAt = 0;

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

  isEnabled(): boolean {
    return this.enabled;
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

  /**
   * Uma tecla do jogo foi apertada ou solta (OG-371): quem joga online lê os controles e envia na
   * hora, sem esperar o próximo quadro. Um toque mais curto que um quadro não se perde.
   */
  onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => this.changeListeners.splice(this.changeListeners.indexOf(listener), 1);
  }

  private changed(at: number): void {
    this.lastChangeAt = at;
    for (const l of [...this.changeListeners]) l();
  }

  private emit(action: PressAction | 'menu'): void {
    for (const l of [...this.listeners]) l(action);
  }

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    if (!this.enabled || ev.key === 'Escape') return;
    if (shouldPrevent(ev, this.codes)) ev.preventDefault();
    const fresh = !this.pressed.has(ev.code);
    this.pressed.add(ev.code);
    if (fresh && this.codes.has(ev.code)) this.changed(ev.timeStamp);
    if (!ev.repeat) for (const action of pressedActions(this.bindings, ev)) this.emit(action);
  };

  private readonly onKeyUp = (ev: KeyboardEvent) => {
    if (this.pressed.delete(ev.code) && this.enabled && this.codes.has(ev.code)) this.changed(ev.timeStamp);
    // Alt solto sozinho ativa a barra de menus no Windows/Firefox
    if (this.enabled && (ev.code === 'AltLeft' || ev.code === 'AltRight')) ev.preventDefault();
  };

  /** Solta tudo (perda de foco: troca de aba, menu aberto). */
  private readonly release = () => {
    if (!this.pressed.size) return;
    this.pressed.clear();
    this.changed(performance.now());
  };

  /** Controles do frame: teclado + gamepads. */
  sample(): InputSample {
    const held: Set<HeldAction> = this.enabled ? heldActions(this.bindings, this.pressed) : new Set();
    let controls = controlBits(held);
    let fire = held.has('fire');
    let start = false;
    const padPressed = new Set<number>();
    for (const pad of typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!pad || !this.enabled) continue;
      const s = gamepadSample(pad);
      controls |= s.controls;
      fire ||= s.fire;
      start ||= s.start;
      for (const [button] of GAMEPAD_PRESS) if (pad.buttons[button]?.pressed) padPressed.add(button);
    }
    for (const [button, action] of GAMEPAD_PRESS) if (padPressed.has(button) && !this.padWasPressed.has(button)) this.emit(action);
    this.padWasPressed.clear();
    for (const b of padPressed) this.padWasPressed.add(b);
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
 * Modo foco: tela cheia com o teclado travado (Chrome/Edge capturam até Ctrl+W, Ctrl+T e Ctrl+N).
 * O ponteiro some só sobre o jogo, pelo CSS (`.game:fullscreen`): sem trava de ponteiro, o mouse
 * continua servindo nas telas e no menu que abrem por cima (OG-315). Liga e desliga.
 */
export async function toggleFocusMode(element: HTMLElement): Promise<boolean> {
  const nav = navigator as Navigator & { keyboard?: { lock?: () => Promise<void>; unlock?: () => void } };
  if (document.fullscreenElement) {
    nav.keyboard?.unlock?.();
    await document.exitFullscreen();
    return false;
  }
  await element.requestFullscreen();
  await nav.keyboard?.lock?.().catch(() => undefined);
  return true;
}
