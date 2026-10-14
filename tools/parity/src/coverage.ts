// SPDX-License-Identifier: GPL-2.0-or-later
// O que cada golden trace verifica hoje na simulação TS. Cada card do épico E2 amplia esta tabela:
// troca `pending` por um recorte de campos (ou amplia o recorte) e o CI passa a exigir paridade.
import type { ParityMode } from './run.js';
import { combatFields, flagFields } from './sim-adapter.js';
import type { TraceState } from './trace.js';

export interface CoverageEntry {
  trace: string;
  /** Campos comparados; ausente = trace ainda não coberto pela sim. */
  select?: (state: TraceState) => unknown;
  modes: ParityMode[];
  /** Só os primeiros N frames (o resto depende de um card futuro, indicado em `note`). */
  frames?: number;
  /** Card que cobre (ou cobrirá) o trace. */
  card: string;
  note?: string;
  /** Verificado por outro pacote (ex.: cabeçalho de settings em @outgun/settings). */
  external?: boolean;
}

/** Desde o OG-024, todo trace coberto compara o estado completo dos jogadores, foguetes e times. */
const movement = (trace: string): CoverageEntry => ({ trace, select: combatFields, modes: ['resync', 'free'], card: 'OG-021' });

export const COVERAGE: readonly CoverageEntry[] = [
  movement('move-straight'),
  movement('move-run'),
  movement('move-diagonal'),
  movement('move-brake-turn'),
  movement('move-turbo'),
  movement('bounce-triangle'),
  movement('bounce-circle'),
  movement('wrap-edge'),
  { trace: 'shoot-level1', select: combatFields, modes: ['resync', 'free'], card: 'OG-022' },
  { trace: 'shoot-level9', select: combatFields, modes: ['resync', 'free'], card: 'OG-022' },
  { trace: 'rocket-hit', select: combatFields, modes: ['resync', 'free'], card: 'OG-024' },
  { trace: 'collide-normal', select: combatFields, modes: ['resync', 'free'], card: 'OG-023' },
  { trace: 'collide-special-shield', select: combatFields, modes: ['resync', 'free'], card: 'OG-023' },
  { trace: 'collide-special-power', select: combatFields, modes: ['resync', 'free'], card: 'OG-023' },
  { trace: 'collide-special-turbo-shadow', select: combatFields, modes: ['resync', 'free'], card: 'OG-023' },
  { trace: 'collide-special-deathbringer', select: combatFields, modes: ['resync', 'free'], card: 'OG-023' },
  { trace: 'shield-rockets', select: combatFields, modes: ['resync', 'free'], card: 'OG-024' },
  { trace: 'shield-hits', select: combatFields, modes: ['resync', 'free'], card: 'OG-024' },
  { trace: 'pup-collect-all', select: combatFields, modes: ['resync', 'free'], card: 'OG-025' },
  { trace: 'pup-limit', select: combatFields, modes: ['resync', 'free'], card: 'OG-025' },
  { trace: 'pup-stack-time', select: combatFields, modes: ['resync', 'free'], card: 'OG-025' },
  { trace: 'pup-team-share', select: combatFields, modes: ['resync', 'free'], card: 'OG-025' },
  { trace: 'pup-respawn', select: combatFields, modes: ['resync', 'free'], card: 'OG-025' },
  { trace: 'pup-drop-at-death', select: combatFields, modes: ['resync', 'free'], card: 'OG-025' },
  { trace: 'db-explosion', select: combatFields, modes: ['resync', 'free'], card: 'OG-026' },
  { trace: 'db-friendly', select: combatFields, modes: ['resync', 'free'], card: 'OG-026' },
  { trace: 'flag-capture', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'flag-drop-return', select: flagFields, modes: ['resync', 'free'], card: 'OG-027' },
  { trace: 'flag-suicide', select: flagFields, modes: ['resync', 'free'], card: 'OG-027' },
  { trace: 'flag-assist', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'flag-wild-capture', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'flag-wild-base', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'flag-carry-own', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'flag-locks', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'flag-carrying-score', select: flagFields, modes: ['resync'], card: 'OG-027', note: 'teletransportes no meio do roteiro: só resync' },
  { trace: 'bots-match', select: flagFields, modes: ['resync', 'free'], card: 'OG-029' },
  // Cenários da IA dos bots (OG-051..053): as decisões ficam em NOME.bots.jsonl.gz e são conferidas em
  // @outgun/bots; o trace da sim do mesmo jogo é conferido aqui em resync.
  ...['bots-ai-outgun1', 'bots-ai-verde', 'bots-ai-freeturn', 'bots-ai-ksii', 'bots-ai-deathbringer'].map(
    (trace): CoverageEntry => ({ trace, select: flagFields, modes: ['resync'], card: 'OG-051' }),
  ),
  { trace: 'respawn-order', select: flagFields, modes: ['resync', 'free'], card: 'OG-029' },
  { trace: 'match-time-win', select: flagFields, modes: ['resync'], card: 'OG-029', note: 'reinício do mapa fora do frame (start_game): só resync' },
  { trace: 'match-sudden-death', select: flagFields, modes: ['resync'], card: 'OG-029', note: 'reinício do mapa fora do frame (start_game): só resync' },
  { trace: 'match-extra-time', select: flagFields, modes: ['resync'], card: 'OG-029', note: 'reinício do mapa fora do frame (start_game): só resync' },
  { trace: 'settings-classic', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
  { trace: 'settings-edge', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
  { trace: 'settings-no-powerups', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
  { trace: 'settings-zero-chances', modes: [], card: 'OG-030', note: 'cabeçalho conferido em @outgun/settings', external: true },
];
