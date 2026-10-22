// SPDX-License-Identifier: GPL-2.0-or-later
// Tolerância de diagonal (OG-372, D-72): mãos humanas apertam e soltam "juntas" com 10 a 40 ms de
// diferença. O servidor vira a arma a cada input sem strafe, então soltar ↑→ com o → primeiro, ou
// apertar a seta um pouco antes do Alt, apontava a arma para onde o jogador não queria. Durante a
// janela, o estado que viraria a arma sai com strafe provisório: o boneco anda na hora (strafe não
// muda a física), só a arma espera o resto do acorde. Sem equivalente no original.
import { CONTROL, controlDirection, isStrafe } from '@outgun/sim';

export const CHORD_WINDOW_DEFAULT_MS = 30;
export const CHORD_WINDOW_MAX_MS = 60;

export class ChordFilter {
  /** Direção para a qual a arma apontou pela última vez por nossos controles (−1 = não sabemos). */
  private aim = -1;
  /** Início da janela aberta, ou null. */
  private since: number | null = null;

  constructor(public windowMs = CHORD_WINDOW_DEFAULT_MS) {}

  /** Controles a enviar para os controles reais `raw` agora. */
  filter(raw: number, now: number): number {
    const dir = controlDirection(raw);
    // com strafe, sem direção ou na mesma direção, a arma não vira: vale o estado real
    if (this.windowMs <= 0 || isStrafe(raw) || dir === -1 || dir === this.aim) {
      this.since = null;
      if (this.windowMs <= 0 && dir !== -1 && !isStrafe(raw)) this.aim = dir;
      return raw;
    }
    this.since ??= now;
    if (now - this.since < this.windowMs) return raw | CONTROL.strafe;
    return this.turn(raw, dir);
  }

  /** Tiro: a arma vira já para a direção atual, antes de o tiro sair. */
  flush(raw: number): number {
    const dir = controlDirection(raw);
    return dir === -1 || isStrafe(raw) ? raw : this.turn(raw, dir);
  }

  /** Quando a janela aberta acaba (para ler os controles de novo), ou null. */
  deadline(): number | null {
    return this.since === null ? null : this.since + this.windowMs;
  }

  private turn(raw: number, dir: number): number {
    this.since = null;
    this.aim = dir;
    return raw;
  }
}
