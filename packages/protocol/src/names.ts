// SPDX-License-Identifier: GPL-2.0-or-later
// Nomes de jogador (RN-NOM-01..03, spec plan/specs/names.md): validação como check_name
// (src/commont.cpp:190), comparação como makeComparable (src/auth.cpp:88), convidados e clan tag.

/** maxPlayerNameLength (src/commont.h:53). */
export const MAX_NAME_LENGTH = 15;
export const MAX_CLAN_TAG_LENGTH = 6;
/** Marca dos convidados em jogo (RN-NOM-02). */
export const GUEST_SUFFIX = '*';

/** is_nonprintable_char (src/utility.cpp:296); acima de 255 também: as fontes só têm Latin-1. */
function nonPrintable(code: number): boolean {
  return code < 32 || (code >= 128 && code <= 159) || code > 255;
}

const isSpace = (ch: string | undefined) => ch === ' ' || ch === '\u00a0';

/** check_name: até 15 caracteres imprimíveis, não só espaços, sem espaço (ou NBSP) nas pontas. */
export function checkName(name: string): boolean {
  if (name.length > MAX_NAME_LENGTH) return false;
  if ([...name].every((ch) => isSpace(ch))) return false;
  for (let i = 0; i < name.length; i++) if (nonPrintable(name.charCodeAt(i))) return false;
  return !isSpace(name[0]) && !isSpace(name[name.length - 1]);
}

/** makeComparable do original (locale "C": só [A-Za-z0-9] são alfanuméricos). */
export function makeComparable(name: string): string {
  let out = '';
  for (const ch of name) {
    if (/[A-Za-z0-9]/.test(ch)) out += ch.toLowerCase();
    else if (out !== '') out += '.';
  }
  return out.replace(/\.+$/, '');
}

const FOLD: Readonly<Record<string, string>> = { ß: 'ss', æ: 'ae', Æ: 'ae', ø: 'o', Ø: 'o', ð: 'd', Ð: 'd', þ: 'th', Þ: 'th', µ: 'u' };

/** Tira acentos de Latin-1 (é→e, ß→ss...) antes de comparar (divergência 2 da spec). */
export function foldAccents(name: string): string {
  return [...name]
    .map((ch) => FOLD[ch] ?? ch.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .join('');
}

/** Forma usada para saber se dois nomes são "o mesmo" (unicidade e proteção de nome). */
export function comparableName(name: string): string {
  return makeComparable(foldAccents(name));
}

/** Nome registrável: válido e com alguma letra ou dígito (como as linhas do auth.txt). */
export function checkRegisteredName(name: string): boolean {
  return checkName(name) && comparableName(name) !== '';
}

/** Nome exibido de um convidado: o escolhido (cortado para caber) + `*`. */
export function guestName(base: string): string {
  return base.slice(0, MAX_NAME_LENGTH - GUEST_SUFFIX.length).replace(/[ \u00a0]+$/, '') + GUEST_SUFFIX;
}

/** Clan tag: 1 a 6 caracteres com as regras do nome, sem parênteses (exibida como "(TAG) nome"). */
export function checkClanTag(tag: string): boolean {
  return tag.length >= 1 && tag.length <= MAX_CLAN_TAG_LENGTH && checkName(tag) && !/[()]/.test(tag);
}

/** Nome como aparece no chat (src/server.cpp:1513). */
export function chatName(name: string, clanTag: string | null | undefined): string {
  return clanTag ? `(${clanTag}) ${name}` : name;
}
