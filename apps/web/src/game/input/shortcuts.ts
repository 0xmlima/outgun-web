// SPDX-License-Identifier: GPL-2.0-or-later
// Atalhos que o navegador ou o sistema tomam antes do jogo (OG-232): avisam na tela de controles e
// dão o nome certo das teclas no Mac (Alt é Option).
import type { Chord } from './bindings.js';

type NavigatorWithPlatform = Navigator & { userAgentData?: { platform?: string } };

/** macOS (ou iPad com teclado): Alt se chama Option e Cmd+número troca de aba. */
export const IS_MAC: boolean =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test((navigator as NavigatorWithPlatform).userAgentData?.platform ?? navigator.platform ?? '');

/** Nome do Alt nesta plataforma. */
export const altName = (mac = IS_MAC): string => (mac ? 'Option' : 'Alt');

const BROWSER_CTRL = /^(Key[WTNQ]|Tab|PageUp|PageDown|Digit\d)$/;

/**
 * Acorde que o navegador ou o sistema costumam tomar fora do modo foco: Ctrl+W/T/N/Q/Tab/PageUp/PageDown
 * e Ctrl+número (abas, fora do Mac), Alt+Tab e Alt+F4 (Windows/Linux), Alt+número (abas no Firefox
 * do Windows/Linux) e, no Mac, Ctrl+setas e Ctrl+espaço (Mission Control e troca de idioma).
 */
export function reservedChord(chord: Chord, mac = IS_MAC): boolean {
  const { code, ctrl, alt } = chord;
  if (mac) return !!ctrl && (/^Arrow/.test(code) || code === 'Space' || code === 'Tab');
  if (ctrl && BROWSER_CTRL.test(code)) return true;
  if (alt && (code === 'Tab' || code === 'F4' || /^Digit\d$/.test(code))) return true;
  return false;
}
