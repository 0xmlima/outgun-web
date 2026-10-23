// SPDX-License-Identifier: GPL-2.0-or-later
// Nomes e prefixos dos bots (OG-403): cadastrados na moderação, entregues aos game servers na
// configuração do heartbeat. O bot que entra sorteia um prefixo e um nome ativos; listas vazias
// mantêm o comportamento antigo ("BOT " + nome gerado).

/** Uma entrada dos cadastros: texto e se pode sair no sorteio. Prefixo "" = sem prefixo. */
export interface BotNameEntry {
  text: string;
  active: boolean;
}

export interface BotNamesConfig {
  prefixes: BotNameEntry[];
  names: BotNameEntry[];
}

/** O que o game server recebe: só as entradas ativas. */
export interface BotNames {
  prefixes: string[];
  names: string[];
}

export const BOT_PREFIX_MAX_LENGTH = 6;
export const BOT_PREFIXES_MAX = 30;
export const BOT_NAMES_MAX = 500;
/** Prefixo dos bots quando a moderação não cadastrou nenhum. */
export const DEFAULT_BOT_PREFIX = 'BOT ';

/** Espaços do meio normalizados e pontas aparadas, como o nome de jogador. */
export const cleanBotText = (text: string) => text.replace(/[\s\u00a0]+/g, ' ').trim();

/** Prefixo: sem espaço nas pontas, exceto um espaço final opcional ("BOT " separa do nome). */
export function cleanBotPrefix(text: string): string {
  const spaced = /[\s\u00a0]$/.test(text);
  const core = cleanBotText(text);
  return core === '' ? '' : spaced ? `${core} ` : core;
}

/** Só as entradas ativas, sem repetidas. */
export function activeBotNames(config: BotNamesConfig): BotNames {
  const pick = (list: readonly BotNameEntry[]) => [...new Set(list.filter((e) => e.active).map((e) => e.text))];
  return { prefixes: pick(config.prefixes), names: pick(config.names).filter((n) => n !== '') };
}
