// SPDX-License-Identifier: GPL-2.0-or-later
// Formulário de preset Casual do painel (OG-382): as regras que um preset pode mudar, com rótulo,
// controle pelo tipo e faixa, e a ida e volta entre os valores do formulário e as linhas de gamemod.
import { applySetting } from './gamemod.js';
import { classicSettings, CASUAL_PRESET_CATEGORIES } from './presets.js';
import { SETTINGS, type Category, type SettingDef } from './registry.js';
import { settingValue } from './console.js';
import type { GameSettings } from './types.js';

/** Controle do formulário: caixa, número, porcentagem, "itens ou %" (power-ups) ou lista. */
export type PresetControl = 'bool' | 'number' | 'percent' | 'itemsOrPercent' | 'choice';

export interface PresetField {
  def: SettingDef;
  /** Rótulo em inglês (chave do i18n), com a unidade. */
  label: string;
  control: PresetControl;
  min?: number;
  max?: number;
  /** 0 também vale (desliga), fora da faixa. */
  allow0?: boolean;
  integer?: boolean;
  options?: readonly string[];
}

/** Rótulos das regras (chaves do i18n); só as que aparecem no formulário. */
const LABELS: Readonly<Record<string, string>> = {
  max_players: 'Max players (even number)',
  // bots
  min_bots: 'Minimum bots',
  bots_fill: 'Fill with bots up to (players)',
  balance_bot: 'Bot balances the teams',
  bot_ping: 'Bot ping (ms)',
  // jogo
  capture_limit: 'Captures to win (0 = no limit)',
  win_score_difference: 'Lead needed to win (captures)',
  time_limit: 'Time limit (minutes, 0 = none)',
  extra_time: 'Extra time (minutes)',
  extra_time_periods: 'Extra time periods',
  sudden_death: 'Sudden death',
  game_end_delay: 'Pause between matches (seconds)',
  game_end_delay_extension: 'Extra pause per player (seconds)',
  flag_return_delay: 'Dropped flag returns after (seconds)',
  min_capture_time: 'Minimum time to capture (seconds)',
  carrying_score_time: 'Carrying the flag scores every (seconds, 0 = off)',
  random_wild_flag: 'Wild flag in a random place',
  lock_team_flags: 'Team flags locked',
  lock_wild_flags: 'Wild flags locked',
  capture_on_team_flag: 'Capture on your own flag',
  capture_on_wild_flag: 'Capture on a wild flag',
  capture_away_from_base: 'Capture away from the base',
  carry_own_team_flag: 'Carry your own flag',
  always_send_flag_location: 'Flags always visible on the minimap',
  balance_teams: 'Team balance',
  respawn_time: 'Respawn time (seconds)',
  extra_respawn_time_alone: 'Extra respawn time when alone (seconds)',
  respawn_balancing_time: 'Respawn balancing time (seconds)',
  waiting_time_deathbringer: 'Respawn wait after a deathbringer (seconds)',
  spawn_safe_time: 'Spawn protection (seconds)',
  respawn_on_capture: 'Everyone respawns on capture',
  free_turning: 'Free turning',
  minimap_send_limit: 'Players shown on the minimap',
  see_rockets_distance: 'See rockets up to (rooms)',
  see_minimap_player_properties: 'Player details on the minimap (0 to 2)',
  // vida, energia e tiro
  friendly_fire: 'Friendly fire',
  friendly_deathbringer: 'Friendly deathbringer',
  rocket_damage: 'Rocket damage',
  start_health: 'Starting health',
  start_energy: 'Starting energy',
  health_max: 'Maximum health',
  energy_max: 'Maximum energy',
  health_regeneration_0_to_100: 'Health regeneration 0-100 (per second)',
  health_regeneration_100_to_200: 'Health regeneration 100-200 (per second)',
  health_regeneration_200_to_max: 'Health regeneration above 200 (per second)',
  energy_regeneration_0_to_100: 'Energy regeneration 0-100 (per second)',
  energy_regeneration_100_to_200: 'Energy regeneration 100-200 (per second)',
  energy_regeneration_200_to_max: 'Energy regeneration above 200 (per second)',
  min_health_for_run_penalty: 'Running costs health above',
  run_health_degradation: 'Health lost running (per second)',
  run_energy_degradation: 'Energy lost running (per second)',
  shooting_energy_base: 'Energy per shot',
  shooting_energy_per_extra_rocket: 'Energy per extra rocket',
  hit_stun_time: 'Stun when hit (seconds)',
  shoot_interval: 'Time between shots (seconds)',
  shoot_interval_with_energy: 'Time between shots with energy (seconds)',
  // power-ups
  pups_min: 'Power-ups on the map, minimum (items or % of rooms)',
  pups_max: 'Power-ups on the map, maximum (items or % of rooms)',
  pups_respawn_time: 'Power-up respawn (seconds)',
  pup_add_time: 'Time added per power-up (seconds)',
  pup_max_time: 'Maximum power-up time (seconds)',
  pups_drop_at_death: 'Power-ups drop on death',
  pups_player_max: 'Power-ups per player',
  pup_weapon_max: 'Maximum weapon level',
  pup_health_bonus: 'Megahealth bonus',
  pup_power_damage: 'Power damage multiplier',
  pup_deathbringer_time: 'Deathbringer duration (seconds)',
  pup_deathbringer_switch: 'Deathbringer can be switched off',
  pup_deathbringer_health_limit: 'Deathbringer health limit',
  pup_deathbringer_energy_limit: 'Deathbringer energy limit',
  pup_deathbringer_health_degradation: 'Deathbringer health loss (per second)',
  pup_deathbringer_energy_degradation: 'Deathbringer energy loss (per second)',
  pup_shadow_invisibility: 'Shadow is fully invisible (0 or 1)',
  pup_shadow_see_shadow: 'Shadow sees shadows',
  pup_shield_one_hit: 'Shield hits (0 = unlimited)',
  pup_chance_shield: 'Chance of shield',
  pup_chance_turbo: 'Chance of turbo',
  pup_chance_shadow: 'Chance of shadow',
  pup_chance_power: 'Chance of power',
  pup_chance_weapon: 'Chance of weapon',
  pup_chance_megahealth: 'Chance of megahealth',
  pup_chance_deathbringer: 'Chance of deathbringer',
  pup_start_shield: 'Start with shield',
  pup_start_turbo: 'Start with turbo (seconds)',
  pup_start_shadow: 'Start with shadow (seconds)',
  pup_start_power: 'Start with power (seconds)',
  pup_start_weapon: 'Starting weapon level',
  pup_start_deathbringer: 'Start with deathbringer',
  pup_team_shield: 'Shield for the whole team',
  pup_team_turbo: 'Turbo for the whole team',
  pup_team_shadow: 'Shadow for the whole team',
  pup_team_power: 'Power for the whole team',
  pup_team_weapon: 'Weapon for the whole team',
  pup_team_health: 'Megahealth for the whole team',
  pup_team_deathbringer: 'Deathbringer for the whole team',
  // física
  friction: 'Friction',
  drag: 'Drag',
  acceleration: 'Acceleration',
  brake_acceleration: 'Brake (x acceleration)',
  turn_acceleration: 'Turning (x acceleration)',
  run_acceleration: 'Running (x acceleration)',
  turbo_acceleration: 'Turbo (x acceleration)',
  flag_acceleration: 'Carrying a flag (x acceleration)',
  player_collisions: 'Player collisions',
  rocket_speed: 'Rocket speed',
};

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const UINT_MAX = 4294967295;

