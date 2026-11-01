// SPDX-License-Identifier: GPL-2.0-or-later
// Configurações de jogo do Outgun, nas mesmas unidades das variáveis do original (tempos que o
// gamemod recebe em minutos ficam em frames, por exemplo). Defaults = defaults do código
// (`WorldSettings::reset`, `PowerupSettings::reset`, `PhysicalSettings()`, `SettingManager::reset`);
// o preset Clássico aplica `config/gamemod.txt` por cima (decisão D-01).

export type TeamBalance = 'no' | 'balance' | 'shuffle';
export type PlayerCollisions = 'no' | 'normal' | 'special';

/** `WorldSettings` + `SimpleGameSettings` (src/world.h:873-1096). */
export interface WorldSettings {
  timeLimit: number; // frames
  extraTime: number; // frames
  extraTimePeriods: number;
  suddenDeath: boolean;
  captureLimit: number;
  winScoreDifference: number;
  respawnTime: number; // s
  extraRespawnTimeAlone: number; // s
  waitingTimeDeathbringer: number; // s
  respawnBalancingTime: number; // s
  respawnOnCapture: boolean;
  /** Menor alpha do shadow (7; 0 com `pup_shadow_invisibility 1`). */
  shadowMinimum: number;
  rocketDamage: number;
  startHealth: number;
  startEnergy: number;
  minHealthForRunPenalty: number;
  healthMax: number;
  energyMax: number;
  healthRegeneration0To100: number;
  energyRegeneration0To100: number;
  healthRegeneration100To200: number;
  energyRegeneration100To200: number;
  healthRegeneration200ToMax: number;
  energyRegeneration200ToMax: number;
  runHealthDegradation: number;
  runEnergyDegradation: number;
  shootingEnergyBase: number;
  shootingEnergyPerExtraRocket: number;
  hitStunTime: number; // s
  shootInterval: number; // s
  shootIntervalWithEnergy: number; // s
  spawnSafeTime: number; // s
  flagReturnDelay: number; // s
  balanceTeams: TeamBalance;
  minCaptureTime: number; // s
  randomWildFlag: boolean;
  lockTeamFlags: boolean;
  lockWildFlags: boolean;
  captureOnTeamFlag: boolean;
  captureOnWildFlag: boolean;
  captureAwayFromBase: boolean;
  carryOwnTeamFlag: boolean;
  alwaysSendFlagLocation: boolean;
  seeRocketsDistance: number;
  seeMinimapPlayerProperties: number;
  carryingScoreTime: number; // s
}

/** `PowerupSettings` (src/world.h:994). */
export interface PowerupSettings {
  pupsMin: number;
  pupsMinPercentage: boolean;
  pupsMax: number;
  pupsMaxPercentage: boolean;
  pupsRespawnTime: number; // s
  pupChanceShield: number;
  pupChanceTurbo: number;
  pupChanceShadow: number;
  pupChancePower: number;
  pupChanceWeapon: number;
  pupChanceMegahealth: number;
  pupChanceDeathbringer: number;
  pupAddTime: number; // s
  pupMaxTime: number; // s
  pupDeathbringerSwitch: boolean;
  pupDeathbringerTime: number; // s
  pupsDropAtDeath: boolean;
  pupsPlayerMax: number;
  pupHealthBonus: number;
  pupPowerDamage: number;
  pupWeaponMax: number;
  /** Acertos que o shield aguenta; 0 = protege enquanto houver energia. */
  pupShieldHits: number;
  shadowSeeShadow: boolean;
  deathbringerHealthLimit: number;
  deathbringerEnergyLimit: number;
  deathbringerHealthDegradation: number;
  deathbringerEnergyDegradation: number;
  startShield: boolean;
  startTurbo: number; // s
  startShadow: number; // s
  startPower: number; // s
  startWeapon: number;
  startDeathbringer: boolean;
  teamShield: boolean;
  teamTurbo: boolean;
  teamShadow: boolean;
  teamPower: boolean;
  teamWeapon: boolean;
  teamHealth: boolean;
  teamDeathbringer: boolean;
}

/** `PhysicalSettings` (src/world.h:832). */
export interface PhysicsSettings {
  friction: number;
  drag: number;
  acceleration: number;
  brakeMul: number;
  turnMul: number;
  runMul: number;
  turboMul: number;
  flagMul: number;
  rocketSpeed: number;
  friendlyFire: number;
  friendlyDeathbringer: number;
  playerCollisions: PlayerCollisions;
  allowFreeTurning: boolean;
  /**
   * Velocidade máxima de corrida usada pelo servidor (limite rígido de velocidade e dano por
   * colisão). O original só a calcula no construtor de `PhysicalSettings`, com os defaults do
   * código, e não a recalcula depois do gamemod: no servidor ela vale sempre 27,1875. Preservado.
   */
  maxRunSpeed: number;
}

export interface RandomMapEntry {
  width: number;
  height: number;
  overEdge: number;
  respawnArea: number;
  repetitiveRespawnArea: number;
  wildFlag: number;
  asymmetric: boolean;
}

export type MapRotationEntry = { type: 'file'; name: string } | ({ type: 'random' } & RandomMapEntry);

