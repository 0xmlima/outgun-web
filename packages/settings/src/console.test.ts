// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { executeSetLine, listSettings, settingValue } from './console.js';
import { presetSettings } from './presets.js';
import { SETTINGS_BY_NAME } from './registry.js';

const all = () => true;

describe('/set (OG-046, SettingManager::executeLine)', () => {
  it('mostra o valor no formato do get() do original', () => {
    const s = presetSettings('classic');
    const v = (name: string) => settingValue(s, SETTINGS_BY_NAME.get(name)!);
    expect(v('capture_limit')).toBe('8');
    expect(v('respawn_time')).toBe('2');
    expect(v('friction')).toBe('0.45');
    expect(v('pups_min')).toBe('20 %');
    expect(v('balance_teams')).toBe('no');
    expect(v('server_name')).toBe('"Anonymous host"');
    expect(v('info_message')).toBe('');
    expect(executeSetLine(s, 'capture_limit', all).feedback).toEqual(['capture_limit = 8.']);
    expect(executeSetLine(s, 'info_message', all).feedback).toEqual(["The setting info_message can't be queried."]);
  });

  it('altera no lugar, sem mensagem em caso de sucesso, e faz o commit', () => {
    const s = presetSettings('classic');
    expect(executeSetLine(s, 'capture_limit 3', all)).toEqual({ feedback: [], changed: true });
    expect(s.world.captureLimit).toBe(3);
    expect(executeSetLine(s, 'time_limit 10', all).changed).toBe(true);
    expect(settingValue(s, SETTINGS_BY_NAME.get('time_limit')!)).toBe('10');
    // commit: sem chances de power-up, não há power-ups
    for (const p of ['shield', 'turbo', 'shadow', 'power', 'weapon', 'megahealth', 'deathbringer']) executeSetLine(s, `pup_chance_${p} 0`, all);
    expect(s.powerups.pupsMax).toBe(0);
  });

  it('erros e permissões com os textos do original', () => {
    const s = presetSettings('classic');
    expect(executeSetLine(s, 'xyz 1', all).feedback).toEqual(["Unrecognized gamemod setting: 'xyz'."]);
    expect(executeSetLine(s, 'capture_limit -1', all).feedback[0]).toMatch(/^Can't set capture_limit to '-1' - expecting /);
    expect(executeSetLine(s, 'server_name x', (d) => d.category !== 'general').feedback).toEqual([
      "You don't have permission to access the setting server_name.",
    ]);
  });

  it('lista por categoria só o que é permitido', () => {
    const list = listSettings((d) => d.category === 'physics');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatch(/^Physics: friction, drag, acceleration/);
    expect(listSettings(() => false)).toEqual([]);
  });
});
