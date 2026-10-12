// SPDX-License-Identifier: GPL-2.0-or-later
// Execução de paridade: a simulação TS reproduz cada frame do trace e é comparada com o original.
import type { Rng } from '@outgun/sim';
import { firstDifference, type CompareOptions, type Difference } from './compare.js';
import type { Trace, TraceHeader, TraceState } from './trace.js';

/** Devolve, em ordem, os rand() que o original consumiu no frame. */
export class RecordedRng implements Rng {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  rand(): number {
    const value = this.values[this.index];
    if (value === undefined) {
      throw new Error(`a simulação pediu mais rand() que o original (${this.values.length} no frame)`);
    }
    this.index++;
    return value;
  }

  /** Quantos valores gravados ainda não foram consumidos. */
  remaining(): number {
    return this.values.length - this.index;
  }
}

/**
 * Ponte entre o trace e a simulação TS. Cada card do épico E2 implementa (ou estende) um adaptador.
 */
export interface SimAdapter {
  /** Prepara a simulação para o trace (mapa, settings). Chamado uma vez. */
  setup(header: TraceHeader): void;
  /** Carrega o estado do original ("pre" do frame). */
  load(state: TraceState): void;
  /** Simula um frame com a aleatoriedade e o tempo informados e devolve o estado no formato do trace. */
  step(rng: Rng, time: number): TraceState;
}

export type ParityMode =
  /** Carrega o "pre" do original em todo frame: testa a lógica de cada frame isoladamente. */
  | 'resync'
  /** Carrega só o primeiro frame e deixa a simulação andar sozinha (exige ausência de eventos externos). */
  | 'free';

export interface ParityOptions extends CompareOptions {
  mode?: ParityMode;
  /**
   * Recorta o que é comparado (o card de movimento compara só posição e velocidade, por exemplo).
   * Aplicado ao estado esperado e ao obtido.
   */
  select?: (state: TraceState) => unknown;
  /** Exige que a simulação consuma exatamente os rand() do frame (padrão: true). */
  checkRandCount?: boolean;
}

export interface ParityFailure {
  frame: number;
  difference: Difference;
  /** Estado esperado do frame anterior (contexto para depuração). */
  previous: TraceState | undefined;
}

export interface ParityResult {
  framesChecked: number;
  failure?: ParityFailure;
}

/** Roda o trace na simulação e para na primeira divergência. */
export function runParity(trace: Trace, adapter: SimAdapter, options: ParityOptions = {}): ParityResult {
  const mode = options.mode ?? 'resync';
  const select = options.select ?? ((state: TraceState) => state);
  adapter.setup(trace.header);
  let previous: TraceState | undefined;
  for (const [index, frame] of trace.frames.entries()) {
    if (mode === 'resync' || index === 0) adapter.load(frame.pre);
    const rng = new RecordedRng(frame.rand);
    let actual: TraceState;
    try {
      actual = adapter.step(rng, frame.pre.time);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        framesChecked: index,
        failure: { frame: frame.frame, difference: { path: '(exceção)', expected: 'sem erro', actual: message }, previous },
      };
    }
    const difference = firstDifference(select(frame.post), select(actual), options);
    if (difference) return { framesChecked: index, failure: { frame: frame.frame, difference, previous } };
    if ((options.checkRandCount ?? true) && rng.remaining() !== 0) {
      return {
        framesChecked: index,
        failure: {
          frame: frame.frame,
          difference: { path: 'rand.consumidos', expected: frame.rand.length, actual: frame.rand.length - rng.remaining() },
          previous,
        },
      };
    }
    previous = frame.post;
  }
  return { framesChecked: trace.frames.length };
}

/** Mensagem legível para relatórios de teste e de CI. */
export function formatFailure(name: string, result: ParityResult): string {
  if (!result.failure) return `${name}: ${result.framesChecked} frames idênticos ao original`;
  const { frame, difference } = result.failure;
  return [
    `${name}: divergência no frame ${frame} (após ${result.framesChecked} frames corretos)`,
    `  campo:    ${difference.path}`,
    `  original: ${JSON.stringify(difference.expected)}`,
    `  sim TS:   ${JSON.stringify(difference.actual)}`,
  ].join('\n');
}
