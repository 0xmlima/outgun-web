// SPDX-License-Identifier: GPL-2.0-or-later
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CLASSIC_GAMEMOD } from './classic-gamemod.js';
import { applyGamemod } from './gamemod.js';
import { casualPresetProblems, classicSettings, hasNoPowerups, PRESETS, presetSettings, settingsOf } from './presets.js';
import { SETTINGS } from './registry.js';
import { codeDefaults, type GameSettings } from './types.js';

const repoRoot = join(import.meta.dirname, '../../..');
const tracesDir = join(repoRoot, 'tools/parity/traces');

interface Header {
  gamemod: string;
  settings: Record<'world' | 'powerups' | 'physics', Record<string, number>>;
}

function header(file: string): Header {
  const first = gunzipSync(readFileSync(join(tracesDir, file))).toString('utf8').split('\n', 1)[0] as string;
  return JSON.parse(first) as Header;
}

/** Nome do campo no C++ a partir do nome TS (camelCase → snake_case), com as exceções do original. */
const CPP_NAME: Record<string, string> = {
  friction: 'fric',
  acceleration: 'accel',
  friendlyDeathbringer: 'friendly_db',
  allowFreeTurning: 'allowFreeTurning',
};
const toCpp = (name: string) =>
  CPP_NAME[name] ?? name.replace(/([a-z])(\d+)/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const ENUMS: Record<string, Record<string, number>> = {
  balanceTeams: { no: 0, balance: 1, shuffle: 2 },
  playerCollisions: { no: 0, normal: 1, special: 2 },
};

/** Converte um grupo TS para o formato numérico do cabeçalho do trace. */
function asCpp(group: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(group)) {
    out[toCpp(name)] = typeof value === 'boolean' ? Number(value) : typeof value === 'string' ? (ENUMS[name]?.[value] ?? NaN) : (value as number);
  }
  return out;
}

describe('gamemod x configurações efetivas do original (cabeçalho dos traces)', () => {
  const files = readdirSync(tracesDir).filter((f) => f.endsWith('.jsonl.gz') && !f.endsWith('.bots.jsonl.gz')); // os .bots.* são da IA (OG-050), sem cabeçalho de configuração
  it('há traces com casos limite de configuração', () => {
    expect(files).toEqual(expect.arrayContaining(['settings-classic.jsonl.gz', 'settings-edge.jsonl.gz', 'settings-zero-chances.jsonl.gz']));
  });

  for (const file of files) {
    it(file, () => {
      const h = header(file);
      const { settings } = applyGamemod(codeDefaults(), h.gamemod);
      for (const group of ['world', 'powerups', 'physics'] as const) {
        const ours = asCpp(settings[group] as unknown as Record<string, unknown>);
        const theirs = h.settings[group];
        // Todos os campos do original existem do nosso lado e vice-versa.
        expect(Object.keys(ours).sort(), group).toEqual(Object.keys(theirs).sort());
        for (const [name, value] of Object.entries(theirs)) {
          expect(ours[name], `${group}.${name}`).toBeCloseTo(value, 9);
        }
      }
    });
  }
});

describe('registro de settings', () => {
  it('contém exatamente as settings de src/server_settings.cpp', () => {
    const source = readFileSync(join(repoRoot, '_legacy/src/server_settings.cpp'), 'latin1');
    const names = new Set([...source.matchAll(/new GS_[\w<>]+\s*\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1]));
    // Settings criadas por variáveis (portSetting, ipSetting, privSetting, srvmonitSetting).
    for (const extra of ['server_port', 'server_ip', 'private_server', 'srvmonit_port']) names.add(extra);
    expect(new Set(SETTINGS.map((s) => s.name))).toEqual(names);
  });
});

