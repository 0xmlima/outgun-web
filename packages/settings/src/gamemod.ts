// SPDX-License-Identifier: GPL-2.0-or-later
// Leitura de arquivos gamemod com a semântica de `SettingManager::processLine`/`loadGamemod`/`commit`
// (src/server_settings.cpp) e dos tipos `GS_*` (src/gamemod.h, src/gamemod.cpp). Uma linha inválida
// é registrada e ignorada, mantendo o valor anterior, como no original.
import { SETTINGS_BY_NAME, targetRecord, type SettingDef } from './registry.js';
import type { GameSettings, MapRotationEntry } from './types.js';

export interface GamemodMessage {
  line: number;
  setting: string;
  message: string;
}

export interface GamemodResult {
  settings: GameSettings;
  /** Linhas recusadas ou desconhecidas (mensagens do original, em inglês). */
  errors: GamemodMessage[];
}

/** `trim` do original: espaço, tab, \n, \r e 0xA0. */
function trim(text: string): string {
  return text.replace(/^[ \t\n\r\u00a0]+|[ \t\n\r\u00a0]+$/g, '');
}

/** Espaços de `isspace` no locale C, que `operator>>` pula antes de um número. */
const leadingSpace = /^[ \t\n\v\f\r]*/;

/**
 * `istringstream rd(trim(v)); rd >> número;` seguido de `rd.peek() == EOF`: o número precisa ocupar
 * todo o texto. Devolve undefined se a leitura falhar ou sobrar algo.
 */
function readWholeInt(text: string): number | undefined {
  const t = trim(text).replace(leadingSpace, '');
  if (!/^[+-]?\d+$/.test(t)) return undefined;
  return Number(t);
}

/** Número decimal como o `num_get` da libstdc++ (sem hexadecimal, inf ou nan). */
const DOUBLE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/;

