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