/** Configurações de sala/servidor que não são da simulação (src/server_settings.cpp). */
export interface ServerSettings {
  serverName: string;
  /** `max_players`; null = padrão do servidor (16). */
  maxPlayers: number | null;
  welcomeMessage: string[];
  infoMessage: string[];
  sayadminEnabled: boolean;
  sayadminComment: string;
  serverPassword: string;
  saveStats: number;
  idlekickTime: number; // frames; 0 = desligado
  idlekickPlayerlimit: number;
  recording: number;
  spectatingDelay: number; // s
  logPlayerChat: boolean;
  rankingMinhumans: number;
  rankingMinplayers: number;
  minBots: number;
  botsFill: number;
  balanceBot: boolean;
  botPing: number; // ms
  /** Nível dos bots do Casual (OG-289): 1–5, ou 0 = variável (cada bot sorteia o seu). */
  botLevel: number;
  botNameLang: string;
  randomMaprot: 0 | 1 | 2;
  voteBlockTime: number; // frames
  requireSpecificMapVote: boolean;
  gameEndDelay: number; // s
  gameEndDelayExtension: number; // s
  minimapSendLimit: number;
}

export interface GameSettings {
  world: WorldSettings;
  powerups: PowerupSettings;
  physics: PhysicsSettings;
  server: ServerSettings;
  maps: MapRotationEntry[];
}

/** Defaults do código original, antes de qualquer gamemod. */
export function codeDefaults(): GameSettings {
  return {
    world: {
      timeLimit: 0,
      extraTime: 0,
      extraTimePeriods: 1,
      suddenDeath: false,
      captureLimit: 8,
      winScoreDifference: 1,
      respawnTime: 2,
      extraRespawnTimeAlone: 0,
      waitingTimeDeathbringer: 4,
      respawnBalancingTime: 0,
      respawnOnCapture: false,
      shadowMinimum: 7,
      rocketDamage: 70,
      startHealth: 100,
      startEnergy: 100,
      minHealthForRunPenalty: 40,
      healthMax: 300,
      energyMax: 300,
      healthRegeneration0To100: 10,
      energyRegeneration0To100: 10,
      healthRegeneration100To200: 1,
      energyRegeneration100To200: 5,
      healthRegeneration200ToMax: 0,
      energyRegeneration200ToMax: 0,
      runHealthDegradation: 15,
      runEnergyDegradation: 15,
      shootingEnergyBase: 7,
      shootingEnergyPerExtraRocket: 1,
      hitStunTime: 1,
      shootInterval: 0.5,
      shootIntervalWithEnergy: 0.5,
      spawnSafeTime: 0,
      flagReturnDelay: 1,
      balanceTeams: 'no',
      minCaptureTime: 1,
      randomWildFlag: false,
      lockTeamFlags: false,
      lockWildFlags: false,
      captureOnTeamFlag: true,
      captureOnWildFlag: false,
      captureAwayFromBase: false,
      carryOwnTeamFlag: false,
      alwaysSendFlagLocation: false,
      seeRocketsDistance: 0,
      seeMinimapPlayerProperties: 0,
      carryingScoreTime: 0,
    },
    powerups: {
      pupsMin: 20,
      pupsMinPercentage: true,
      pupsMax: 80,
      pupsMaxPercentage: true,
      pupsRespawnTime: 25,
      pupChanceShield: 16,
      pupChanceTurbo: 14,
      pupChanceShadow: 14,
      pupChancePower: 14,
      pupChanceWeapon: 18,
      pupChanceMegahealth: 13,
      pupChanceDeathbringer: 11,
      pupAddTime: 40,
      pupMaxTime: 100,
      pupDeathbringerSwitch: true,
      pupDeathbringerTime: 5,
      pupsDropAtDeath: false,
      pupsPlayerMax: 2147483647, // INT_MAX
      pupHealthBonus: 160,
      pupPowerDamage: 2,
      pupWeaponMax: 9,
      pupShieldHits: 0,
      shadowSeeShadow: false,
      deathbringerHealthLimit: 100,
      deathbringerEnergyLimit: 100,
      deathbringerHealthDegradation: 2.5,
      deathbringerEnergyDegradation: 2.5,
      startShield: false,
      startTurbo: 0,
      startShadow: 0,
      startPower: 0,
      startWeapon: 1,
      startDeathbringer: false,
      teamShield: false,
      teamTurbo: false,
      teamShadow: false,
      teamPower: false,
      teamWeapon: false,
      teamHealth: false,
      teamDeathbringer: false,
    },
    physics: {
      friction: 0.2,
      drag: 0.16,
      acceleration: 2.6,
      brakeMul: 0.1,
      turnMul: 0.5,
      runMul: 1.75,
      turboMul: 1.45,
      flagMul: 0.91,
      rocketSpeed: 50,
      friendlyFire: 0,
      friendlyDeathbringer: 0,
      playerCollisions: 'normal',
      allowFreeTurning: false,
      maxRunSpeed: (1.75 * 2.6 - 0.2) / 0.16, // calc_max_run_speed() no construtor
    },
    server: {
      serverName: 'Anonymous host',
      maxPlayers: null,
      welcomeMessage: [],
      infoMessage: [],
      sayadminEnabled: false,
      sayadminComment: '',
      serverPassword: '',
      saveStats: 0,
      idlekickTime: 1200,
      idlekickPlayerlimit: 4,
      recording: 0,
      spectatingDelay: 15, // D-89 (era 30 pela D-56; o original usa 120)
      logPlayerChat: false,
      rankingMinhumans: 2,
      rankingMinplayers: 4,
      minBots: 0,
      botsFill: 0,
      balanceBot: false,
      botPing: 300,
      botLevel: 4, // `REFERENCE_BOT_LEVEL` de @outgun/bots: o bot do original
      botNameLang: '',
      randomMaprot: 0,
      voteBlockTime: 0,
      requireSpecificMapVote: false,
      gameEndDelay: 5,
      gameEndDelayExtension: 15,
      minimapSendLimit: 32,
    },
    maps: [],
  };
}
