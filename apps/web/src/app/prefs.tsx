// SPDX-License-Identifier: GPL-2.0-or-later
// Preferências do jogador guardadas no navegador (idioma, fonte dos menus). As opções completas do
// jogador chegam no OG-068; o remapeamento de teclas no OG-063.
import { detectLocale, LOCALES, translate, type Locale } from '@outgun/i18n';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Fonte padrão dos menus (uma das 25 fontes do original convertidas no OG-013). */
export const DEFAULT_MENU_FONT = 'Kulmikas';

export interface Prefs {
  readonly locale: Locale;
  readonly menuFont: string;
}

const STORAGE_KEY = 'outgun.prefs';

function load(): Prefs {
  const fallback: Prefs = {
    locale: detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
    menuFont: DEFAULT_MENU_FONT,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Prefs>;
    return {
      locale: LOCALES.includes(saved.locale as Locale) ? (saved.locale as Locale) : fallback.locale,
      menuFont: typeof saved.menuFont === 'string' ? saved.menuFont : fallback.menuFont,
    };
  } catch {
    return fallback;
  }
}

interface PrefsContextValue {
  readonly prefs: Prefs;
  readonly setPrefs: (change: Partial<Prefs>) => void;
  /** `_()` do original no idioma escolhido. */
  readonly t: (text: string, ...args: string[]) => string;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState(load);
  const value = useMemo<PrefsContextValue>(
    () => ({
      prefs,
      setPrefs: (change) =>
        setState((old) => {
          const next = { ...old, ...change };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // navegação privada ou armazenamento bloqueado: vale só nesta sessão
          }
          return next;
        }),
      t: (text, ...args) => translate(prefs.locale, text, ...args),
    }),
    [prefs],
  );
  return <PrefsContext value={value}>{children}</PrefsContext>;
}

export function usePrefs(): PrefsContextValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs fora de PrefsProvider');
  return value;
}
