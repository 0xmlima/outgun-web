// SPDX-License-Identifier: GPL-2.0-or-later
// Preferências do jogador (o menu Options do original, OG-068, spec plan/specs/opcoes-jogador.md),
// guardadas no navegador e, com conta, também na API.
import { detectLocale, LOCALES, translate, type Locale } from '@outgun/i18n';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CLASSIC_BINDINGS, parseBindings, type Bindings } from '../game/input/bindings.js';

export type ShowNames = 'never' | 'sameRoom' | 'always';
export type ShowStats = 'off' | 'teams' | 'players';
export type SkipMaps = 'none' | 'dimmed' | 'highlighted';
/** Opções gráficas avançadas do original (OG-070, plan/specs/opcoes-graficas.md). */
export type MinimapPlayers = 'fade' | 'hideEarly' | 'hideLate';
export type EmphasizeFlags = 'never' | 'multiRoom' | 'always';
export type NeighborMarkers = 'never' | 'oneRoom' | 'always';
export type ViewOverBorder = 'never' | 'mapDoesntFit' | 'mapWraps' | 'always';

export interface Prefs {
  readonly locale: Locale;
  /** Nome do convidado (`Name` do `Menu_player`); com conta, vale o nome da conta. */
  readonly playerName: string;
  /** As 16 cores na ordem de preferência (`Favorite colors`, RN-TIM-05). */
  readonly favoriteColors: readonly number[];
  /** `Use random color`: não envia as favoritas. */
  readonly randomColor: boolean;
  /** Tema gráfico (`''` = sem tema: cores de fábrica, como o `config/client.cfg` distribuído). */
  readonly graphicsTheme: string;
  /** `Colour theme` e `Prefer main theme colours`. */
  readonly colourTheme: string;
  readonly preferThemeColours: boolean;
  /** Salas na tela em cada direção (1 no `client.cfg` distribuído; D-05). */
  readonly visibleRooms: number;
  readonly continuousTextures: boolean;
  /** `Show player names` (D-26: padrão "na mesma sala"). */
  readonly showNames: ShowNames;
  /** `FPS limit` (0 = sem limite; 1..10000). */
  readonly fpsLimit: number;
  // OG-070: opções gráficas avançadas (padrões do client.cfg distribuído)
  readonly scroll: boolean;
  readonly lessTransparency: boolean;
  readonly minimapPlayers: MinimapPlayers;
  readonly highlightReturnedFlags: boolean;
  readonly emphasizeFlags: EmphasizeFlags;
  readonly oldFlagPositions: boolean;
  readonly spawnHighlight: boolean;
  readonly neighborMarkers: NeighborMarkers;
  readonly boxVisibleArea: boolean;
  readonly viewOverBorder: ViewOverBorder;
  readonly repeatMap: boolean;
  readonly highlightUnknownMaps: boolean;
  /** `Stats screen alpha` 0..255 (passo 15). */
  readonly statsAlpha: number;
  readonly mapInfoMode: boolean;
  readonly stayDeadInMenus: boolean;
  /** `Underline master-authenticated players`: quem tem conta, no placar. */
  readonly underlineAccounts: boolean;
  /** Fundo da tela (`background.pcx`): tema escolhido (`''` = nenhum) e "Prefer main theme background". */
  readonly backgroundTheme: string;
  readonly preferThemeBackground: boolean;
  /** Teclas de cada ação (OG-063). */
  readonly bindings: Bindings;
  /** Predição do próprio jogador (`Lag prediction`; ligada por padrão na web, D-18). */
  readonly lagPrediction: boolean;
  /** 0..10: quanto do atraso a predição compensa (`Lag prediction amount`). */
  readonly lagPredictionAmount: number;
  /** Manda estatísticas anônimas da rede (OG-108). */
  readonly shareNetStats: boolean;
  /** `Bandwidth for out-of-room players (cps)`: 0..640, passo 20; vai ao servidor como cps/20. */
  readonly minimapBandwidth: number;
  readonly showFlagMessages: boolean;
  readonly showKillMessages: boolean;
  /** `Show stats after the round` (telas do OG-066). */
  readonly showStats: ShowStats;
  /** `Show server info when connected` (F5, OG-066). */
  readonly showServerInfo: boolean;
  /** `Skip maps in rotation` (lista de mapas F2, OG-066). */
  readonly skipMaps: SkipMaps;
  /** Mensagens rápidas (Alt+1..0). */
  readonly quickMessagesEnabled: boolean;
  readonly quickMessagesImmediate: boolean;
  readonly quickMessages: readonly string[];
  /** `Sounds enabled` (Ctrl+M alterna). */
  readonly soundEnabled: boolean;
  /** `Volume` 0..255 (padrão 128, passo 15 no menu do original). */
  readonly soundVolume: number;
  readonly soundTheme: string;
  /** Trilha sonora (OG-222, RN-MUS-04): ligada e volume 0..100, separados dos efeitos. */
  readonly musicEnabled: boolean;
  readonly musicVolume: number;
}

