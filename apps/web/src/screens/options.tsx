// SPDX-License-Identifier: GPL-2.0-or-later
// Opções do jogador (OG-068, spec plan/specs/opcoes-jogador.md): os submenus do `Menu_options` do
// original com as opções que fazem sentido no navegador. As removidas (modo de vídeo, joystick da
// Allegro, arquivos de log, senha de ranking, relatório de bugs) estão listadas na spec.
import { catalog, LOCALES } from '@outgun/i18n';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { loadManifest } from '../assets.js';
import { useAccount } from '../app/account.js';
import { api } from '../app/api.js';
import { QUICK_MESSAGE_LENGTH, usePrefs, type Prefs, type ShowNames, type ShowStats, type SkipMaps } from '../app/prefs.js';
import { useFontNames } from '../ui/fonts.js';
import { Menu, type MenuItem } from '../ui/Menu.js';

function cycle<T>(list: readonly T[], current: T, delta: number): T {
  const index = list.indexOf(current);
  return list[(index + delta + list.length) % list.length] ?? current;
}

const check = (on: boolean) => (on ? '[X]' : '[ ]');
/** Limites de FPS oferecidos (o original aceita 1..10000; 60 é o padrão). */
const FPS_LIMITS = [30, 50, 60, 75, 100, 120, 144, 200, 240, 10000];

/** Troca de lugar a cor selecionada com a vizinha (`Colorselect::handleKey` com Ctrl). */
export function moveColor(colors: readonly number[], selected: number, delta: -1 | 1, carry: boolean): { colors: number[]; selected: number } {
  const next = selected + delta;
  if (next < 0 || next >= colors.length) return { colors: [...colors], selected };
  const out = [...colors];
  if (carry) [out[selected], out[next]] = [out[next]!, out[selected]!];
  return { colors: out, selected: next };
}