function field(def: SettingDef): PresetField | undefined {
  const label = LABELS[def.name];
  if (!label) return undefined;
  switch (def.kind) {
    case 'bool':
      return { def, label, control: 'bool' };
    case 'int': {
      const min = def.min ?? (def.unsigned ? 0 : INT_MIN);
      const max = def.max ?? (def.unsigned ? UINT_MAX : INT_MAX);
      return { def, label, control: 'number', integer: true, min, max, ...(def.allow0 ? { allow0: true } : {}) };
    }
    case 'double':
      return { def, label, control: 'number', ...(def.min !== undefined ? { min: def.min } : {}), ...(def.max !== undefined ? { max: def.max } : {}) };
    case 'percentage':
      return { def, label, control: 'percent', min: 0 };
    case 'powerupNum':
      return { def, label, control: 'itemsOrPercent', min: 0, max: 32 };
    case 'maxPlayers':
      return { def, label, control: 'number', integer: true, min: 2, max: 32 };
    case 'balance':
      return { def, label, control: 'choice', options: ['no', 'balance', 'shuffle'] };
    case 'collisions':
      return { def, label, control: 'choice', options: ['no', 'normal', 'special'] };
    default:
      return undefined;
  }
}

/** Regras do formulário, na ordem do gamemod: as das categorias de preset (e `max_players`). */
export const PRESET_FIELDS: readonly PresetField[] = SETTINGS.filter((d) => d.web !== 'ignored' && (CASUAL_PRESET_CATEGORIES.has(d.category) || d.name === 'max_players'))
  .map(field)
  .filter((f): f is PresetField => f !== undefined);