const STORAGE_KEY = 'outgun.prefs';
export const QUICK_MESSAGES = 10;
export const QUICK_MESSAGE_LENGTH = 30;

/** As 16 cores: as válidas da lista salva primeiro (sem repetir), depois as que faltam. */
export function completeColors(saved: unknown): number[] {
  const list = Array.isArray(saved) ? saved.filter((c): c is number => Number.isInteger(c) && c >= 0 && c < 16) : [];
  const out = [...new Set(list)];
  for (let c = 0; c < 16; c++) if (!out.includes(c)) out.push(c);
  return out;
}

export function defaultPrefs(languages: readonly string[] = []): Prefs {
  return {
    locale: detectLocale(languages),
    playerName: '',
    favoriteColors: completeColors([]),
    randomColor: false,
    graphicsTheme: '',
    colourTheme: '',
    preferThemeColours: true,
    visibleRooms: 1,
    continuousTextures: true,
    showNames: 'sameRoom',
    fpsLimit: 0,
    scroll: false,
    lessTransparency: false,
    minimapPlayers: 'fade',
    highlightReturnedFlags: false,
    emphasizeFlags: 'never',
    oldFlagPositions: false,
    spawnHighlight: true,
    neighborMarkers: 'never',
    boxVisibleArea: true,
    viewOverBorder: 'mapWraps',
    repeatMap: false,
    highlightUnknownMaps: false,
    statsAlpha: 255,
    mapInfoMode: false,
    stayDeadInMenus: true,
    underlineAccounts: true,
    backgroundTheme: '',
    preferThemeBackground: true,
    bindings: CLASSIC_BINDINGS,
    lagPrediction: true,
    lagPredictionAmount: 10,
    shareNetStats: true,
    minimapBandwidth: 80,
    showFlagMessages: true,
    showKillMessages: true,
    showStats: 'off',
    showServerInfo: false,
    skipMaps: 'dimmed',
    quickMessagesEnabled: false,
    quickMessagesImmediate: false,
    quickMessages: new Array<string>(QUICK_MESSAGES).fill(''),
    soundEnabled: true,
    soundVolume: 128,
    soundTheme: 'Visa',
    musicEnabled: true,
    musicVolume: 50,
  };
}

const int = (v: unknown, lo: number, hi: number, fallback: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string, max = 64) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/**
 * Preferências salvas (navegador ou conta), conferidas campo a campo; o que vier errado volta ao padrão.
 * Campos que deixaram de existir (ex.: `menuFont`, removido no OG-200) são ignorados e somem no próximo salvamento.
 */
