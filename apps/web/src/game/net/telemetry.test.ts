// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { browserName, NetTelemetry, percentile } from './telemetry.js';

describe('telemetria de rede (OG-108)', () => {
  it('resume 60 s de partida: percentis, correções por minuto e segundos travados', () => {
    const t = new NetTelemetry({ room: 'main', version: 'abc', browser: 'Chrome 130' });
    let frames = 0;
    let corrections = 0;
    for (let s = 0; s <= 60; s++) {
      frames += s % 20 === 0 ? 5 : 10; // 3 segundos com quedas (s = 20, 40, 60)
      if (s % 10 === 0) corrections++;
      t.sample({ pingMs: s < 57 ? 120 : 300, lagFrames: 1.5, fps: s === 30 ? 20 : 60, framesReceived: frames, corrections });
    }
    expect(t.report()).toEqual({
      room: 'main',
      version: 'abc',
      browser: 'Chrome 130',
      durationS: 60,
      pingP50: 120,
      pingP95: 300,
      lagP50: 150,
      lagP95: 150,
      fpsP5: 60,
      fpsP50: 60,
      correctionsPerMin: 6,
      stallSeconds: 3,
      framesPerSecond: 9.75,
      inputSendP50: null,
      inputSendP95: null,
      inputRenderP50: null,
      inputRenderP95: null,
    });
    // recomeça: sem dados novos, nada a mandar
    expect(t.report()).toBeNull();
  });

  it('menos de 30 s não gera resumo; sem ping ainda, fica nulo', () => {
    const t = new NetTelemetry({ room: 'r', version: 'v', browser: 'b' });
    for (let s = 0; s <= 10; s++) t.sample({ pingMs: undefined, lagFrames: 1, fps: 60, framesReceived: s * 10, corrections: 0 });
    expect(t.report()).toBeNull();
  });

  it('nome curto do navegador', () => {
    expect(browserName('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36')).toBe('Chrome 130');
    expect(browserName('Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge 130');
    expect(browserName('Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15')).toBe('Safari 18');
    expect(browserName('Mozilla/5.0 Gecko/20100101 Firefox/131.0')).toBe('Firefox 131');
    // iOS e navegador de app (OG-510)
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1')).toBe('Chrome 130');
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/131.0 Mobile/15E148 Safari/605.1.15')).toBe('Firefox 131');
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0.0')).toBe('Safari webview');
    expect(browserName('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36')).toBe('Chrome 130 webview');
    expect(percentile([5, 1, 3], 50)).toBe(3);
  });
});
