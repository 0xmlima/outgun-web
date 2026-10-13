// SPDX-License-Identifier: GPL-2.0-or-later
// Telas de menu do shell (OG-060). Replays ganham conteúdo no OG-091 (aqui, desabilitado); lobby em
// lobby.tsx (OG-069), opções em options.tsx (OG-068) e conta em account.tsx (OG-081).
import { ORIGINAL_CREDITS } from '@outgun/content';
import { catalog } from '@outgun/i18n';
import { useNavigate } from 'react-router';
import { SourceLink, SOURCE_URL } from '../app/Shell.js';
import { useAccount } from '../app/account.js';
import { usePrefs } from '../app/prefs.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { quickJoin } from './lobby.js';
import { TextLines, TextPage } from '../ui/TextPage.js';

export function HomeScreen() {
  const { t, prefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const soon = t('Coming soon');
  const items: MenuItem[] = [
    {
      kind: 'action',
      label: t('Play now'),
      // sala Casual escolhida pela API (OG-069); sem a API (desenvolvimento), a sala principal
      onActivate: () =>
        void quickJoin('casual', prefs.playerName.trim() || 'Convidado').then(
          (id) => void navigate(`/play?sala=${encodeURIComponent(id)}`),
          () => void navigate('/play'),
        ),
    },
    { kind: 'action', label: t('Rooms'), onActivate: () => void navigate('/rooms') },
    { kind: 'action', label: t('Ranking'), onActivate: () => void navigate('/ranking') },
    { kind: 'action', label: t('Replays'), onActivate: () => {}, disabled: true, note: soon },
    { kind: 'action', label: t('Options'), onActivate: () => void navigate('/options') },
    { kind: 'action', label: t('Help'), onActivate: () => void navigate('/help') },
    { kind: 'action', label: t('Credits'), onActivate: () => void navigate('/credits') },
    user
      ? { kind: 'action', label: t('Account'), note: user.username, onActivate: () => void navigate('/account') }
      : { kind: 'action', label: t('Sign in'), onActivate: () => void navigate('/login') },
  ];
  return <Menu caption="Outgun" items={items} />;
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