export function parsePrefs(saved: Record<string, unknown>, fallback: Prefs): Prefs {
  const quick = Array.isArray(saved.quickMessages) ? saved.quickMessages : [];
  return {
    locale: LOCALES.includes(saved.locale as Locale) ? (saved.locale as Locale) : fallback.locale,
    playerName: str(saved.playerName, fallback.playerName, 15),
    favoriteColors: saved.favoriteColors === undefined ? fallback.favoriteColors : completeColors(saved.favoriteColors),
    randomColor: bool(saved.randomColor, fallback.randomColor),
    graphicsTheme: str(saved.graphicsTheme, fallback.graphicsTheme),
    colourTheme: str(saved.colourTheme, fallback.colourTheme),
    preferThemeColours: bool(saved.preferThemeColours, fallback.preferThemeColours),
    visibleRooms: int(saved.visibleRooms, 1, 20, fallback.visibleRooms),
    continuousTextures: bool(saved.continuousTextures, fallback.continuousTextures),
    showNames: oneOf(saved.showNames, ['never', 'sameRoom', 'always'], fallback.showNames),
    fpsLimit: int(saved.fpsLimit, 0, 10000, fallback.fpsLimit),
    scroll: bool(saved.scroll, fallback.scroll),
    lessTransparency: bool(saved.lessTransparency, fallback.lessTransparency),
    minimapPlayers: oneOf(saved.minimapPlayers, ['fade', 'hideEarly', 'hideLate'], fallback.minimapPlayers),
    highlightReturnedFlags: bool(saved.highlightReturnedFlags, fallback.highlightReturnedFlags),
    emphasizeFlags: oneOf(saved.emphasizeFlags, ['never', 'multiRoom', 'always'], fallback.emphasizeFlags),
    oldFlagPositions: bool(saved.oldFlagPositions, fallback.oldFlagPositions),
    spawnHighlight: bool(saved.spawnHighlight, fallback.spawnHighlight),
    neighborMarkers: oneOf(saved.neighborMarkers, ['never', 'oneRoom', 'always'], fallback.neighborMarkers),
    boxVisibleArea: bool(saved.boxVisibleArea, fallback.boxVisibleArea),
    viewOverBorder: oneOf(saved.viewOverBorder, ['never', 'mapDoesntFit', 'mapWraps', 'always'], fallback.viewOverBorder),
    repeatMap: bool(saved.repeatMap, fallback.repeatMap),
    highlightUnknownMaps: bool(saved.highlightUnknownMaps, fallback.highlightUnknownMaps),
    statsAlpha: int(saved.statsAlpha, 0, 255, fallback.statsAlpha),
    mapInfoMode: bool(saved.mapInfoMode, fallback.mapInfoMode),
    stayDeadInMenus: bool(saved.stayDeadInMenus, fallback.stayDeadInMenus),
    underlineAccounts: bool(saved.underlineAccounts, fallback.underlineAccounts),
    backgroundTheme: str(saved.backgroundTheme, fallback.backgroundTheme),
    preferThemeBackground: bool(saved.preferThemeBackground, fallback.preferThemeBackground),
    bindings: saved.bindings ? parseBindings(JSON.stringify(saved.bindings)) : fallback.bindings,
    lagPrediction: bool(saved.lagPrediction, fallback.lagPrediction),
    lagPredictionAmount: int(saved.lagPredictionAmount, 0, 10, fallback.lagPredictionAmount),
    shareNetStats: bool(saved.shareNetStats, fallback.shareNetStats),
    minimapBandwidth: int(saved.minimapBandwidth, 0, 640, fallback.minimapBandwidth),
    showFlagMessages: bool(saved.showFlagMessages, fallback.showFlagMessages),
    showKillMessages: bool(saved.showKillMessages, fallback.showKillMessages),
    showStats: oneOf(saved.showStats, ['off', 'teams', 'players'], fallback.showStats),
    showServerInfo: bool(saved.showServerInfo, fallback.showServerInfo),
    skipMaps: oneOf(saved.skipMaps, ['none', 'dimmed', 'highlighted'], fallback.skipMaps),
    quickMessagesEnabled: bool(saved.quickMessagesEnabled, fallback.quickMessagesEnabled),
    quickMessagesImmediate: bool(saved.quickMessagesImmediate, fallback.quickMessagesImmediate),
    quickMessages: Array.from({ length: QUICK_MESSAGES }, (_, i) => str(quick[i], fallback.quickMessages[i] ?? '', QUICK_MESSAGE_LENGTH)),
    soundEnabled: bool(saved.soundEnabled, fallback.soundEnabled),
    soundVolume: int(saved.soundVolume, 0, 255, fallback.soundVolume),
    soundTheme: str(saved.soundTheme, fallback.soundTheme),
    musicEnabled: bool(saved.musicEnabled, fallback.musicEnabled),
    musicVolume: int(saved.musicVolume, 0, 100, fallback.musicVolume),
  };
}

function load(): Prefs {
  const fallback = defaultPrefs(typeof navigator === 'undefined' ? [] : navigator.languages);
  try {
    return parsePrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>, fallback);
  } catch {
    return fallback;
  }
}

interface PrefsContextValue {
  readonly prefs: Prefs;
  readonly setPrefs: (change: Partial<Prefs>) => void;
  /** Troca todas as preferências (as da conta ao entrar), sem gravar de volta na conta. */
  readonly replacePrefs: (next: Prefs) => void;
  /** Muda a cada `setPrefs` (não a cada `replacePrefs`): a conta só grava mudanças do jogador. */
  readonly revision: number;
  /** `_()` do original no idioma escolhido. */
  readonly t: (text: string, ...args: string[]) => string;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState(load);
  const [revision, setRevision] = useState(0);
  // outra aba mudou as opções: esta passa a usar as mesmas, para não gravar na conta as antigas (OG-285)
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== STORAGE_KEY || ev.newValue === null) return;
      try {
        setState((old) => parsePrefs(JSON.parse(ev.newValue as string) as Record<string, unknown>, old));
      } catch {
        // valor ilegível: fica o desta aba
      }
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);
  const value = useMemo<PrefsContextValue>(() => {
    const store = (next: Prefs) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // navegação privada ou armazenamento bloqueado: vale só nesta sessão
      }
      return next;
    };
    return {
      prefs,
      revision,
      setPrefs: (change) => {
        setState((old) => store({ ...old, ...change }));
        setRevision((r) => r + 1);
      },
      replacePrefs: (next) => setState(store(next)),
      t: (text, ...args) => translate(prefs.locale, text, ...args),
    };
  }, [prefs, revision]);
  return <PrefsContext value={value}>{children}</PrefsContext>;
}

export function usePrefs(): PrefsContextValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs fora de PrefsProvider');
  return value;
}
