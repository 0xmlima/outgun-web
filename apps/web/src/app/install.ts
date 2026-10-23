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

/** Modos do monitor principal no Windows (OG-401): lista, escolha gravada, opção de inicialização e o do sistema. */
export interface DisplayModes {
  readonly modes: readonly string[];
  readonly current: string | null;
  readonly launch: string | null;
  readonly system: string | null;
}

/** Ponte do cliente desktop (OG-373, `apps/desktop/preload.cjs`); ausente no navegador e nos clientes antigos. */
export interface DesktopBridge {
  frameRate(): 'vsync' | 'unlocked';
  frameRateActive(): 'vsync' | 'unlocked';
  setFrameRate(mode: 'vsync' | 'unlocked'): void;
  /** Resolução do monitor (OG-401, só Windows; ausente antes da 2.41.1): "1920x1080@144". */
  displayModes?(): DisplayModes | null;
  setDisplayMode?(mode: string | null): void;
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
/** Piso do limite de FPS onde o jogo pode passar do monitor (OG-400: "liberar geral"). */
export const FPS_MIN = 240;

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

/** O FPS pode passar da taxa do monitor nesta abertura (cliente desktop sem VSync). */
export function fpsUnlocked(): boolean {
  return desktopBridge()?.frameRateActive() === 'unlocked';
}

// OG-400: os clientes 2.39 e 2.40 guardam a opção de VSync e a aplicam ao abrir; quem a ligou fica
// preso à taxa do monitor. O site desliga a opção gravada, e o FPS fica livre na próxima abertura.
if (desktopBridge()?.frameRate() === 'vsync') desktopBridge()?.setFrameRate('unlocked');
