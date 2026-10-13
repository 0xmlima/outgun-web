// SPDX-License-Identifier: GPL-2.0-or-later
// Preferências do jogador guardadas no navegador (idioma, fonte dos menus, opções gráficas). As opções completas do
// jogador chegam no OG-068.
import { detectLocale, LOCALES, translate, type Locale } from '@outgun/i18n';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { CLASSIC_BINDINGS, parseBindings, type Bindings } from '../game/input/bindings.js';

/** Fonte padrão dos menus (uma das 25 fontes do original convertidas no OG-013). */
export const DEFAULT_MENU_FONT = 'Kulmikas';

export interface Prefs {
  readonly locale: Locale;
  /** Nome do convidado (`Name` do `Menu_player`); com conta, vale o nome da conta. */
  readonly playerName: string;
  readonly menuFont: string;
  /** Tema gráfico (`''` = sem tema: cores de fábrica, como o `config/client.cfg` distribuído). */
  readonly graphicsTheme: string;
  /** Salas na tela em cada direção (1 no `client.cfg` distribuído; D-05). */
  readonly visibleRooms: number;
  readonly continuousTextures: boolean;
  /** Teclas de cada ação (OG-063). */
  readonly bindings: Bindings;
  /** Predição do próprio jogador (`Lag prediction`; ligada por padrão na web, D-18). */
  readonly lagPrediction: boolean;
  /** 0..10: quanto do atraso a predição compensa (`Lag prediction amount`). */
  readonly lagPredictionAmount: number;
  /** `Sounds enabled` (Ctrl+M alterna). */
  readonly soundEnabled: boolean;
  /** `Volume` 0..255 (padrão 128, passo 15 no menu do original). */
  readonly soundVolume: number;
}

const STORAGE_KEY = 'outgun.prefs';

function load(): Prefs {
  const fallback: Prefs = {
    locale: detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
    playerName: '',
    menuFont: DEFAULT_MENU_FONT,
    graphicsTheme: '',
    visibleRooms: 1,
    continuousTextures: true,
    bindings: CLASSIC_BINDINGS,
    lagPrediction: true,
    lagPredictionAmount: 10,
    soundEnabled: true,
    soundVolume: 128,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Prefs>;
    return {
      locale: LOCALES.includes(saved.locale as Locale) ? (saved.locale as Locale) : fallback.locale,
      playerName: typeof saved.playerName === 'string' ? saved.playerName.slice(0, 15) : fallback.playerName,
      menuFont: typeof saved.menuFont === 'string' ? saved.menuFont : fallback.menuFont,
      graphicsTheme: typeof saved.graphicsTheme === 'string' ? saved.graphicsTheme : fallback.graphicsTheme,
      visibleRooms:
        Number.isInteger(saved.visibleRooms) && saved.visibleRooms! >= 1 && saved.visibleRooms! <= 20
          ? saved.visibleRooms!
          : fallback.visibleRooms,
      continuousTextures:
        typeof saved.continuousTextures === 'boolean' ? saved.continuousTextures : fallback.continuousTextures,
      bindings: parseBindings(saved.bindings ? JSON.stringify(saved.bindings) : null),
      lagPrediction: typeof saved.lagPrediction === 'boolean' ? saved.lagPrediction : fallback.lagPrediction,
      lagPredictionAmount:
        Number.isInteger(saved.lagPredictionAmount) && saved.lagPredictionAmount! >= 0 && saved.lagPredictionAmount! <= 10
          ? saved.lagPredictionAmount!
          : fallback.lagPredictionAmount,
      soundEnabled: typeof saved.soundEnabled === 'boolean' ? saved.soundEnabled : fallback.soundEnabled,
      soundVolume:
        Number.isInteger(saved.soundVolume) && saved.soundVolume! >= 0 && saved.soundVolume! <= 255 ? saved.soundVolume! : fallback.soundVolume,
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
