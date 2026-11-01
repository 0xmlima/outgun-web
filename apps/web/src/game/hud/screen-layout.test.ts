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
    expect(chatLines(l, false)).toBeGreaterThanOrEqual(3);
  });

  it('sem minimapa em 16:9: a sala fica maior que no modo coluna', () => {
    const l = screenLayout(1280, 720, font16, EN, false);
    expect(l.playfield.h).toBe(Math.round(354 * ((720 - 82 - 59) / 354)));
    expect(chatLines(l, false)).toBe(3);
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

describe('screenLayout em coluna, telas largas (OG-295)', () => {
  it('1920×1080: sala com a altura toda, chat no alto da coluna, times lado a lado', () => {
    const l = screenLayout(1920, 1080, font16, EN);
    expect(l.mode).toBe('coluna');
    expect(l.ui).toBe(1.5);
    expect(l.playfield).toEqual({ x: 0, y: 6, w: 1313, h: 985 });
    expect(l.chat.x).toBeGreaterThan(1313);
    expect(l.chatChars).toBeGreaterThanOrEqual(40);
    expect(chatLines(l, false)).toBe(7);
    expect(l.minimapPlace?.y).toBeGreaterThan(l.chat.y + l.chat.h);
    expect(l.scoreboard?.side).toBe(true);
  });

  it('2560×1440: escala 2, times lado a lado', () => {
    const l = screenLayout(2560, 1440, font16, EN);
    expect(l.mode).toBe('coluna');
    expect(l.ui).toBe(2);
    expect(l.scoreboard?.side).toBe(true);
    expect(chatLines(l, false)).toBe(7);
  });

  it('1440×900: a sala para pela largura e o chat volta para a faixa de cima', () => {
    const l = screenLayout(1440, 900, font16, EN);
    expect(l.mode).toBe('coluna');
    expect(l.playfield).toEqual({ x: 0, y: 145, w: 888, h: 666 });
    expect(l.chat).toEqual({ x: 4.5, y: 4.5, w: 1431, h: 140.5 });
    expect(chatLines(l, false)).toBe(3);
    expect(l.minimapPlace?.y).toBe(145);
    expect(l.scoreboard?.side).toBe(true);
  });
});

describe('screenLayout no celular (experimental)', () => {
  it('sala em cima na largura toda; minimapa e placar lado a lado embaixo, abaixo da barra', () => {
    const l = screenLayout(412, 731, font16, EN, true, 1, 'modern', undefined, false, true);
    expect(l.mode).toBe('celular');
    expect(l.style).toBe('classic');
    expect(l.playfield).toEqual({ x: 0, y: 0, w: 412, h: 309 });
    expect(l.minimapPlace!.y).toBeGreaterThan(l.indicatorsY);
    expect(l.scoreboard!.y1).toBe(l.minimapPlace!.y);
    expect(l.minimapPlace!.x + l.minimapPlace!.w).toBeLessThan(l.scoreboard!.x1);
  });
  it('minimapa e placar com a mesma altura, pela proporção do mapa', () => {
    const l = screenLayout(412, 731, font16, EN, true, 1, 'classic', undefined, false, true, { w: 4, h: 6 });
    const block = l.scoreboard!.y2 - l.scoreboard!.y1 + 1;
    expect(l.minimapPlace!.h).toBe(Math.trunc((l.minimapPlace!.w * 6 * 3) / (4 * 4)) + 1); // mapa na largura da coluna
    expect(block).toBe(l.minimapPlace!.h);
    expect(l.chat.x).toBeGreaterThanOrEqual(l.scoreboard!.x1); // chat na terceira página do placar
    expect(l.chat.y + l.chat.h).toBeLessThanOrEqual(l.scoreboard!.y2 + 1);
  });
  it('tela curta: a sala diminui para um time do placar caber inteiro', () => {
    const l = screenLayout(390, 480, font16, EN, true, 1, 'classic', undefined, false, true);
    expect(l.scoreboard!.y2 - l.scoreboard!.y1 + 1).toBeGreaterThanOrEqual(9 * 18 + 1);
    expect(l.scoreboard!.y2).toBeLessThan(480);
  });
  it('o chat escondido ainda tem largura (com 0 caracteres a quebra de linhas não termina)', () => {
    expect(screenLayout(360, 560, font16, EN, true, 1, 'classic', undefined, false, true).chatChars).toBeGreaterThan(0);
  });
});