describe('leitura de gamemod', () => {
  const apply = (text: string) => applyGamemod(classicSettings(), text);

  it('o Clássico embutido é idêntico a config/gamemod.txt e lê sem erros', () => {
    expect(CLASSIC_GAMEMOD).toBe(readFileSync(join(repoRoot, '_legacy/config/gamemod.txt'), 'latin1'));
    expect(applyGamemod(codeDefaults(), CLASSIC_GAMEMOD).errors).toEqual([]);
  });

  it('valor inválido é recusado com a mensagem do original e mantém o anterior', () => {
    const { settings, errors } = apply('rocket_damage abc\nstart_health 600\nsudden_death yes');
    expect(settings.world.rocketDamage).toBe(70);
    expect(settings.world.startHealth).toBe(100);
    expect(errors.map((e) => e.message)).toEqual([
      "Can't set rocket_damage to 'abc' - expecting an integer, at least 0.",
      "Can't set start_health to '600' - expecting an integer, between 1 and 500, inclusive.",
      "Can't set sudden_death to 'yes' - expecting 0 or 1.",
    ]);
  });

  it('setting desconhecida é registrada', () => {
    expect(apply('foo 1').errors[0]?.message).toBe("Unrecognized gamemod setting: 'foo'.");
  });

  it('unidades: minutos e segundos viram frames; percentuais; aspas', () => {
    const { settings } = apply('time_limit 5\nidlekick_time 0\nvote_block_time 2\nfriendly_fire 50 %\nrocket_damage "80"\npups_max 10 %');
    expect(settings.world.timeLimit).toBe(3000);
    expect(settings.server.idlekickTime).toBe(0);
    expect(settings.server.voteBlockTime).toBe(1200);
    expect(settings.physics.friendlyFire).toBe(0.5);
    expect(settings.world.rocketDamage).toBe(80);
    expect([settings.powerups.pupsMax, settings.powerups.pupsMaxPercentage]).toEqual([10, true]);
  });

  it('server_name não aceita valor começando com espaço (separador duplo), como o original', () => {
    expect(apply('server_name  Sala').errors).toHaveLength(1);
    expect(apply('server_name Sala do Thiago').settings.server.serverName).toBe('Sala do Thiago');
  });

  it('mapas fixos e aleatórios na rotação', () => {
    const { settings, errors } = apply('map outgun1\nrandom_map 3 2 0.3\nrandom_map 0 2');
    expect(settings.maps).toEqual([
      { type: 'file', name: 'outgun1' },
      { type: 'random', width: 3, height: 2, overEdge: 0.3, respawnArea: 0.1, repetitiveRespawnArea: 0.5, wildFlag: 0.1, asymmetric: false },
    ]);
    expect(errors).toHaveLength(1);
  });

  it('max_run_speed do servidor fica nos defaults do código (27,1875) mesmo com outra física', () => {
    const { settings } = apply('acceleration 3\nrun_acceleration 2');
    expect(settings.physics.maxRunSpeed).toBeCloseTo(27.1875, 9);
  });
});

describe('presets por modo (D-10)', () => {
  it('todos os presets são válidos', () => {
    for (const preset of PRESETS) expect(() => presetSettings(preset.id)).not.toThrow();
  });

  it('Ranked é o único preset do modo ranked, travado e sem power-ups', () => {
    const ranked = PRESETS.filter((p) => p.mode === 'ranked');
    expect(ranked.map((p) => [p.id, p.locked])).toEqual([['ranked', true]]);
    expect(hasNoPowerups(presetSettings('ranked'))).toBe(true);
    expect(hasNoPowerups(presetSettings('classic'))).toBe(false);
  });

  it('Ranked difere do Clássico só nos power-ups e nos bots (D-11)', () => {
    const classic = classicSettings();
    const ranked: GameSettings = presetSettings('ranked');
    expect(ranked.world).toEqual(classic.world);
    expect(ranked.physics).toEqual(classic.physics);
    expect(ranked.server).toEqual({ ...classic.server, minBots: 0, botsFill: 0 });
  });
});

describe('presets Casual do painel (OG-087)', () => {
  it('aceita regras de jogo, saúde, power-ups, física e bots; recusa as do servidor e as desconhecidas', () => {
    expect(casualPresetProblems('; comentário\nrocket_damage 140\npups_max 50%\nbots_fill 4\nfriction 0.5\nmax_players 8')).toEqual([]);
    expect(casualPresetProblems('server_name Teste')).toEqual(['server_name: configuração do servidor, não de preset']);
    expect(casualPresetProblems('nao_existe 1')).toEqual(['nao_existe: configuração desconhecida']);
    expect(casualPresetProblems('rocket_damage muito').length).toBeGreaterThan(0);
  });

  it('settingsOf aplica as linhas sobre o Clássico', () => {
    expect(settingsOf({ id: 'teste', overrides: 'rocket_damage 140' }).world.rocketDamage).toBe(140);
  });
});