function readWholeDouble(text: string): number | undefined {
  const t = trim(text).replace(leadingSpace, '');
  const match = DOUBLE.exec(t);
  if (!match || match[0].length !== t.length) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

/** Número seguido de `%` (com espaços opcionais entre eles), para porcentagens e power-ups. */
function readPercent(text: string, integer: boolean): number | undefined {
  const t = trim(text).replace(leadingSpace, '');
  const match = (integer ? /^([+-]?\d+)[ \t\n\v\f\r]*%$/ : /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[ \t\n\v\f\r]*%$/).exec(t);
  return match ? Number(match[1]) : undefined;
}

const fmtInt = (n: number) => String(n);

function expectInt(def: Extract<SettingDef, { kind: 'int' }>): string {
  const lo = def.min;
  const hi = def.max;
  const limitMin = def.unsigned ? 0 : -2147483648;
  const limitMax = def.unsigned ? 4294967295 : 2147483647;
  const orZero = def.allow0 ? ', or 0' : '';
  const minBound = lo !== undefined && lo !== limitMin;
  const maxBound = hi !== undefined && hi !== limitMax;
  if (minBound && maxBound) {
    if (hi === (lo as number) + 1) return `${fmtInt(lo as number)} or ${fmtInt(hi as number)}${orZero}`;
    return `an integer, between ${fmtInt(lo as number)} and ${fmtInt(hi as number)}, inclusive${orZero}`;
  }
  if (maxBound) return `an integer, at most ${fmtInt(hi as number)}${orZero}`;
  if (minBound) return `an integer, at least ${fmtInt(lo as number)}${orZero}`;
  return 'an integer';
}

function expectDouble(def: Extract<SettingDef, { kind: 'double' }>): string {
  if (def.min === undefined && def.max === undefined) return 'a real number';
  if (def.min === undefined) return `a real number, at most ${def.max}`;
  if (def.max === undefined) return `a real number, at least ${def.min}`;
  return `a real number, between ${def.min} and ${def.max}, inclusive`;
}

/** Aplica um valor a uma setting. Devolve a mensagem de erro, ou undefined se aceito. */
export function applySetting(settings: GameSettings, def: SettingDef, value: string): string | undefined {
  const fail = (expect: string) => `Can't set ${def.name} to '${value}' - expecting ${expect}.`;
  switch (def.kind) {
    case 'ignore':
      return undefined;
    case 'int': {
      const val = readWholeInt(value);
      const lo = def.min ?? (def.unsigned ? 0 : -2147483648);
      const hi = def.max ?? (def.unsigned ? 4294967295 : 2147483647);
      // Divergência mínima: `operator>>` em unsigned aceitaria "-1" (vira 2^32 - 1); aqui é recusado.
      if (val === undefined || ((val < lo || val > hi) && !(val === 0 && def.allow0))) return fail(expectInt(def));
      targetRecord(settings, def.target[0])[def.target[1]] = val * (def.mul ?? 1) + (def.add ?? 0);
      return undefined;
    }
    case 'double': {
      const val = readWholeDouble(value);
      if (val === undefined || val < (def.min ?? -Number.MAX_VALUE) || val > (def.max ?? Number.MAX_VALUE)) {
        return fail(expectDouble(def));
      }
      targetRecord(settings, def.target[0])[def.target[1]] = val;
      return undefined;
    }
    case 'bool': {
      const t = trim(value);
      if (t !== '0' && t !== '1') return fail('0 or 1');
      targetRecord(settings, def.target[0])[def.target[1]] = t === '1';
      return undefined;
    }
    case 'percentage': {
      const plain = readWholeDouble(value);
      const percent = plain === undefined ? readPercent(value, false) : undefined;
      const result = plain !== undefined ? plain : percent !== undefined ? percent / 100 : undefined;
      if (result === undefined || result < 0) return fail("a real number or 'x %' with x 0 or greater");
      targetRecord(settings, def.target[0])[def.target[1]] = result;
      return undefined;
    }
    case 'balance': {
      const t = trim(value);
      if (t !== 'no' && t !== 'balance' && t !== 'shuffle') return fail('one of no, balance, and shuffle');
      targetRecord(settings, def.target[0])[def.target[1]] = t;
      return undefined;
    }
    case 'collisions': {
      const t = trim(value);
      const mapped = ({ no: 'no', '0': 'no', normal: 'normal', '1': 'normal', special: 'special', '2': 'special' } as Record<string, string>)[t];
      if (!mapped) return fail('one of no, normal, and special');
      targetRecord(settings, def.target[0])[def.target[1]] = mapped;
      return undefined;
    }
    case 'string': {
      // GS_String com allowEmpty = false recusa vazio e valores que começam com espaço/tab.
      if (def.nonEmpty && (value === '' || value[0] === ' ' || value[0] === '\t')) return fail('non-empty string');
      targetRecord(settings, def.target[0])[def.target[1]] = value;
      return undefined;
    }
    case 'addString':
      (targetRecord(settings, def.target[0])[def.target[1]] as string[]).push(value);
      return undefined;
    case 'powerupNum': {
      const [field, flag] = def.fields as [string, string];
      const plain = readWholeInt(value);
      const powerups = targetRecord(settings, 'powerups');
      if (plain !== undefined) {
        if (plain < 0 || plain > 32) return fail("an integer between 0 and 32, or 'n %' with n 0 or greater");
        powerups[field] = plain;
        powerups[flag] = false;
        return undefined;
      }
      const percent = readPercent(value, true);
      if (percent === undefined || percent < 0) return fail("an integer between 0 and 32, or 'n %' with n 0 or greater");
      powerups[field] = percent;
      powerups[flag] = true;
      return undefined;
    }
    case 'maxPlayers': {
      const val = readWholeInt(value);
      if (val === undefined || val < 2 || val > 32 || val % 2 !== 0) return fail('an even integer between 2 and 32');
      settings.server.maxPlayers = val;
      return undefined;
    }
    case 'randomMaprot': {
      const val = readWholeInt(value);
      if (val === undefined || val < 0 || val > 2) return fail('an integer, between 0 and 2, inclusive');
      settings.server.randomMaprot = val as 0 | 1 | 2;
      return undefined;
    }
    case 'map': {
      // O original valida carregando o mapa; aqui só registra o nome (o servidor valida com o parser).
      settings.maps.push({ type: 'file', name: trim(value) });
      return undefined;
    }
    case 'randomMap': {
      const parts = value.trim().split(/[ \t\n\v\f\r]+/).filter(Boolean);
      const [w, h, ...rest] = parts;
      const width = w !== undefined ? readWholeInt(w) : undefined;
      const height = h !== undefined ? readWholeInt(h) : undefined;
      const reals = [0.2, 0.1, 0.5, 0.1];
      let symmetry = 's';
      let ok = width !== undefined && height !== undefined && width > 0 && height > 0 && rest.length <= 5;
      rest.forEach((token, i) => {
        if (i < 4) {
          const v = readWholeDouble(token);
          if (v === undefined || v < 0 || v > 1) ok = false;
          else reals[i] = v;
        } else symmetry = token;
      });
      if (!ok || (symmetry !== 's' && symmetry !== 'a')) {
        return fail("two positive integers, four real numbers between 0 and 1, then 's' or 'a', all separated by spaces; some from the end possibly omitted");
      }
      const entry: MapRotationEntry = {
        type: 'random',
        width: width as number,
        height: height as number,
        overEdge: reals[0] as number,
        respawnArea: reals[1] as number,
        repetitiveRespawnArea: reals[2] as number,
        wildFlag: reals[3] as number,
        asymmetric: symmetry === 'a',
      };
      settings.maps.push(entry);
      return undefined;
    }
  }
}

/**
 * Pós-processamento de `SettingManager::commit`: sem chances de power-up, não há power-ups; e o
 * mínimo nunca passa do máximo (só comparável na mesma unidade, ou quando o máximo é 0).
 */
export function commitSettings(settings: GameSettings): void {
  const p = settings.powerups;
  const chanceSum =
    p.pupChanceShield + p.pupChanceTurbo + p.pupChanceShadow + p.pupChancePower + p.pupChanceWeapon + p.pupChanceMegahealth + p.pupChanceDeathbringer;
  if (chanceSum === 0) p.pupsMax = 0;
  if ((p.pupsMinPercentage === p.pupsMaxPercentage && p.pupsMin > p.pupsMax) || p.pupsMax === 0) p.pupsMin = p.pupsMax;
}

/** Aplica o texto de um gamemod (linha a linha) e faz o commit. Não altera `base`. */
export function applyGamemod(base: GameSettings, text: string): GamemodResult {
  const settings = JSON.parse(JSON.stringify(base)) as GameSettings; // só dados JSON (sem structuredClone fora do DOM/Node)
  const errors: GamemodMessage[] = [];
  // getline_skip_comments: quebra em \n/\r, ignora vazias e linhas que começam com ';'.
  const lines = text.split(/[\r\n]+/);
  let lineNumber = 0;
  for (const raw of lines) {
    lineNumber++;
    if (raw === '' || raw[0] === ';') continue;
    // processLine: `ist >> cmd; ist.ignore(); getline(ist, value);`
    const cmdMatch = /^[ \t\n\v\f\r]*([^ \t\n\v\f\r]*)([\s\S]?)([\s\S]*)$/.exec(raw);
    const cmd = cmdMatch?.[1] ?? '';
    let value = cmdMatch?.[3] ?? '';
    if (cmd === '') continue;
    const def = SETTINGS_BY_NAME.get(cmd);
    if (!def) {
      errors.push({ line: lineNumber, setting: cmd, message: `Unrecognized gamemod setting: '${cmd}'.` });
      continue;
    }
    if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1);
    const error = applySetting(settings, def, value);
    if (error) errors.push({ line: lineNumber, setting: cmd, message: error });
  }
  commitSettings(settings);
  return { settings, errors };
}
