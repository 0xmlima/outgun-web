// SPDX-License-Identifier: GPL-2.0-or-later
// Instalar o Outgun pelo navegador (OG-323, D-58). O Chrome e o Edge disparam `beforeinstallprompt`
// logo na carga da página, então o evento é guardado aqui desde o início e a página de download
// (OG-325) oferece o botão só quando ele existir.
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // sem a mini barra do navegador: a oferta fica na página de download
    deferred = e as InstallPromptEvent;
    emit();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** Rodando como app instalado (PWA) ou dentro do cliente desktop (OG-324). */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  return matchMedia('(display-mode: standalone)').matches || / OutgunDesktop\//.test(navigator.userAgent);
}

/** Ponte do cliente desktop (OG-373, `apps/desktop/preload.cjs`); ausente no navegador e nos clientes antigos. */
export interface DesktopBridge {
  frameRate(): 'vsync' | 'unlocked';
  frameRateActive(): 'vsync' | 'unlocked';
  setFrameRate(mode: 'vsync' | 'unlocked'): void;
  /** Conquistas da Steam (OG-396); ausentes antes da 2.41. */
  steamAvailable?(): boolean;
  syncSteamAchievements?(ids: readonly string[]): void;
}

/** Manda ao app da Steam os marcos da conta (OG-396, D-77); fora da Steam não faz nada. */
export function syncSteamAchievements(ids: readonly string[]): void {
  const bridge = desktopBridge();
  if (ids.length > 0 && bridge?.steamAvailable?.()) bridge.syncSteamAchievements?.(ids);
}

/** Limite de FPS "sem limite" de verdade (cliente desktop sem VSync, OG-373); 0 é o automático. */
export const FPS_UNLIMITED = 10_000;

export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as { outgunDesktop?: DesktopBridge }).outgunDesktop;
}

export function isDesktopClient(): boolean {
  return typeof navigator !== 'undefined' && / OutgunDesktop\//.test(navigator.userAgent);
}

/** `install` quando o navegador oferece a instalação; null quando não (Firefox, Safari, já instalado). */
export function useInstallPrompt(): (() => Promise<boolean>) | null {
  const available = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
    () => false,
  );
  if (!available) return null;
  return async () => {
    const event = deferred;
    if (!event) return false;
    deferred = null;
    emit();
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted';
  };
}
