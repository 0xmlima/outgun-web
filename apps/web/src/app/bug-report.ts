// SPDX-License-Identifier: GPL-2.0-or-later
// Relato de bug do site (OG-429): os campos do modelo de issue do GitHub e o contexto que o cliente
// preenche sozinho. As áreas são as mesmas de `BUG_AREAS` na API (routes/feedback.ts).
import { browserName } from '../game/net/telemetry.js';
import { isDesktopClient } from './install.js';

export const BUG_AREAS = ['match', 'lobby', 'ranked', 'portal', 'clan', 'report', 'replay', 'account', 'moderation', 'desktop', 'connection', 'other'] as const;
export type BugArea = (typeof BUG_AREAS)[number];
export type BugFrequency = 'always' | 'sometimes' | 'once';
export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface BugReport {
  area: BugArea;
  summary: string;
  steps: string;
  expected: string;
  actual: string;
  frequency: BugFrequency;
  severity: BugSeverity;
  evidence: string;
  workaround: string;
}

export const EMPTY_BUG: BugReport = { area: 'match', summary: '', steps: '', expected: '', actual: '', frequency: 'sometimes', severity: 'medium', evidence: '', workaround: '' };

type T = (text: string, ...args: string[]) => string;

export function areaLabels(t: T): Record<BugArea, string> {
  return {
    match: t('Match / HUD'),
    lobby: t('Lobby and rooms'),
    ranked: t('Ranked and series'),
    portal: t('Portal (home, profile, ranking, hall of fame)'),
    clan: t('Clan'),
    report: t('Match report / PDF'),
    replay: t('Replay / spectator'),
    account: t('Account and sign in'),
    moderation: t('Moderation / admin'),
    desktop: t('Steam / desktop app'),
    connection: t('Server / connection'),
    other: t('Other'),
  };
}

export function frequencyLabels(t: T): Record<BugFrequency, string> {
  return { always: t('Always'), sometimes: t('Sometimes'), once: t('It happened once') };
}

export function severityLabels(t: T): Record<BugSeverity, string> {
  return {
    critical: t('Critical: brings down the match or the server, loses data or account, security flaw'),
    high: t('High: keeps me from playing or using a screen, no workaround'),
    medium: t('Medium: gets in the way, but there is a workaround'),
    low: t('Low: visual, text, detail'),
  };
}

/** Sistema operacional pelo user agent (o servidor guarda o user agent inteiro também). */
function osName(ua: string): string {
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return 'outro';
}

/** O que o jogador não precisa digitar: versão, onde joga, sistema e hora com fuso. */
export function autoContext(): Record<string, string> {
  const ua = navigator.userAgent;
  return {
    version: import.meta.env.VITE_RELEASE ?? 'dev',
    client: isDesktopClient() ? 'app desktop/Steam' : browserName(ua),
    os: osName(ua),
    device: matchMedia('(pointer: coarse)').matches ? 'celular' : 'computador',
    time: new Date().toString().slice(0, 33), // "Mon Oct 26 2026 21:40:00 GMT-0300"
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
