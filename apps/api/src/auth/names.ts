// SPDX-License-Identifier: GPL-2.0-or-later
// Validação do nome de usuário = nome em jogo (RN-NOM-01, check_name em src/commont.cpp:190).

export const MAX_NAME_LENGTH = 15; // maxPlayerNameLength (src/commont.h:53)

/** is_nonprintable_char (src/utility.cpp:296); acima de 255 também: as fontes só têm Latin-1. */
function nonPrintable(code: number): boolean {
  return code < 32 || (code >= 128 && code <= 159) || code > 255;
}

const isSpace = (ch: string) => ch === ' ' || ch === '\u00a0';

/** Igual a check_name: até 15 caracteres imprimíveis, não só espaços, sem espaço nas pontas. */
export function checkName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  if ([...name].every(isSpace)) return false;
  for (let i = 0; i < name.length; i++) if (nonPrintable(name.charCodeAt(i))) return false;
  return !isSpace(name[0]!) && !isSpace(name[name.length - 1]!);
}
