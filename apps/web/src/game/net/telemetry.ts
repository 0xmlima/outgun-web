// SPDX-License-Identifier: GPL-2.0-or-later
// Telemetria de rede do beta (OG-108): uma amostra por segundo durante a partida online e um
// resumo anônimo (percentis, correções de predição, quedas de frames, fps) enviado ao sair, a cada
// 5 minutos e ao fechar a aba. Sem nome, conta ou IP: a API guarda só os números e a sala.

export interface NetSample {
  /** Ping medido pelo servidor (ms), se já chegou. */
  pingMs: number | undefined;
  /** Atraso médio dos controles (`averageLag`, em frames de 100 ms). */
  lagFrames: number;
  fps: number;
  /** Totais da sessão (contadores do ClientSession). */
  framesReceived: number;
  corrections: number;
  /** Latências das mudanças de controle desde a última amostra (OG-369), em ms desde a tecla. */
  inputSendMs?: readonly number[];
  inputRenderMs?: readonly number[];
}

export interface NetReport {
  room: string;
  version: string;
  browser: string;
  durationS: number;
  pingP50: number | null;
  pingP95: number | null;
  lagP50: number;
  lagP95: number;
  fpsP5: number;
  fpsP50: number;
  correctionsPerMin: number;
  /** Segundos com menos de 8 dos 10 frames esperados (perda, travada, aba em segundo plano). */
  stallSeconds: number;
  framesPerSecond: number;
  /** Tecla→envio e tecla→tela (OG-369), em ms; null sem mudanças de controle no trecho. */
  inputSendP50: number | null;
  inputSendP95: number | null;
  inputRenderP50: number | null;
  inputRenderP95: number | null;
}

/** Percentil `p` (0..100) de uma amostra, como o "nearest rank". */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] as number;
}

/** Percentil em ms inteiros, ou null sem amostras. */
function msPercentile(values: readonly number[], p: number): number | null {
  return values.length ? Math.round(percentile(values, p)) : null;
}

/** Navegador embutido de app (OG-510): Instagram, Facebook, WhatsApp, webview do Android. */
const WEBVIEW = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/;

/** "Chrome 130", "Firefox 131", "Safari 18"... (só o navegador e a versão principal); " webview" no navegador de um app. */
export function browserName(ua: string): string {
  const webview = WEBVIEW.test(ua) ? ' webview' : '';
  // ordem importa: o Edge e o Opera também dizem "Chrome"; o Chrome também diz "Safari"; no iOS
  // todos são Safari por dentro e se identificam por EdgiOS/CriOS/FxiOS (OG-510)
  const tokens = [['EdgiOS', 'Edge'], ['Edg', 'Edge'], ['OPR', 'Opera'], ['FxiOS', 'Firefox'], ['Firefox', 'Firefox'], ['CriOS', 'Chrome'], ['Chrome', 'Chrome'], ['Version', 'Safari']] as const;
  for (const [token, name] of tokens) {
    const m = new RegExp(`${token}/(\\d+)`).exec(ua);
    if (m && (token !== 'Version' || /Safari/.test(ua))) return `${name} ${m[1]}${webview}`;
  }
  // webview do iOS sem "Version/": só o motor
  if (/iPhone|iPad/.test(ua) && /AppleWebKit/.test(ua)) return `Safari${webview || ' webview'}`;
  return webview ? `outro${webview}` : 'outro';
}

/** Junta as amostras de um trecho da partida; `report()` devolve o resumo e recomeça. */
export class NetTelemetry {
  private pings: number[] = [];
  private lags: number[] = [];
  private fps: number[] = [];
  private inputSend: number[] = [];
  private inputRender: number[] = [];
  private stall = 0;
  private seconds = 0;
  private firstFrames = -1;
  private firstCorrections = 0;
  private last: NetSample | null = null;

  constructor(private readonly info: { room: string; version: string; browser: string }) {}

  sample(s: NetSample): void {
    if (this.firstFrames < 0) {
      this.firstFrames = s.framesReceived;
      this.firstCorrections = s.corrections;
    } else if (this.last) {
      if (s.framesReceived - this.last.framesReceived < 8) this.stall++;
      this.seconds++;
    }
    if (s.pingMs !== undefined && s.pingMs > 0) this.pings.push(s.pingMs);
    this.lags.push(s.lagFrames * 100);
    if (s.fps > 0) this.fps.push(s.fps);
    if (s.inputSendMs) this.inputSend.push(...s.inputSendMs);
    if (s.inputRenderMs) this.inputRender.push(...s.inputRenderMs);
    this.last = s;
  }

  /** Resumo do trecho (null com menos de 30 s de partida) e recomeço. */
  report(): NetReport | null {
    const last = this.last;
    if (!last || this.seconds < 30) return null;
    const r: NetReport = {
      ...this.info,
      durationS: this.seconds,
      pingP50: this.pings.length ? percentile(this.pings, 50) : null,
      pingP95: this.pings.length ? percentile(this.pings, 95) : null,
      lagP50: Math.round(percentile(this.lags, 50)),
      lagP95: Math.round(percentile(this.lags, 95)),
      fpsP5: Math.round(percentile(this.fps, 5)),
      fpsP50: Math.round(percentile(this.fps, 50)),
      correctionsPerMin: Math.round(((last.corrections - this.firstCorrections) / this.seconds) * 60 * 10) / 10,
      stallSeconds: this.stall,
      framesPerSecond: Math.round(((last.framesReceived - this.firstFrames) / this.seconds) * 100) / 100,
      inputSendP50: msPercentile(this.inputSend, 50),
      inputSendP95: msPercentile(this.inputSend, 95),
      inputRenderP50: msPercentile(this.inputRender, 50),
      inputRenderP95: msPercentile(this.inputRender, 95),
    };
    this.pings = [];
    this.inputSend = [];
    this.inputRender = [];
    this.lags = [];
    this.fps = [];
    this.stall = 0;
    this.seconds = 0;
    this.firstFrames = last.framesReceived;
    this.firstCorrections = last.corrections;
    return r;
  }
}

/** Envia o resumo; `sendBeacon` chega mesmo com a aba fechando. */
export function sendNetReport(apiUrl: string, report: NetReport): void {
  const body = JSON.stringify(report);
  if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(`${apiUrl}/telemetry`, new Blob([body], { type: 'application/json' }))) return;
  void fetch(`${apiUrl}/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
