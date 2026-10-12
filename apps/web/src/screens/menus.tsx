// SPDX-License-Identifier: GPL-2.0-or-later
// Telas de menu do shell (OG-060). Lobby, replays, contas e controles ganham conteúdo nos cards
// OG-069, OG-091, OG-081 e OG-063; aqui aparecem desabilitados ou como placeholder.
import { ORIGINAL_CREDITS } from '@outgun/content';
import { catalog, LOCALES } from '@outgun/i18n';
import { useNavigate } from 'react-router';
import { SourceLink, SOURCE_URL } from '../app/Shell.js';
import { usePrefs } from '../app/prefs.js';
import { useFontNames } from '../ui/fonts.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { TextLines, TextPage } from '../ui/TextPage.js';

function cycle<T>(list: readonly T[], current: T, delta: number): T {
  const index = list.indexOf(current);
  return list[(index + delta + list.length) % list.length] ?? current;
}

export function HomeScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const soon = t('Coming soon');
  const items: MenuItem[] = [
    { kind: 'action', label: t('Play now'), onActivate: () => void navigate('/play') },
    { kind: 'action', label: t('Rooms'), onActivate: () => {}, disabled: true, note: soon },
    { kind: 'action', label: t('Replays'), onActivate: () => {}, disabled: true, note: soon },
    { kind: 'action', label: t('Options'), onActivate: () => void navigate('/options') },
    { kind: 'action', label: t('Help'), onActivate: () => void navigate('/help') },
    { kind: 'action', label: t('Credits'), onActivate: () => void navigate('/credits') },
    { kind: 'action', label: t('Sign in'), onActivate: () => void navigate('/login') },
  ];
  return <Menu caption="Outgun" items={items} />;
}

export function OptionsScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const navigate = useNavigate();
  const fonts = useFontNames();
  const items: MenuItem[] = [
    {
      kind: 'choice',
      label: t('Choose language'),
      value: catalog(prefs.locale).name,
      onChange: (delta) => setPrefs({ locale: cycle(LOCALES, prefs.locale, delta) }),
    },
    {
      kind: 'choice',
      label: t('Font'),
      value: prefs.menuFont,
      disabled: fonts.length === 0,
      onChange: (delta) => setPrefs({ menuFont: cycle(fonts, prefs.menuFont, delta) }),
    },
    { kind: 'action', label: t('Controls'), onActivate: () => {}, disabled: true, note: t('Coming soon') },
  ];
  return <Menu caption={t('Options')} items={items} onBack={() => void navigate('/')} />;
}

export function HelpScreen() {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  return (
    <TextPage caption={t('Help')} onBack={() => void navigate('/')}>
      <TextLines lines={catalog(prefs.locale).help} />
    </TextPage>
  );
}

export function CreditsScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const lines = [
    t('Outgun Web is a port of Outgun 1.0.3 to the browser.'),
    ' ',
    ...ORIGINAL_CREDITS.flatMap((group) => [
      group.role,
      ...group.people.map((person) => `   ${person}`),
      ' ',
    ]),
    t('Outgun and Outgun Web are free software under the GNU GPL, version 2 or later.'),
  ];
  return (
    <TextPage caption={t('Credits')} onBack={() => void navigate('/')}>
      <TextLines lines={lines} />
      <p className="text-link">
        <SourceLink />
      </p>
    </TextPage>
  );
}

export function SourceScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const lines = [
    t('Outgun and Outgun Web are free software under the GNU GPL, version 2 or later.'),
    ' ',
    t(
      'You may use, study, change and share the game. Whoever distributes it must also offer its complete source code under the same license.',
    ),
    ' ',
    t('The public repository of Outgun Web will be announced at launch.'),
  ];
  return (
    <TextPage caption={t('Source code (GPL)')} onBack={() => void navigate(-1)}>
      <TextLines lines={lines} />
      {!SOURCE_URL.startsWith('/') && (
        <p className="text-link">
          <a href={SOURCE_URL}>{SOURCE_URL}</a>
        </p>
      )}
    </TextPage>
  );
}

/** Placeholder até o OG-081 (contas): por ora só se joga como convidado. */
export function LoginScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const items: MenuItem[] = [
    { kind: 'action', label: t('Play as guest'), onActivate: () => void navigate('/play') },
    { kind: 'action', label: t('Sign in'), onActivate: () => {}, disabled: true, note: t('Coming soon') },
    {
      kind: 'action',
      label: t('Create account'),
      onActivate: () => {},
      disabled: true,
      note: t('Coming soon'),
    },
  ];
  return <Menu caption={t('Sign in')} items={items} onBack={() => void navigate('/')} />;
}
