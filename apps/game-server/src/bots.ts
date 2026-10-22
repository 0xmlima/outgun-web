// SPDX-License-Identifier: GPL-2.0-or-later
// População de bots (OG-054, RN-BOT-01/03): `Server::init_bots` e `create_bot_name`
// (src/server.cpp:884-971) e os geradores de nomes de src/names.cpp. Spec: plan/specs/bots-populacao.md.
import { MAX_NAME_LENGTH } from '@outgun/protocol';
import type { Rng } from '@outgun/sim';

export interface BotNeeds {
  humans: number;
  maxPlayers: number;
  minBots: number;
  botsFill: number;
  balanceBot: boolean;
  /** Saldo do `/bot add` e `/bot remove`. */
  extraBots: number;
  /** Teste de bots (`-bottest` do original): bots jogam mesmo sem humanos. */
  botTest?: boolean;
}

/**
 * `init_bots`: `max(bots_fill − humanos, min_bots) + extra_bots`, limitado às vagas; com
 * `balance_bot`, mais um se o total ficar ímpar. Divergência D-27: sem humanos, nenhum bot.
 */
export function neededBots(n: BotNeeds): number {
  if (n.humans === 0 && !n.botTest) return 0;
  let needed = Math.max(n.botsFill - n.humans, n.minBots) + n.extraBots;
  if (needed < 0) needed = 0;
  else if (n.humans + needed > n.maxPlayers) needed = n.maxPlayers - n.humans;
  if (n.balanceBot && (n.humans + needed) % 2 !== 0) ++needed;
  return needed;
}

const BOT_PREFIX = 'BOT ';

/**
 * `create_bot_name`: "BOT " + nome gerado (só o clássico: os finlandeses saíram no OG-386, e
 * `bot_name_lang` ficou sem efeito) que não esteja em `reserved` (todos os já
 * gerados na sala, `reservedBotNames`) nem seja o de um bot presente; o novo nome entra em `reserved`.
 */
export function createBotName(rng: Rng, reserved: Set<string>, inUse: Iterable<string>): string {
  const blackList = new Set(reserved);
  for (const name of inUse) if (name.startsWith(BOT_PREFIX)) blackList.add(name.slice(BOT_PREFIX.length));
  let name: string;
  do name = randomName(rng);
  while (blackList.has(name));
  reserved.add(name);
  return (BOT_PREFIX + name).slice(0, MAX_NAME_LENGTH).trim();
}

// --- names.cpp: nomes "clássicos" (sílabas) ---

/** Faixas `prob <= max → valor`; fora delas, "" (os buracos do original, ex. 58 em `ConsProlSemiVog`). */
function range(prob: number, table: readonly (readonly [number, number, string])[]): string {
  for (const [min, max, value] of table) if (prob >= min && prob <= max) return value;
  return '';
}

function vog(rng: Rng): string {
  return range(rng.rand() % 100, [[0, 30, 'a'], [31, 35, 'y'], [36, 55, 'e'], [56, 66, 'i'], [67, 90, 'o'], [91, 99, 'u']]);
}

const SEMI_VOWELS = [[0, 45, 'i'], [46, 85, 'u'], [86, 95, 'y'], [96, 99, 'w']] as const;

function consProlSemiVog(rng: Rng): string {
  if (rng.rand() % 100 >= 20) return '';
  if (rng.rand() % 100 < 30) return range(rng.rand() % 100, SEMI_VOWELS);
  return range(rng.rand() % 63, [[0, 10, 'h'], [11, 30, 'l'], [31, 50, 'r'], [51, 57, 's'], [59, 62, 'z']]);
}

const PRE_VOWEL = 'bcdfghjklmnpqrstvwxz';
const PRE_VOWEL_MAX = [4, 8, 13, 18, 23, 27, 31, 35, 40, 45, 50, 55, 58, 63, 68, 73, 78, 83, 88, 92];

function preVog(rng: Rng): string {
  if (rng.rand() % 101 >= 87) return '';
  const prob = rng.rand() % 100;
  const i = PRE_VOWEL_MAX.findIndex((max) => prob <= max);
  return (i === -1 ? '' : PRE_VOWEL[i]) + consProlSemiVog(rng);
}

function posSemiVog(rng: Rng): string {
  return rng.rand() % 101 < 13 ? range(rng.rand() % 100, SEMI_VOWELS) : '';
}

const POS_CONS = 'bcdfghjklmnpqrstvwxz';
const POS_CONS_MAX = [2, 5, 8, 11, 14, 30, 32, 36, 55, 74, 92, 95, 98, 116, 136, 140, 143, 154, 156, 168];

function posConsProl(rng: Rng): string {
  if (rng.rand() % 100 >= 18) return '';
  const prob = rng.rand() % 169;
  return POS_CONS[POS_CONS_MAX.findIndex((max) => prob <= max)] ?? '';
}

/** `PreVog() + Vog() + PosSemiVog() + PosConsProl()`: o GCC avalia da direita para a esquerda. */
function silaba(rng: Rng): string {
  const pos = posConsProl(rng);
  const semi = posSemiVog(rng);
  const vowel = vog(rng);
  return preVog(rng) + vowel + semi + pos;
}

function palavra(rng: Rng): string {
  const prob = rng.rand() % 100;
  const nsil = prob <= 10 ? 1 : prob <= 75 ? 2 : 3;
  let word = '';
  for (let r = 0; r < nsil; r++) word += silaba(rng);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** `RandomName()`: uma ou duas palavras (60% uma). */
export function randomName(rng: Rng): string {
  const npal = rng.rand() % 100 <= 60 ? 1 : 2;
  let name = '';
  for (let r = 0; r < npal - 1; r++) name += palavra(rng) + ' ';
  name += palavra(rng);
  return name.slice(0, MAX_NAME_LENGTH).trim();
}
