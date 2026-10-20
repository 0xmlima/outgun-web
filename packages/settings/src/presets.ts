// SPDX-License-Identifier: GPL-2.0-or-later
// Presets de sala por modo de jogo (decisão D-10, RN-MOD, RN-CFG-01).
import { CLASSIC_GAMEMOD } from './classic-gamemod.js';
import { applyGamemod } from './gamemod.js';
import { SETTINGS_BY_NAME, type Category } from './registry.js';
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

/**
 * Carnificina (OG-290, D-52): o teto do jogo (32 itens) em qualquer mapa, reaparecendo no frame
 * seguinte, com tempos longos e quem morre deixando cair um item. Preset e `/carnage on`.
 */
export const CARNAGE_OVERRIDES = 'pups_min 32\npups_max 32\npups_respawn_time 0\npups_drop_at_death 1\npup_add_time 90\npup_max_time 300';

/** Linhas de gamemod com os valores atuais das settings que a Carnificina muda (para desfazê-la). */
export function carnageUndoLines(p: GameSettings['powerups']): string[] {
  return [
    `pups_min ${p.pupsMin}${p.pupsMinPercentage ? '%' : ''}`,
    `pups_max ${p.pupsMax}${p.pupsMaxPercentage ? '%' : ''}`,
    `pups_respawn_time ${p.pupsRespawnTime}`,
    `pups_drop_at_death ${p.pupsDropAtDeath ? 1 : 0}`,
    `pup_add_time ${p.pupAddTime}`,
    `pup_max_time ${p.pupMaxTime}`,
  ];
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
    id: 'carnage',
    mode: 'casual',
    locked: false,
    description: 'Carnificina: power-ups no máximo o tempo todo, com duração longa.',
    overrides: CARNAGE_OVERRIDES,
  },
  {
    id: 'ranked',
    mode: 'ranked',
    locked: true,
    description: 'Ranked: Clássico sem power-ups (RN-MOD-02) e sem bots (RN-MOD-06).',
    overrides: 'pups_min 0\npups_max 0\npups_drop_at_death 0\npup_start_shield 0\npup_start_turbo 0\npup_start_shadow 0\npup_start_power 0\npup_start_weapon 1\npup_start_deathbringer 0\nmin_bots 0\nbots_fill 0',
  },
];

/** Atraso padrão do espectador ao vivo, em segundos (D-56). */
export const SPECTATING_DELAY = 30;

/** Configurações do preset Clássico: defaults do código + `config/gamemod.txt`. */
export function classicSettings(): GameSettings {
  const result = applyGamemod(codeDefaults(), CLASSIC_GAMEMOD);
  if (result.errors.length > 0) throw new Error(`gamemod clássico inválido: ${result.errors[0]?.message}`);
  // espectador com 30 s de atraso em vez dos 120 do gamemod.txt (D-56, OG-318)
  return { ...result.settings, server: { ...result.settings.server, spectatingDelay: SPECTATING_DELAY } };
}

export function presetSettings(id: string): GameSettings {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`preset desconhecido: ${id}`);
  return settingsOf(preset);
}

/** Configurações de um preset qualquer: os do código ou os Casual criados no painel (OG-087). */
export function settingsOf(preset: Pick<Preset, 'id' | 'overrides'>): GameSettings {
  const result = applyGamemod(classicSettings(), preset.overrides);
  if (result.errors.length > 0) throw new Error(`preset ${preset.id} inválido: ${result.errors[0]?.message}`);
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

/** Grupos de regras que um preset Casual do painel pode mudar (as do servidor ficam com a operação). */
const CASUAL_PRESET_CATEGORIES: ReadonlySet<Category> = new Set(['game', 'health', 'powerups', 'physics', 'bots']);

/**
 * Problemas nas linhas de gamemod de um preset Casual do painel (OG-087): configuração
 * desconhecida, de servidor (nome, porta, rotação...) ou valor inválido. Vazio = pode salvar.
 */
export function casualPresetProblems(overrides: string): string[] {
  const problems: string[] = [];
  for (const raw of overrides.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const name = line.split(/\s+/)[0] as string;
    const def = SETTINGS_BY_NAME.get(name);
    if (!def) problems.push(`${name}: configuração desconhecida`);
    else if (!CASUAL_PRESET_CATEGORIES.has(def.category) && name !== 'max_players') problems.push(`${name}: configuração do servidor, não de preset`);
  }
  if (problems.length > 0) return problems;
  const result = applyGamemod(classicSettings(), overrides);
  return result.errors.map((e) => e.message);
}