function useManifestLists() {
  const [lists, setLists] = useState<{ themes: string[]; colourThemes: string[]; soundThemes: string[]; playerColours: string[] }>({
    themes: [],
    colourThemes: [],
    soundThemes: [],
    playerColours: [],
  });
  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => {
      if (!alive || !m) return;
      setLists({
        themes: Object.keys(m.graphics),
        colourThemes: Object.entries(m.graphics).filter(([, v]) => v.colours).map(([k]) => k),
        soundThemes: Object.keys(m.sounds),
        playerColours: Array.from({ length: 16 }, (_, i) => m.defaultColours[`player${String(i + 1).padStart(2, '0')}`] ?? '#888888'),
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return lists;
}

export function OptionsScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const go = (path: string) => () => void navigate(`/options/${path}`);
  const items: MenuItem[] = [
    { kind: 'action', label: t('Player options'), onActivate: go('player') },
    { kind: 'action', label: t('Game options'), onActivate: go('game') },
    { kind: 'action', label: t('Quick messages'), onActivate: go('quick-messages') },
    { kind: 'action', label: t('Controls'), onActivate: go('controls') },
    { kind: 'action', label: t('Theme and font'), onActivate: go('theme') },
    { kind: 'action', label: t('Graphic options'), onActivate: go('graphics') },
    { kind: 'action', label: t('Sound options'), onActivate: go('sounds') },
    { kind: 'action', label: t('Choose language'), onActivate: go('language') },
  ];
  return <Menu caption={t('Options')} items={items} onBack={() => void navigate('/')} />;
}

export function OptionsSectionScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const { section = '' } = useParams();
  const fonts = useFontNames();
  const lists = useManifestLists();
  const [colorIndex, setColorIndex] = useState(0);
  const [ranking, setRanking] = useState<boolean | null>(null);
  useEffect(() => {
    if (section !== 'player' || !user) return;
    let alive = true;
    void api<{ participate: boolean }>('/account/ranking').then(
      (r) => alive && setRanking(r.participate),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [section, user]);

  const toggle = (key: keyof Prefs, label: string, disabled = false): MenuItem => ({
    kind: 'choice',
    label: t(label),
    value: check(prefs[key] as boolean),
    disabled,
    onChange: () => setPrefs({ [key]: !prefs[key] } as Partial<Prefs>),
  });
  const select = <T extends string>(key: keyof Prefs, label: string, options: readonly [T, string][]): MenuItem => ({
    kind: 'choice',
    label: t(label),
    value: t(options.find(([v]) => v === prefs[key])?.[1] ?? ''),
    onChange: (d) => setPrefs({ [key]: cycle(options.map(([v]) => v), prefs[key] as T, d) } as Partial<Prefs>),
  });

  let caption: string;
  let items: MenuItem[];
  switch (section) {
    case 'player':
      caption = t('Player options');
      items = [
        user
          ? { kind: 'choice', label: t('Name'), value: user.username, onChange: () => {}, disabled: true }
          : { kind: 'text', label: t('Name'), value: prefs.playerName, onChange: (v) => setPrefs({ playerName: v }), maxLength: 15 },
        {
          kind: 'colors',
          label: t('Favorite colors'),
          colors: prefs.favoriteColors.map((c) => lists.playerColours[c] ?? '#888888'),
          selected: colorIndex,
          disabled: prefs.randomColor,
          onMove: (d, carry) => {
            const r = moveColor(prefs.favoriteColors, colorIndex, d, carry);
            setColorIndex(r.selected);
            if (carry) setPrefs({ favoriteColors: r.colors });
          },
        },
        toggle('randomColor', 'Use random color'),
        { kind: 'choice', label: t('Registration status'), value: user ? t('logged in as $1', user.username) : t('guest'), onChange: () => {}, disabled: true },
        {
          kind: 'choice',
          label: t('Take part in the ranking'),
          value: user ? check(ranking ?? true) : t('needs an account'),
          disabled: !user || ranking === null,
          onChange: () => {
            const next = !(ranking ?? true);
            setRanking(next);
            void api('/account/ranking', { method: 'PUT', body: { participate: next } }).catch(() => setRanking(!next));
          },
        },
      ];
      break;
    case 'game':
      caption = t('Game options');
      items = [
        toggle('lagPrediction', 'Lag prediction'),
        {
          kind: 'choice',
          label: t('Lag prediction amount'),
          value: String(prefs.lagPredictionAmount),
          disabled: !prefs.lagPrediction,
          onChange: (d) => setPrefs({ lagPredictionAmount: Math.min(10, Math.max(0, prefs.lagPredictionAmount + d)) }),
        },
        {
          kind: 'choice',
          label: t('Bandwidth for out-of-room players (cps)'),
          value: String(prefs.minimapBandwidth),
          onChange: (d) => setPrefs({ minimapBandwidth: Math.min(640, Math.max(0, prefs.minimapBandwidth + 20 * d)) }),
        },
        toggle('shareNetStats', 'Send anonymous network statistics'),
        toggle('showFlagMessages', 'Show flag messages'),
        toggle('showKillMessages', 'Show killing messages'),
        select<ShowStats>('showStats', 'Show stats after the round', [
          ['off', 'off'],
          ['teams', 'teams'],
          ['players', 'players'],
        ]),
        toggle('showServerInfo', 'Show server info when connected'),
        select<SkipMaps>('skipMaps', 'Skip maps in rotation', [
          ['none', 'none'],
          ['dimmed', 'dimmed'],
          ['highlighted', 'all but highlighted'],
        ]),
      ];
      break;
    case 'quick-messages':
      caption = t('Quick messages');
      items = [
        toggle('quickMessagesEnabled', 'Enable quick messages'),
        toggle('quickMessagesImmediate', 'Send message immediately'),
        ...prefs.quickMessages.map(
          (text, i): MenuItem => ({
            kind: 'text',
            label: t('Alt+$1', String((i + 1) % 10)),
            value: text,
            maxLength: QUICK_MESSAGE_LENGTH,
            onChange: (v) => setPrefs({ quickMessages: prefs.quickMessages.map((m, j) => (j === i ? v : m)) }),
          }),
        ),
      ];
      break;
    case 'theme': {
      caption = t('Theme and font');
      const themes = ['', ...lists.themes];
      const colourThemes = ['', ...lists.colourThemes];
      items = [
        {
          kind: 'choice',
          label: t('Theme'),
          value: prefs.graphicsTheme || t('<no theme>'),
          disabled: themes.length === 1,
          onChange: (d) => setPrefs({ graphicsTheme: cycle(themes, prefs.graphicsTheme, d) }),
        },
        {
          kind: 'choice',
          label: t('Colour theme'),
          value: prefs.colourTheme || t('<default>'),
          disabled: colourThemes.length === 1,
          onChange: (d) => setPrefs({ colourTheme: cycle(colourThemes, prefs.colourTheme, d) }),
        },
        toggle('preferThemeColours', 'Prefer main theme colours'),
        {
          kind: 'choice',
          label: t('Font'),
          value: prefs.menuFont,
          disabled: fonts.length === 0,
          onChange: (d) => setPrefs({ menuFont: cycle(fonts, prefs.menuFont, d) }),
        },
      ];
      break;
    }
    case 'graphics':
      caption = t('Graphic options');
      items = [
        select<ShowNames>('showNames', 'Show player names', [
          ['never', 'never'],
          ['sameRoom', 'in same room'],
          ['always', 'always'],
        ]),
        {
          kind: 'choice',
          label: t('Rooms on screen in each direction in game'),
          value: String(prefs.visibleRooms),
          onChange: (d) => setPrefs({ visibleRooms: Math.min(20, Math.max(1, prefs.visibleRooms + d)) }),
        },
        toggle('continuousTextures', 'Continuous textures between rooms'),
        {
          kind: 'choice',
          label: t('FPS limit'),
          value: String(prefs.fpsLimit),
          onChange: (d) => setPrefs({ fpsLimit: cycle(FPS_LIMITS, FPS_LIMITS.includes(prefs.fpsLimit) ? prefs.fpsLimit : 60, d) }),
        },
      ];
      break;
    case 'sounds':
      caption = t('Sound options');
      items = [
        toggle('soundEnabled', 'Sounds enabled'),
        {
          kind: 'choice',
          label: t('Volume'),
          value: String(prefs.soundVolume),
          disabled: !prefs.soundEnabled,
          onChange: (d) => setPrefs({ soundVolume: Math.min(255, Math.max(0, prefs.soundVolume + 15 * d)) }),
        },
        {
          kind: 'choice',
          label: t('Theme'),
          value: prefs.soundTheme,
          disabled: lists.soundThemes.length < 2,
          onChange: (d) => setPrefs({ soundTheme: cycle(lists.soundThemes, prefs.soundTheme, d) }),
        },
      ];
      break;
    case 'language':
      caption = t('Choose language');
      items = LOCALES.map((locale) => ({
        kind: 'action',
        label: catalog(locale).name,
        note: locale === prefs.locale ? '*' : '',
        onActivate: () => {
          setPrefs({ locale });
          void navigate('/options');
        },
      }));
      break;
    default:
      return <Navigate to="/options" replace />;
  }
  return <Menu key={section} caption={caption} items={items} onBack={() => void navigate('/options')} />;
}
