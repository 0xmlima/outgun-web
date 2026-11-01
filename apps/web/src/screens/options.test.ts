// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { completeColors, defaultPrefs, parsePrefs } from '../app/prefs.js';
import { moveColor, optionsTab, preferColor, shownColors } from './options.js';

describe('opções do jogador (OG-068)', () => {
  it('favoritas: as 32 cores (OG-411), sem repetir, as salvas primeiro; medalha salva sai (OG-532)', () => {
    expect(completeColors([5, 5, 99, 2])).toEqual([5, 2, ...Array.from({ length: 32 }, (_, i) => i).filter((c) => c !== 5 && c !== 2)]);
    expect(completeColors('x')).toHaveLength(32);
    expect(completeColors([32, 1]).slice(0, 2)).toEqual([1, 0]);
  });

  it('medalha não aparece entre as cores do boneco: vai no número (OG-532)', () => {
    expect(shownColors([33, 0, 1])).toEqual([0, 1]);
    expect(shownColors([34, 0, 32])).toEqual([0]);
  });

  it('Colorselect: ←/→ escolhe; com Ctrl leva a cor junto; não passa das pontas', () => {
    expect(moveColor([0, 1, 2], 0, 1, false)).toEqual({ colors: [0, 1, 2], selected: 1 });
    expect(moveColor([0, 1, 2], 0, 1, true)).toEqual({ colors: [1, 0, 2], selected: 1 });
    expect(moveColor([0, 1, 2], 0, -1, true)).toEqual({ colors: [0, 1, 2], selected: 0 });
  });

  it('clicar numa cor a torna a primeira favorita, sem perder as outras (OG-285)', () => {
    expect(preferColor([0, 1, 2, 3], 2)).toEqual([2, 0, 1, 3]);
    expect(preferColor([0, 1, 2], 0)).toEqual([0, 1, 2]);
    expect(preferColor([0, 1, 2], 9)).toEqual([0, 1, 2]);
  });

  it('cores e mensagens rápidas sobrevivem ao salvar e carregar de novo (OG-285)', () => {
    const d = defaultPrefs([]);
    const changed = { ...d, favoriteColors: preferColor(d.favoriteColors, 5), quickMessages: d.quickMessages.map((m, i) => (i === 0 ? 'gg' : m)) };
    const back = parsePrefs(JSON.parse(JSON.stringify(changed)) as Record<string, unknown>, d);
    expect(back.favoriteColors[0]).toBe(d.favoriteColors[5]);
    expect(back.quickMessages[0]).toBe('gg');
  });

  it('padrões do client.cfg distribuído e da web (D-05, D-26)', () => {
    const d = defaultPrefs(['pt-BR']);
    expect(d).toMatchObject({ showKillMessages: true, showFlagMessages: true, minimapBandwidth: 80, fpsLimit: 0, showNames: 'sameRoom', visibleRooms: 1, soundVolume: 128 });
    expect(d.quickMessages).toHaveLength(10);
  });

  it('valores salvos inválidos voltam ao padrão (navegador ou conta)', () => {
    const d = defaultPrefs([]);
    const p = parsePrefs({ fpsLimit: -1, showNames: 'sempre', minimapBandwidth: 700, quickMessages: ['oi', 3, 'x'.repeat(40)], playerName: 'Nome bem comprido demais' }, d);
    expect(p.fpsLimit).toBe(0);
    expect(p.showNames).toBe('sameRoom');
    expect(p.minimapBandwidth).toBe(80);
    expect(p.quickMessages.slice(0, 3)).toEqual(['oi', '', 'x'.repeat(30)]);
    expect(p.playerName).toBe('Nome bem compri');
  });

  it('prefs antigas com menuFont (removida no OG-200) carregam sem erro e perdem o campo', () => {
    const p = parsePrefs({ menuFont: 'Kulmikas', soundVolume: 200 }, defaultPrefs([]));
    expect(p.soundVolume).toBe(200);
    expect('menuFont' in p).toBe(false);
  });

  it('abas das opções (OG-202): os endereços dos submenus antigos abrem a aba que os contém', () => {
    expect(optionsTab(undefined)).toBe('game');
    expect(optionsTab('player')).toBe('game');
    expect(optionsTab('quick-messages')).toBe('game');
    expect(optionsTab('theme')).toBe('graphics');
    expect(optionsTab('graphics')).toBe('graphics');
    expect(optionsTab('sounds')).toBe('sounds');
    expect(optionsTab('controls')).toBe('controls');
    expect(optionsTab('language')).toBe('language');
    expect(optionsTab('xyz')).toBe('game');
  });

  it('trilha sonora (OG-222): ligada a 50% por padrão; prefs antigas sem os campos ganham o padrão', () => {
    const d = defaultPrefs([]);
    expect(d).toMatchObject({ musicEnabled: true, musicVolume: 50 });
    expect(parsePrefs({ soundVolume: 90 }, d)).toMatchObject({ musicEnabled: true, musicVolume: 50, soundVolume: 90 });
  });

  it('trilha sonora: valores da conta (sincronização) valem; inválidos voltam ao padrão', () => {
    const d = defaultPrefs([]);
    // o PrefsSync aplica as opções da conta com parsePrefs, como as demais
    expect(parsePrefs({ musicEnabled: false, musicVolume: 20 }, d)).toMatchObject({ musicEnabled: false, musicVolume: 20 });
    expect(parsePrefs({ musicEnabled: 'não', musicVolume: 150 }, d)).toMatchObject({ musicEnabled: true, musicVolume: 50 });
    // ida e volta pelo JSON salvo no navegador e na conta
    const saved = JSON.parse(JSON.stringify({ ...d, musicEnabled: false, musicVolume: 35 })) as Record<string, unknown>;
    expect(parsePrefs(saved, d)).toEqual({ ...d, musicEnabled: false, musicVolume: 35 });
  });
});
