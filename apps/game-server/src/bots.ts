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
}

/**
 * `init_bots`: `max(bots_fill − humanos, min_bots) + extra_bots`, limitado às vagas; com
 * `balance_bot`, mais um se o total ficar ímpar. Divergência D-27: sem humanos, nenhum bot.
 */
export function neededBots(n: BotNeeds): number {
  if (n.humans === 0) return 0;
  let needed = Math.max(n.botsFill - n.humans, n.minBots) + n.extraBots;
  if (needed < 0) needed = 0;
  else if (n.humans + needed > n.maxPlayers) needed = n.maxPlayers - n.humans;
  if (n.balanceBot && (n.humans + needed) % 2 !== 0) ++needed;
  return needed;
}

const BOT_PREFIX = 'BOT ';

/**
 * `create_bot_name`: "BOT " + nome gerado em `bot_name_lang` que não esteja em `reserved` (todos os já
 * gerados na sala, `reservedBotNames`) nem seja o de um bot presente; o novo nome entra em `reserved`.
 */
export function createBotName(rng: Rng, lang: string, reserved: Set<string>, inUse: Iterable<string>): string {
  const blackList = new Set(reserved);
  for (const name of inUse) if (name.startsWith(BOT_PREFIX)) blackList.add(name.slice(BOT_PREFIX.length));
  let name: string;
  do name = lang === 'fi' ? finnishName(rng, MAX_NAME_LENGTH - BOT_PREFIX.length) : randomName(rng);
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

// --- names.cpp: nomes finlandeses ---

function strRand(rng: Rng, s: string): string {
  return s.charAt(rng.rand() % s.length);
}

const consonant = (rng: Rng): string => strRand(rng, 'hjklmnprstv');

const START_CONSONANTS: Record<string, string> = { h: 'jklmnrtv', k: 'krs', l: 'hjklmpstv', m: 'mp', n: 'hjknst', p: 'lprs', r: 'hjkmnprstv', s: 'kpstv', t: 'jkrstv' };
const END_CONSONANTS: Record<string, string> = { l: 'kpst', m: 'p', n: 'kst', r: 'kpst' };

function startConsonant(rng: Rng, last: string): string {
  const set = START_CONSONANTS[last];
  return set ? strRand(rng, set) : consonant(rng);
}

function endConsonant(rng: Rng, last: string): string {
  const set = END_CONSONANTS[last];
  return set ? strRand(rng, set) : consonant(rng);
}

type VowType = 'any' | 'back' | 'front';

function vowel(rng: Rng, type: VowType): string {
  return strRand(rng, type === 'back' ? 'aaeiiou' : type === 'front' ? 'eeiiiyäö' : 'aaaeiiioouuyäö');
}

function startVowel(rng: Rng, last: string, type: VowType): string {
  let v: string;
  do v = vowel(rng, type);
  while (v === last);
  return v;
}

const CONT_VOWELS: Record<VowType, Record<string, string>> = {
  any: { a: 'aaiu', e: 'eiiu', i: 'eiiu', o: 'iou', u: 'iouu', y: 'iyyö', ä: 'iyää', ö: 'iyö' },
  back: { a: 'aaiu', e: 'eiu', i: 'eiiu', o: 'iou', u: 'iouu' },
  front: { e: 'ei', i: 'eii', y: 'iyyö', ä: 'iyää', ö: 'iyö' },
};

function contVowel(rng: Rng, last: string, type: VowType): string {
  const set = CONT_VOWELS[type][last];
  return set ? strRand(rng, set) : vowel(rng, type);
}

/** Harmonia vocálica: a/o/u puxam para trás, y/ä/ö para a frente; e/i não mudam. */
function harmony(v: string, type: VowType): VowType {
  return 'aou'.includes(v) ? 'back' : 'yäö'.includes(v) ? 'front' : type;
}

const TYPES = ['a', 'aa', 'aat', 'at', 'att', 'ta', 'taa', 'taat', 'tat', 'tatt'] as const;
type GroupType = (typeof TYPES)[number];

function makeName(rng: Rng): string {
  let type: GroupType = 'a';
  for (let i = 0; i < 5; ++i) {
    // mais chance para um tipo que começa com consoante
    type = TYPES[rng.rand() % TYPES.length] as GroupType;
    if (type === 'ta' || type === 'tat') break;
    if (i >= 3 && (type === 'taa' || type === 'taat')) break;
  }
  const r = rng.rand() % 10;
  let numGroups = r < 5 ? 2 : r < 8 ? 3 : r < 9 ? 1 : 4;
  if (type !== 'taa' && numGroups === 1) numGroups = (rng.rand() % 2) + 2;
  let endCons = '';
  let endVow = '';
  let vowType: VowType = 'any';
  let name = '';
  let forceCons = '';
  for (let i = 0; i < numGroups; ++i) {
    const startsWithConsonant = type === 'ta' || type === 'taa' || type === 'taat' || type === 'tat';
    let group = '';
    if (startsWithConsonant) group += forceCons || (endCons ? startConsonant(rng, endCons) : consonant(rng));
    endCons = forceCons = '';
    let vow = startsWithConsonant || !endVow ? vowel(rng, vowType) : startVowel(rng, endVow, vowType);
    vowType = harmony(vow, vowType);
    group += vow;
    endVow = '';
    if (type === 'aa' || type === 'aat' || type === 'taa' || type === 'taat') {
      vow = contVowel(rng, vow, vowType);
      vowType = harmony(vow, vowType);
      group += vow;
    }
    if (type === 'aat' || type === 'at' || type === 'taat' || type === 'tat') {
      endCons = strRand(rng, 'hklmnprst');
      group += endCons;
    } else if (type === 'att' || type === 'tatt') {
      const midCons = strRand(rng, 'lmnr');
      group += midCons;
      endCons = endConsonant(rng, midCons);
      group += endCons;
      forceCons = endCons;
    } else endVow = vow;
    name += group;
    if (i + 1 === numGroups) break;
    const next: GroupType[] = ['ta'];
    switch (type) {
      case 'a':
      case 'aa':
        next.push('tat');
        if (i + 2 < numGroups) next.push('tatt');
        break;
      case 'at':
        next.push('taa');
        break;
      case 'ta':
      case 'taa':
        next.push('taa', 'taat', 'tat');
        if (i + 2 < numGroups) next.push('tatt');
        next.push('a', 'at');
        break;
      case 'taat':
      case 'tat':
        next.push('taa', 'tat');
        break;
      default:
    }
    type = next[rng.rand() % next.length] as GroupType;
  }
  if ('hjkmpv'.includes(name.charAt(name.length - 1))) name += vowel(rng, vowType);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** `finnish_name(max_length)`: um nome que caiba e, com 50% de chance, mais palavras. */
export function finnishName(rng: Rng, maxLength: number): string {
  let name: string;
  do name = makeName(rng);
  while (name.length > maxLength);
  for (;;) {
    const name2 = makeName(rng);
    if (rng.rand() % 2 && name.length + name2.length < maxLength) name += ' ' + name2;
    else break;
  }
  return name.slice(0, maxLength).trim();
}
