// SPDX-License-Identifier: GPL-2.0-or-later
// Registro de todas as settings do gamemod, na ordem e com as faixas de
// `Server::SettingManager::build` (src/server_settings.cpp:180-345).
import type { GameSettings } from './types.js';

export type Category = 'general' | 'website' | 'bots' | 'maps' | 'game' | 'health' | 'powerups' | 'physics';

/** Efeito na versão web: `sim` (simulação), `room` (regras de sala/servidor) ou `ignored` (aceita sem efeito). */
export type WebEffect = 'sim' | 'room' | 'ignored';

type Group = 'world' | 'powerups' | 'physics' | 'server';

interface Base {
  name: string;
  category: Category;
  web: WebEffect;
}

/** `GS_IntT`: inteiro em [min, max] (0 aceito se `allow0`), gravado como `valor × mul + add`. */
export interface IntSetting extends Base {
  kind: 'int';
  unsigned?: boolean;
  target: [Group, string];
  min?: number;
  max?: number;
  mul?: number;
  add?: number;
  allow0?: boolean;
}

/** `GS_FloatT`: real em [min, max]. */
export interface DoubleSetting extends Base {
  kind: 'double';
  target: [Group, string];
  min?: number;
  max?: number;
}

export interface SimpleSetting extends Base {
  kind: 'bool' | 'percentage' | 'balance' | 'collisions' | 'string' | 'addString';
  target: [Group, string];
  /** Só `string`: vazio ou começando com espaço é recusado (`GS_String` com `allowEmpty = false`). */
  nonEmpty?: boolean;
}

export interface SpecialSetting extends Base {
  kind: 'powerupNum' | 'maxPlayers' | 'randomMaprot' | 'map' | 'randomMap' | 'ignore';
  /** powerupNum: [campo do valor, campo do flag de porcentagem] em `powerups`. */
  fields?: [string, string];
}

export type SettingDef = IntSetting | DoubleSetting | SimpleSetting | SpecialSetting;

const INT_MAX = 2147483647;
const UINT_MAX = 4294967295;
const MAX_PLAYERS = 32;

const int = (name: string, category: Category, web: WebEffect, target: [Group, string], o: Partial<IntSetting> = {}): IntSetting => ({
  name,
  category,
  web,
  kind: 'int',
  target,
  ...o,
});
const dbl = (name: string, category: Category, web: WebEffect, target: [Group, string], min?: number, max?: number): DoubleSetting => ({
  name,
  category,
  web,
  kind: 'double',
  target,
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
});
const simple = (
  kind: SimpleSetting['kind'],
  name: string,
  category: Category,
  web: WebEffect,
  target: [Group, string],
  nonEmpty = false,
): SimpleSetting => ({ name, category, web, kind, target, ...(nonEmpty ? { nonEmpty } : {}) });
const special = (kind: SpecialSetting['kind'], name: string, category: Category, web: WebEffect, fields?: [string, string]): SpecialSetting => ({
  name,
  category,
  web,
  kind,
  ...(fields ? { fields } : {}),
});
const ignore = (name: string, category: Category) => special('ignore', name, category, 'ignored');

