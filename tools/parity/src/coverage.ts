// SPDX-License-Identifier: GPL-2.0-or-later
// O que cada golden trace verifica hoje na simulação TS. Cada card do épico E2 amplia esta tabela:
// troca `pending` por um recorte de campos (ou amplia o recorte) e o CI passa a exigir paridade.
import type { ParityMode } from './run.js';
import { movementFields } from './sim-adapter.js';
import type { TraceState } from './trace.js';

export interface CoverageEntry {
  trace: string;
  /** Campos comparados; ausente = trace ainda não coberto pela sim. */
  select?: (state: TraceState) => unknown;
  modes: ParityMode[];
  /** Card que cobre (ou cobrirá) o trace. */
  card: string;
  note?: string;
  /** Verificado por outro pacote (ex.: cabeçalho de settings em @outgun/settings). */
  external?: boolean;
}

const movement = (trace: string): CoverageEntry => ({ trace, select: movementFields, modes: ['resync', 'free'], card: 'OG-021' });

export const COVERAGE: readonly CoverageEntry[] = [
  movement('move-straight'),
  movement('move-run'),
  movement('move-diagonal'),
  movement('move-brake-turn'),
  movement('move-turbo'),
  movement('bounce-triangle'),
  movement('bounce-circle'),
  movement('wrap-edge'),
  { trace: 'shoot-level1', modes: [], card: 'OG-022', note: 'tiro, foguetes e energia' },
  { trace: 'shoot-level9', modes: [], card: 'OG-022', note: 'formação de 9 foguetes' },
  { trace: 'rocket-hit', modes: [], card: 'OG-024', note: 'dano, morte e respawn (OG-029)' },
  { trace: 'flag-capture', modes: [], card: 'OG-027', note: 'bandeiras e captura' },
  { trace: 'bots-match', modes: [], card: 'OG-029', note: 'partida completa' },
  { trace: 'settings-classic', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
  { trace: 'settings-edge', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
  { trace: 'settings-no-powerups', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
  { trace: 'settings-zero-chances', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
];
