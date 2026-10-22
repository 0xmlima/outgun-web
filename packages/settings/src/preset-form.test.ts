// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { applyGamemod } from './gamemod.js';
import { defaultFormValue, fieldProblem, formFromLines, linesFromForm, PRESET_FIELD_BY_NAME, PRESET_FIELDS } from './preset-form.js';
import { casualPresetProblems, classicSettings, PRESETS } from './presets.js';

const field = (name: string) => PRESET_FIELD_BY_NAME.get(name)!;

describe('formulário de preset (OG-382)', () => {
  it('só regras de preset, cada uma com rótulo e controle; padrões aceitos pelo próprio gamemod', () => {
    expect(PRESET_FIELDS.length).toBeGreaterThan(90);
    expect(PRESET_FIELD_BY_NAME.has('server_name')).toBe(false);
    expect(PRESET_FIELD_BY_NAME.has('map')).toBe(false);
    for (const f of PRESET_FIELDS) expect(fieldProblem(f, defaultFormValue(f)), f.def.name).toBeUndefined();
    expect([defaultFormValue(field('pups_min')), defaultFormValue(field('friendly_fire')), defaultFormValue(field('time_limit')), defaultFormValue(field('player_collisions'))]).toEqual(['20%', '0%', '0', 'no']);
  });

  it('ida e volta: linhas → formulário → linhas dá as mesmas regras', () => {
    for (const p of PRESETS.filter((x) => x.mode === 'casual')) {
      const form = formFromLines(p.overrides);
      expect(form.other, p.id).toEqual([]);
      const back = linesFromForm(form);
      expect(applyGamemod(classicSettings(), back).settings, p.id).toEqual(applyGamemod(classicSettings(), p.overrides).settings);
      expect(formFromLines(back), p.id).toEqual(form);
    }
    const form = formFromLines('rocket_damage 100\n; comentário\nfriendly_fire 0.5\nplayer_collisions 1\npups_max 50 %\nnao_existe 3\n');
    expect(form).toEqual({ values: { rocket_damage: '100', friendly_fire: '50%', player_collisions: 'normal', pups_max: '50%' }, other: ['nao_existe 3'] });
    expect(linesFromForm(form)).toBe('friendly_fire 50%\nrocket_damage 100\npups_max 50%\nplayer_collisions normal\nnao_existe 3');
    expect(casualPresetProblems(linesFromForm({ ...form, other: [] }))).toEqual([]);
  });

  it('valor fora da faixa é recusado com a faixa na mensagem', () => {
    expect(fieldProblem(field('start_health'), '600')).toMatch(/between 1 and 500/);
    expect(fieldProblem(field('pups_max'), '40')).toMatch(/between 0 and 32/);
    expect(fieldProblem(field('pups_max'), '40%')).toBeUndefined();
    expect(fieldProblem(field('max_players'), '7')).toMatch(/even/);
  });
});
