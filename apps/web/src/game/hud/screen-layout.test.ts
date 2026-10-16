// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { scoreboardName } from './hud-renderer.js';
import { autoHudScale, chatLines, screenLayout, type BarLabels, type FontMetrics } from './screen-layout.js';

const font16: FontMetrics = { height: 16, width: (t) => 8 * t.length };
const EN: BarLabels = { health: 'Health', energy: 'Energy', power: 'Power', turbo: 'Turbo', shadow: 'Shadow', weapon0: 'Weapon 0' };

describe('autoHudScale (RN-UI-06)', () => {
  it('passos de 0,5 pela altura, no mínimo 1', () => {
    expect(autoHudScale(640, 480)).toBe(1);
    expect(autoHudScale(1024, 768)).toBe(1);
    expect(autoHudScale(1280, 960)).toBe(1.5);
    expect(autoHudScale(1600, 1200)).toBe(1.5);
    expect(autoHudScale(2048, 1536)).toBe(2);
    expect(autoHudScale(1920, 1080)).toBe(1.5);
    expect(autoHudScale(2560, 1440)).toBe(2);
  });
});

describe('screenLayout em faixa (D-54, plan/specs/hud-resolucoes)', () => {
  // [largura, altura, escala, área de jogo, escala do placar, altura do minimapa]
  const cases = [
    [1024, 768, 1, { x: 0, y: 169, w: 720, h: 540 }, 1, 167],
    [1280, 960, 1.5, { x: 0, y: 211, w: 880, h: 660 }, 1.5, 196],
    [1440, 1080, 1.5, { x: 0, y: 238, w: 1004, h: 753 }, 1.5, 239],
    [1600, 1200, 1.5, { x: 0, y: 264, w: 1129, h: 847 }, 2, 221],
    [2048, 1536, 2, { x: 0, y: 338, w: 1440, h: 1080 }, 2.5, 300],
  ] as const;
  for (const [w, h, ui, playfield, sb, mmH] of cases)
    it(`${w}×${h}`, () => {
      const l = screenLayout(w, h, font16, EN);
      expect(l.mode).toBe('faixa');
      expect(l.ui).toBe(ui);
      expect(l.playfield).toEqual(playfield);
      expect(l.mul).toBeCloseTo(playfield.h / 354, 6);
      // chat na largura toda, em cima da área de jogo
      expect(l.chat).toEqual({ x: 3 * ui, y: 3 * ui, w: w - 6 * ui, h: playfield.y - 3 * ui });
      // minimapa começa na linha da área de jogo; o placar vai dele até o FPS
      expect(l.minimapPlace).toEqual({ x: playfield.w + 4 * ui, y: playfield.y, w: w - playfield.w - 8 * ui, h: mmH });
      expect(l.scoreboard).toEqual({ x1: playfield.w, y1: playfield.y + mmH + 4 * ui, x2: w - 1, y2: h - (16 * ui + 4) - 4 * ui - 1, scale: sb, side: false });
      expect(l.indicatorsY).toBe(playfield.y + playfield.h + 5 * ui);
      expect(chatLines(l, false)).toBeGreaterThanOrEqual(6);
    });

  it('a área de jogo sempre mostra uma sala inteira (proporção 472×354)', () => {
    for (const [w, h] of [[1024, 768], [1280, 960], [1600, 1200], [800, 600]] as const) {
      const p = screenLayout(w, h, font16, EN).playfield;
      expect(p.w / p.h).toBeCloseTo(472 / 354, 2);
    }
  });

  it('escala manual (OG-296) troca a automática', () => {
    expect(screenLayout(1600, 1200, font16, EN, true, 2).ui).toBe(2);
  });

  it('sem minimapa e placar: área de jogo centralizada, chat em cima', () => {
    const l = screenLayout(1024, 768, font16, EN, false);
    expect(l.mode).toBe('livre');
    expect(l.minimapPlace).toBeNull();
    expect(l.scoreboard).toBeNull();
    expect(l.playfield.x).toBe(Math.trunc((1024 - l.playfield.w) / 2));
    expect(l.chat.h).toBe(l.playfield.y - 3);
  });

  it('relógio vai para a segunda linha quando não cabe', () => {
    const wide: FontMetrics = { height: 16, width: (t) => 20 * t.length };
    const l = screenLayout(1024, 768, wide, EN);
    expect(l.timeY).toBe(l.indicatorsY + 18);
    expect(screenLayout(1024, 768, font16, EN).timeY).toBe(screenLayout(1024, 768, font16, EN).indicatorsY);
  });

  it('linhas de chat: a faixa sem a linha de digitação; com Insert até o fim da área de jogo', () => {
    const l = screenLayout(1024, 768, font16, EN);
    expect(chatLines(l, false)).toBe(Math.trunc(166 / 19) - 1);
    expect(chatLines(l, true)).toBe(Math.trunc((169 + 540 - 3) / 19) - 1);
  });
});

describe('scoreboardName (OG-294)', () => {
  it('corta no que cabe até a divisória dos frags, no máximo 15', () => {
    expect(scoreboardName('(ABC) jogador-longo')).toBe('(ABC) jogado...');
    expect(scoreboardName('(ABC) jogador-longo', 10)).toBe('(ABC) j...');
    expect(scoreboardName('Rato', 10)).toBe('Rato');
  });
});