export const SETTINGS: readonly SettingDef[] = [
  // --- General settings ---
  simple('string', 'server_name', 'general', 'room', ['server', 'serverName'], true),
  special('maxPlayers', 'max_players', 'general', 'room'),
  simple('addString', 'welcome_message', 'general', 'room', ['server', 'welcomeMessage']),
  simple('addString', 'info_message', 'general', 'room', ['server', 'infoMessage']),
  simple('bool', 'sayadmin_enabled', 'general', 'room', ['server', 'sayadminEnabled']),
  simple('string', 'sayadmin_comment', 'general', 'room', ['server', 'sayadminComment']),
  simple('string', 'server_password', 'general', 'room', ['server', 'serverPassword']),
  ignore('tournament', 'general'),
  int('save_stats', 'general', 'room', ['server', 'saveStats'], { min: 0, max: MAX_PLAYERS }),
  int('idlekick_time', 'general', 'room', ['server', 'idlekickTime'], { min: 10, max: INT_MAX, mul: 10, allow0: true }),
  int('idlekick_playerlimit', 'general', 'room', ['server', 'idlekickPlayerlimit'], { min: 1, max: MAX_PLAYERS }),
  ignore('server_port', 'general'), // rede UDP do original
  ignore('server_ip', 'general'),
  ignore('private_server', 'general'), // substituído por salas privadas
  ignore('join_start', 'general'),
  ignore('join_end', 'general'),
  ignore('join_limit_message', 'general'),
  ignore('srvmonit_port', 'general'),
  int('recording', 'general', 'room', ['server', 'recording'], { min: 0, max: MAX_PLAYERS }),
  ignore('relay_server', 'general'),
  int('spectating_delay', 'general', 'room', ['server', 'spectatingDelay'], { unsigned: true, min: 0, max: UINT_MAX }),
  simple('bool', 'log_player_chat', 'general', 'room', ['server', 'logPlayerChat']),
  ignore('ranking_id', 'general'), // ranking do master server antigo
  ignore('ranking_password', 'general'),
  int('ranking_minhumans', 'general', 'room', ['server', 'rankingMinhumans'], { min: 1, max: MAX_PLAYERS }),
  int('ranking_minplayers', 'general', 'room', ['server', 'rankingMinplayers'], { min: 2, max: MAX_PLAYERS }),
  // --- Server web site (site antigo do servidor) ---
  ignore('server_website', 'website'),
  ignore('web_server', 'website'),
  ignore('web_script', 'website'),
  ignore('web_auth', 'website'),
  ignore('web_refresh', 'website'),
  // --- Bots ---
  int('min_bots', 'bots', 'room', ['server', 'minBots'], { min: 0, max: MAX_PLAYERS }),
  int('bots_fill', 'bots', 'room', ['server', 'botsFill'], { min: 0, max: MAX_PLAYERS }),
  simple('bool', 'balance_bot', 'bots', 'room', ['server', 'balanceBot']),
  int('bot_ping', 'bots', 'room', ['server', 'botPing'], { min: 0, max: 2000 }),
  simple('string', 'bot_name_lang', 'bots', 'room', ['server', 'botNameLang']),
  ignore('bot_name_file', 'bots'),
  // --- Map rotation ---
  special('map', 'map', 'maps', 'room'),
  special('randomMap', 'random_map', 'maps', 'room'),
  special('randomMaprot', 'random_maprot', 'maps', 'room'),
  int('vote_block_time', 'maps', 'room', ['server', 'voteBlockTime'], { min: 0, max: INT_MAX, mul: 600 }),
  simple('bool', 'require_specific_map_vote', 'maps', 'room', ['server', 'requireSpecificMapVote']),
  // --- Game config ---
  int('capture_limit', 'game', 'sim', ['world', 'captureLimit'], { min: 0 }),
  int('win_score_difference', 'game', 'sim', ['world', 'winScoreDifference'], { min: 1 }),
  int('time_limit', 'game', 'sim', ['world', 'timeLimit'], { unsigned: true, min: 0, max: UINT_MAX, mul: 600 }),
  int('extra_time', 'game', 'sim', ['world', 'extraTime'], { unsigned: true, min: 0, max: UINT_MAX, mul: 600 }),
  int('extra_time_periods', 'game', 'sim', ['world', 'extraTimePeriods'], { unsigned: true, min: 1, max: 255 }),
  simple('bool', 'sudden_death', 'game', 'sim', ['world', 'suddenDeath']),
  int('game_end_delay', 'game', 'room', ['server', 'gameEndDelay'], { min: 0 }),
  int('game_end_delay_extension', 'game', 'room', ['server', 'gameEndDelayExtension'], { min: 0 }),
  dbl('flag_return_delay', 'game', 'sim', ['world', 'flagReturnDelay'], 0),
  dbl('min_capture_time', 'game', 'sim', ['world', 'minCaptureTime'], 0),
  int('carrying_score_time', 'game', 'sim', ['world', 'carryingScoreTime'], { min: 0 }),
  simple('bool', 'random_wild_flag', 'game', 'sim', ['world', 'randomWildFlag']),
  simple('bool', 'lock_team_flags', 'game', 'sim', ['world', 'lockTeamFlags']),
  simple('bool', 'lock_wild_flags', 'game', 'sim', ['world', 'lockWildFlags']),
  simple('bool', 'capture_on_team_flag', 'game', 'sim', ['world', 'captureOnTeamFlag']),
  simple('bool', 'capture_on_wild_flag', 'game', 'sim', ['world', 'captureOnWildFlag']),
  simple('bool', 'capture_away_from_base', 'game', 'sim', ['world', 'captureAwayFromBase']),
  simple('bool', 'carry_own_team_flag', 'game', 'sim', ['world', 'carryOwnTeamFlag']),
  simple('bool', 'always_send_flag_location', 'game', 'sim', ['world', 'alwaysSendFlagLocation']),
  simple('balance', 'balance_teams', 'game', 'room', ['world', 'balanceTeams']),
  dbl('respawn_time', 'game', 'sim', ['world', 'respawnTime'], 0),
  dbl('extra_respawn_time_alone', 'game', 'sim', ['world', 'extraRespawnTimeAlone'], 0),
  dbl('respawn_balancing_time', 'game', 'sim', ['world', 'respawnBalancingTime'], 0),
  dbl('waiting_time_deathbringer', 'game', 'sim', ['world', 'waitingTimeDeathbringer'], 0),
  dbl('spawn_safe_time', 'game', 'sim', ['world', 'spawnSafeTime'], 0),
  simple('bool', 'respawn_on_capture', 'game', 'sim', ['world', 'respawnOnCapture']),
  simple('bool', 'free_turning', 'game', 'sim', ['physics', 'allowFreeTurning']),
  int('minimap_send_limit', 'game', 'room', ['server', 'minimapSendLimit'], { min: 0, max: 32 }),
  int('see_rockets_distance', 'game', 'sim', ['world', 'seeRocketsDistance'], { min: 0 }),
  int('see_minimap_player_properties', 'game', 'sim', ['world', 'seeMinimapPlayerProperties'], { min: 0, max: 2 }),
  // --- Health, energy and shooting ---
  simple('percentage', 'friendly_fire', 'health', 'sim', ['physics', 'friendlyFire']),
  simple('percentage', 'friendly_deathbringer', 'health', 'sim', ['physics', 'friendlyDeathbringer']),
  int('rocket_damage', 'health', 'sim', ['world', 'rocketDamage'], { min: 0 }),
  int('start_health', 'health', 'sim', ['world', 'startHealth'], { min: 1, max: 500 }),
  int('start_energy', 'health', 'sim', ['world', 'startEnergy'], { min: 0, max: 500 }),
  int('health_max', 'health', 'sim', ['world', 'healthMax'], { min: 1, max: 500 }),
  int('energy_max', 'health', 'sim', ['world', 'energyMax'], { min: 0, max: 500 }),
  dbl('health_regeneration_0_to_100', 'health', 'sim', ['world', 'healthRegeneration0To100'], 0),
  dbl('health_regeneration_100_to_200', 'health', 'sim', ['world', 'healthRegeneration100To200'], 0),
  dbl('health_regeneration_200_to_max', 'health', 'sim', ['world', 'healthRegeneration200ToMax'], 0),
  dbl('energy_regeneration_0_to_100', 'health', 'sim', ['world', 'energyRegeneration0To100'], 0),
  dbl('energy_regeneration_100_to_200', 'health', 'sim', ['world', 'energyRegeneration100To200'], 0),
  dbl('energy_regeneration_200_to_max', 'health', 'sim', ['world', 'energyRegeneration200ToMax'], 0),
  int('min_health_for_run_penalty', 'health', 'sim', ['world', 'minHealthForRunPenalty'], { min: 1, max: 500 }),
  dbl('run_health_degradation', 'health', 'sim', ['world', 'runHealthDegradation']),
  dbl('run_energy_degradation', 'health', 'sim', ['world', 'runEnergyDegradation']),
  dbl('shooting_energy_base', 'health', 'sim', ['world', 'shootingEnergyBase'], -500, 500),
  dbl('shooting_energy_per_extra_rocket', 'health', 'sim', ['world', 'shootingEnergyPerExtraRocket'], -500, 500),
  dbl('hit_stun_time', 'health', 'sim', ['world', 'hitStunTime'], 0),
  dbl('shoot_interval', 'health', 'sim', ['world', 'shootInterval'], 0.1),
  dbl('shoot_interval_with_energy', 'health', 'sim', ['world', 'shootIntervalWithEnergy'], 0.1),
  // --- Powerups ---
  special('powerupNum', 'pups_min', 'powerups', 'sim', ['pupsMin', 'pupsMinPercentage']),
  special('powerupNum', 'pups_max', 'powerups', 'sim', ['pupsMax', 'pupsMaxPercentage']),
  int('pups_respawn_time', 'powerups', 'sim', ['powerups', 'pupsRespawnTime'], { min: 0 }),
  int('pup_add_time', 'powerups', 'sim', ['powerups', 'pupAddTime'], { min: 1, max: 999 }),
  int('pup_max_time', 'powerups', 'sim', ['powerups', 'pupMaxTime'], { min: 1, max: 999 }),
  simple('bool', 'pups_drop_at_death', 'powerups', 'sim', ['powerups', 'pupsDropAtDeath']),
  int('pups_player_max', 'powerups', 'sim', ['powerups', 'pupsPlayerMax'], { min: 1 }),
  int('pup_weapon_max', 'powerups', 'sim', ['powerups', 'pupWeaponMax'], { min: 1, max: 9 }),
  int('pup_health_bonus', 'powerups', 'sim', ['powerups', 'pupHealthBonus'], { min: 1 }),
  dbl('pup_power_damage', 'powerups', 'sim', ['powerups', 'pupPowerDamage'], 0),
  dbl('pup_deathbringer_time', 'powerups', 'sim', ['powerups', 'pupDeathbringerTime'], 1),
  simple('bool', 'pup_deathbringer_switch', 'powerups', 'sim', ['powerups', 'pupDeathbringerSwitch']),
  int('pup_deathbringer_health_limit', 'powerups', 'sim', ['powerups', 'deathbringerHealthLimit'], { min: 1, max: 500 }),
  int('pup_deathbringer_energy_limit', 'powerups', 'sim', ['powerups', 'deathbringerEnergyLimit'], { min: 0, max: 500 }),
  dbl('pup_deathbringer_health_degradation', 'powerups', 'sim', ['powerups', 'deathbringerHealthDegradation'], 0),
  dbl('pup_deathbringer_energy_degradation', 'powerups', 'sim', ['powerups', 'deathbringerEnergyDegradation'], 0),
  // 0 → shadow_minimum 7 (normal); 1 → 0 (invisível de verdade)
  int('pup_shadow_invisibility', 'powerups', 'sim', ['world', 'shadowMinimum'], { min: 0, max: 1, mul: -7, add: 7 }),
  simple('bool', 'pup_shadow_see_shadow', 'powerups', 'sim', ['powerups', 'shadowSeeShadow']),
  int('pup_shield_one_hit', 'powerups', 'sim', ['powerups', 'pupShieldHits'], { min: 0 }),
  int('pup_chance_shield', 'powerups', 'sim', ['powerups', 'pupChanceShield'], { min: 0 }),
  int('pup_chance_turbo', 'powerups', 'sim', ['powerups', 'pupChanceTurbo'], { min: 0 }),
  int('pup_chance_shadow', 'powerups', 'sim', ['powerups', 'pupChanceShadow'], { min: 0 }),
  int('pup_chance_power', 'powerups', 'sim', ['powerups', 'pupChancePower'], { min: 0 }),
  int('pup_chance_weapon', 'powerups', 'sim', ['powerups', 'pupChanceWeapon'], { min: 0 }),
  int('pup_chance_megahealth', 'powerups', 'sim', ['powerups', 'pupChanceMegahealth'], { min: 0 }),
  int('pup_chance_deathbringer', 'powerups', 'sim', ['powerups', 'pupChanceDeathbringer'], { min: 0 }),
  simple('bool', 'pup_start_shield', 'powerups', 'sim', ['powerups', 'startShield']),
  int('pup_start_turbo', 'powerups', 'sim', ['powerups', 'startTurbo'], { min: 0, max: 999 }),
  int('pup_start_shadow', 'powerups', 'sim', ['powerups', 'startShadow'], { min: 0, max: 999 }),
  int('pup_start_power', 'powerups', 'sim', ['powerups', 'startPower'], { min: 0, max: 999 }),
  int('pup_start_weapon', 'powerups', 'sim', ['powerups', 'startWeapon'], { min: 1, max: 9 }),
  simple('bool', 'pup_start_deathbringer', 'powerups', 'sim', ['powerups', 'startDeathbringer']),
  simple('bool', 'pup_team_shield', 'powerups', 'sim', ['powerups', 'teamShield']),
  simple('bool', 'pup_team_turbo', 'powerups', 'sim', ['powerups', 'teamTurbo']),
  simple('bool', 'pup_team_shadow', 'powerups', 'sim', ['powerups', 'teamShadow']),
  simple('bool', 'pup_team_power', 'powerups', 'sim', ['powerups', 'teamPower']),
  simple('bool', 'pup_team_weapon', 'powerups', 'sim', ['powerups', 'teamWeapon']),
  simple('bool', 'pup_team_health', 'powerups', 'sim', ['powerups', 'teamHealth']),
  simple('bool', 'pup_team_deathbringer', 'powerups', 'sim', ['powerups', 'teamDeathbringer']),
  // --- Physics ---
  dbl('friction', 'physics', 'sim', ['physics', 'friction']),
  dbl('drag', 'physics', 'sim', ['physics', 'drag']),
  dbl('acceleration', 'physics', 'sim', ['physics', 'acceleration']),
  dbl('brake_acceleration', 'physics', 'sim', ['physics', 'brakeMul'], 0.01),
  dbl('turn_acceleration', 'physics', 'sim', ['physics', 'turnMul'], 0.01),
  dbl('run_acceleration', 'physics', 'sim', ['physics', 'runMul']),
  dbl('turbo_acceleration', 'physics', 'sim', ['physics', 'turboMul']),
  dbl('flag_acceleration', 'physics', 'sim', ['physics', 'flagMul']),
  simple('collisions', 'player_collisions', 'physics', 'sim', ['physics', 'playerCollisions']),
  dbl('rocket_speed', 'physics', 'sim', ['physics', 'rocketSpeed'], 0.01),
];

export const SETTINGS_BY_NAME: ReadonlyMap<string, SettingDef> = new Map(SETTINGS.map((s) => [s.name, s]));

/** Acesso tipado ao campo-alvo de uma setting. */
export function targetRecord(settings: GameSettings, group: Group): Record<string, unknown> {
  return settings[group] as unknown as Record<string, unknown>;
}
