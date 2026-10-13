// SPDX-License-Identifier: GPL-2.0-or-later
// `/set` do console de admin (OG-046): `SettingManager::listSettings`, `executeLine` e `processLine`
// (src/server_settings.cpp:378-430) e os `get()` de cada tipo (src/gamemod.cpp, src/gamemod.h).
import { applySetting, commitSettings } from './gamemod.js';
import { SETTINGS, SETTINGS_BY_NAME, targetRecord, type Category, type SettingDef } from './registry.js';
import type { GameSettings } from './types.js';

/** Nomes das categorias como no original (`Category(id, descriptiveName)`). */
export const CATEGORY_NAMES: Readonly<Record<Category, string>> = {
  general: 'General settings',
  website: 'Server web site',
  bots: 'Bot settings',
  maps: 'Map rotation',
  game: 'Game config',
  health: 'Health, energy and shooting',
  powerups: 'Powerups',
  physics: 'Physics',
};

/** `ostringstream << double` (6 algarismos significativos). */
function streamDouble(v: number): string {
  return String(Number(v.toPrecision(6)));
}

/** Valor atual como o `get()` do original; '' = não pode ser consultada. */
export function settingValue(settings: GameSettings, def: SettingDef): string {
  const rec = 'target' in def ? targetRecord(settings, def.target[0]) : undefined;
  const raw = rec && 'target' in def ? rec[def.target[1]] : undefined;
  switch (def.kind) {
    case 'int':
      return String(Math.trunc(((raw as number) - (def.add ?? 0)) / (def.mul ?? 1)));
    case 'double':
      return streamDouble(raw as number);
    case 'bool':
      return raw ? '1' : '0';
    case 'percentage': {
      const v = raw as number;
      const perc = Math.trunc(v * 100 + 0.5);
      return perc !== 0 && Math.abs(v * 100 - perc) < 0.01 ? `${perc} %` : streamDouble(v);
    }
    case 'balance':
    case 'collisions':
      return String(raw);
    case 'string':
      return `"${String(raw)}"`;
    case 'powerupNum': {
      const [field, flag] = def.fields as [string, string];
      const p = targetRecord(settings, 'powerups');
      return p[flag] ? `${p[field] as number} %` : String(p[field] as number);
    }
    case 'maxPlayers':
      return String(settings.server.maxPlayers);
    case 'randomMaprot':
      return String(settings.server.randomMaprot);
    default:
      return ''; // addString, map, randomMap, ignore
  }
}

/** `listSettings`: uma linha por categoria com as settings permitidas. */
export function listSettings(allowed: (def: SettingDef) => boolean): string[] {
  const out: string[] = [];
  for (const category of Object.keys(CATEGORY_NAMES) as Category[]) {
    const names = SETTINGS.filter((s) => s.category === category && allowed(s)).map((s) => s.name);
    if (names.length) out.push(`${CATEGORY_NAMES[category]}: ${names.join(', ')}`);
  }
  return out;
}

export interface SetLineResult {
  /** Mensagens para o admin (vazio = alterado sem aviso, como no original). */
  feedback: string[];
  /** Houve alteração (e as configurações já passaram pelo commit). */
  changed: boolean;
}

/**
 * `executeLine` com `allowGet`: "nome" mostra o valor, "nome valor" altera. Altera `settings` no
 * lugar (o servidor de jogo usa a mesma referência) e faz o commit.
 */
export function executeSetLine(settings: GameSettings, line: string, allowed: (def: SettingDef) => boolean): SetLineResult {
  // processLine: `ist >> cmd; ist.ignore(); getline(ist, value);`
  const m = /^[ \t\n\v\f\r]*([^ \t\n\v\f\r]*)([\s\S]?)([\s\S]*)$/.exec(line);
  const cmd = m?.[1] ?? '';
  let value = m?.[3] ?? '';
  const def = SETTINGS_BY_NAME.get(cmd);
  if (!def) return { feedback: [`Unrecognized gamemod setting: '${cmd}'.`], changed: false };
  if (!allowed(def)) return { feedback: [`You don't have permission to access the setting ${cmd}.`], changed: false };
  if (value === '') {
    const current = settingValue(settings, def);
    return { feedback: [current ? `${cmd} = ${current}.` : `The setting ${cmd} can't be queried.`], changed: false };
  }
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1);
  const error = applySetting(settings, def, value);
  if (error) return { feedback: [error], changed: false };
  commitSettings(settings);
  return { feedback: [], changed: true };
}
