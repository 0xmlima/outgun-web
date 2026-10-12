// SPDX-License-Identifier: GPL-2.0-or-later
// Presets de sala por modo de jogo (decisão D-10, RN-MOD, RN-CFG-01).
import { CLASSIC_GAMEMOD } from './classic-gamemod.js';
import { applyGamemod } from './gamemod.js';
import { codeDefaults, type GameSettings } from './types.js';

export type GameMode = 'casual' | 'ranked';

export interface Preset {
  id: string;
  mode: GameMode;
  /** Presets travados não aceitam alterações de dono de sala nem `/set` (RN-MOD-04). */
  locked: boolean;
  description: string;
  /** Linhas de gamemod aplicadas sobre o Clássico. */
  overrides: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'classic',
    mode: 'casual',
    locked: false,
    description: 'Clássico: o gamemod distribuído com o Outgun 1.0.3, com power-ups.',
    overrides: '',
  },
  {
    id: 'duel',
    mode: 'casual',
    locked: false,
    description: 'Duelo: um contra um.',
    overrides: 'max_players 2\nbots_fill 0\nmin_bots 0',
  },
  {
    id: 'insta',
    mode: 'casual',
    locked: false,
    description: 'Insta: foguetes matam com um acerto.',
    overrides: 'rocket_damage 300',
  },
  {
    id: 'chaos',
    mode: 'casual',
    locked: false,
    description: 'Caos: muitos power-ups, reaparecendo rápido.',
    overrides: 'pups_min 40%\npups_max 100%\npups_respawn_time 10',
  },
  {
    id: 'ranked',
    mode: 'ranked',
    locked: true,
    description: 'Ranked: Clássico sem power-ups (RN-MOD-02).',
    overrides: 'pups_min 0\npups_max 0\npups_drop_at_death 0\npup_start_shield 0\npup_start_turbo 0\npup_start_shadow 0\npup_start_power 0\npup_start_weapon 1\npup_start_deathbringer 0',
  },
];

/** Configurações do preset Clássico: defaults do código + `config/gamemod.txt`. */
export function classicSettings(): GameSettings {
  const result = applyGamemod(codeDefaults(), CLASSIC_GAMEMOD);
  if (result.errors.length > 0) throw new Error(`gamemod clássico inválido: ${result.errors[0]?.message}`);
  return result.settings;
}

export function presetSettings(id: string): GameSettings {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`preset desconhecido: ${id}`);
  const result = applyGamemod(classicSettings(), preset.overrides);
  if (result.errors.length > 0) throw new Error(`preset ${id} inválido: ${result.errors[0]?.message}`);
  return result.settings;
}

/** O preset Ranked não tem power-ups em nenhuma forma. */
export function hasNoPowerups(settings: GameSettings): boolean {
  const p = settings.powerups;
  return (
    p.pupsMax === 0 &&
    p.pupsMin === 0 &&
    !p.pupsDropAtDeath &&
    !p.startShield &&
    p.startTurbo === 0 &&
    p.startShadow === 0 &&
    p.startPower === 0 &&
    p.startWeapon === 1 &&
    !p.startDeathbringer
  );
}