export const PRESET_FIELD_BY_NAME: ReadonlyMap<string, PresetField> = new Map(PRESET_FIELDS.map((f) => [f.def.name, f]));

/** Ordem das seções do formulário. */
export const PRESET_FORM_CATEGORIES: readonly Category[] = ['game', 'health', 'powerups', 'physics', 'bots', 'general'];

const num = (n: number) => String(Number(n.toPrecision(6)));

/** Valor do formulário a partir do texto de uma linha (`50 %` → `50%`, `0.5` → `50%`, `1` → `normal`...). */
export function formValue(f: PresetField, raw: string): string {
  const v = raw.trim().replace(/^"(.*)"$/, '$1');
  const n = Number(v);
  switch (f.control) {
    case 'percent':
      if (v.endsWith('%')) return `${num(Number(v.slice(0, -1).trim()))}%`;
      return v !== '' && Number.isFinite(n) ? `${num(n * 100)}%` : v;
    case 'itemsOrPercent':
      return v.endsWith('%') ? `${num(Number(v.slice(0, -1).trim()))}%` : v;
    case 'choice':
      return f.def.kind === 'collisions' ? (['no', 'normal', 'special'][Number(v)] ?? v) : v;
    case 'number':
      return v !== '' && Number.isFinite(n) ? num(n) : v;
    default:
      return v;
  }
}

let classic: GameSettings | undefined;
const base = () => (classic ??= classicSettings());

/** Valor padrão (o do Clássico, sobre o qual o preset se aplica), já no formato do formulário. */
export function defaultFormValue(f: PresetField): string {
  // sem `max_players` no preset, a sala usa a lotação escolhida ao criar (16 por padrão)
  if (f.def.kind === 'maxPlayers') return String(base().server.maxPlayers ?? 16);
  return formValue(f, settingValue(base(), f.def));
}

/** Erro do valor (mensagem do original, em inglês) ou undefined se a regra aceita. */
export function fieldProblem(f: PresetField, value: string): string | undefined {
  return applySetting(JSON.parse(JSON.stringify(base())) as GameSettings, f.def, value);
}

export interface PresetForm {
  /** Regras marcadas ("alterar") e o valor de cada uma. */
  values: Record<string, string>;
  /** Linhas que o formulário não representa (desconhecidas ou de servidor): ficam no texto. */
  other: string[];
}

/** Linhas de gamemod → formulário. */
export function formFromLines(text: string): PresetForm {
  const values: Record<string, string> = {};
  const other: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const [, name = '', value = ''] = /^(\S+)\s*([\s\S]*)$/.exec(line) ?? [];
    const f = PRESET_FIELD_BY_NAME.get(name);
    if (f) values[name] = formValue(f, value);
    else other.push(line);
  }
  return { values, other };
}

/** Formulário → linhas de gamemod (na ordem do gamemod; as outras no fim). */
export function linesFromForm(form: PresetForm): string {
  return [...PRESET_FIELDS.filter((f) => f.def.name in form.values).map((f) => `${f.def.name} ${form.values[f.def.name]}`), ...form.other].join('\n');
}
