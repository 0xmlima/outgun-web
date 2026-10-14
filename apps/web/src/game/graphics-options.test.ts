// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { defaultPrefs, parsePrefs } from '../app/prefs.js';
import { DEFAULT_GRAPHICS, emphasizeFlag, minimapFade, showNeighborMarkers } from './graphics-options.js';

describe('opções gráficas avançadas (OG-070)', () => {
  it('padrões = config/client.cfg distribuído', () => {
    const p = defaultPrefs();
    expect({
      scroll: p.scroll,
      lessTransparency: p.lessTransparency,
      minimapPlayers: p.minimapPlayers,
      highlightReturnedFlags: p.highlightReturnedFlags,
      emphasizeFlags: p.emphasizeFlags,
      oldFlagPositions: p.oldFlagPositions,
      spawnHighlight: p.spawnHighlight,
      neighborMarkers: p.neighborMarkers,
      boxVisibleArea: p.boxVisibleArea,
      viewOverBorder: p.viewOverBorder,
      repeatMap: p.repeatMap,
      mapInfoMode: p.mapInfoMode,
      underlineAccounts: p.underlineAccounts,
      stayDeadInMenus: p.stayDeadInMenus,
      backgroundTheme: p.backgroundTheme,
      preferThemeBackground: p.preferThemeBackground,
    }).toEqual(DEFAULT_GRAPHICS);
    expect(p.statsAlpha).toBe(255);
    expect(p.highlightUnknownMaps).toBe(false);
  });

  it('valores salvos inválidos voltam ao padrão', () => {
    const p = parsePrefs({ minimapPlayers: 'x', viewOverBorder: 'always', statsAlpha: 999, scroll: true }, defaultPrefs());
    expect(p).toMatchObject({ minimapPlayers: 'fade', viewOverBorder: 'always', statsAlpha: 255, scroll: true });
  });

  it('jogadores sumidos no minimapa: fade 10→20, esconder cedo 12, tarde 20', () => {
    expect(minimapFade('fade')).toEqual({ max: 20, start: 10 });
    expect(minimapFade('hideEarly')).toEqual({ max: 12, start: 12 });
    expect(minimapFade('hideLate')).toEqual({ max: 20, start: 20 });
  });

  it('ênfase das bandeiras e marcadores de vizinhos dependem das salas na tela', () => {
    expect(emphasizeFlag('never', 3)).toBe(false);
    expect(emphasizeFlag('multiRoom', 1)).toBe(false);
    expect(emphasizeFlag('multiRoom', 2)).toBe(true);
    expect(emphasizeFlag('always', 1)).toBe(true);
    expect(showNeighborMarkers('never', 1)).toBe(false);
    expect(showNeighborMarkers('oneRoom', 1)).toBe(true);
    expect(showNeighborMarkers('oneRoom', 2)).toBe(false);
    expect(showNeighborMarkers('always', 3)).toBe(true);
  });
});
