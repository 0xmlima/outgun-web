// SPDX-License-Identifier: GPL-2.0-or-later
// Telas de menu do shell (OG-060). Replays: abrir arquivo ou ir às partidas (OG-091); lobby em
// lobby.tsx (OG-069), opções em options.tsx (OG-068) e conta em account.tsx (OG-081).
import { ORIGINAL_CREDITS, WEB_CREDITS } from '@outgun/content';
import { catalog } from '@outgun/i18n';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { AccountChip, ExitDesktopButton, SourceLink, SOURCE_URL } from '../app/Shell.js';
import { NotificationBell } from '../app/notifications.js';
import { useAccount } from '../app/account.js';
import { MusicButton } from '../app/music/MusicButton.js';
import { isPhone } from '../app/phone.js';
import { usePrefs } from '../app/prefs.js';
import { APP_VERSION, isOutdated, useServerVersion } from '../app/version.js';
import { Button } from '../ui/Button.js';
import { MenuList, type MenuListItem } from '../ui/MenuList.js';
import { Page } from '../ui/Page.js';
import { HomeFooter, HomeInfoBox, StartCard, SteamLink } from './home-start.js';
import { OutCupBanner } from './outcup.js';
import { PhoneHome } from './home-phone.js';
import { TextLines, TextPage } from '../ui/TextPage.js';

/**
 * Tela inicial (OG-201): logo no centro e só dois cartões: à esquerda a entrada (cor sorteada, apelido
 * e "Jogar agora", ou "Entrar"), à direita o "Como jogar" (ou, para quem entrou, partidas e redes). A
 * navegação fica no rodapé da própria tela.
 */
export function HomeScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  if (isPhone()) return <PhoneHome />;
  return (
    <div className="ui-container home">
      <div className="home-top">
        <div className="app-user">
          <MusicButton />
          {user && <NotificationBell />}
          <AccountChip />
          <ExitDesktopButton />
        </div>
      </div>
      <section className="home-hero">
        <h1 className="home-logo">
          <img src="/home-logo.png" alt="Outgun" width={234} height={124} />
        </h1>
        <p className="home-tagline">{t('Capture the flag with friends, right in the browser.')}</p>
        <GameVersion />
      </section>
      <div className="home-main">
        <StartCard />
        <div className="home-aside">
          <OutCupBanner />
          <HomeInfoBox />
          <SteamLink />
        </div>
      </div>
      <HomeFooter />
    </div>
  );
}

/** Versão do jogo (OG-280), só no menu principal; depois de um deploy, oferece recarregar a página. */
function GameVersion() {
  const { t } = usePrefs();
  const outdated = isOutdated(APP_VERSION, useServerVersion());
  return (
    <p className="home-version">
      {t('Version $1', APP_VERSION)}
      {outdated && (
        <Button variant="ghost" onClick={() => location.reload()}>
          {t('New version available: reload')}
        </Button>
      )}
    </p>
  );
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
    ...[...ORIGINAL_CREDITS, ...WEB_CREDITS].flatMap((group) => [
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

/**
 * Replays (OG-091): abrir um arquivo `.ogr` do computador (como a lista de arquivos do menu do
 * original) ou ir às partidas do perfil, que têm o link "Assistir".
 */
export function ReplaysScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const items: MenuListItem[] = [
    { label: t('Open replay file'), description: t('A .ogr file saved on this computer'), onActivate: () => file.current?.click() },
    ...(user ? [{ label: t('My matches'), description: t('Every match has a "Watch" link'), onActivate: () => void navigate(`/players/${encodeURIComponent(user.username)}`) }] : []),
    { label: t('Ranking'), onActivate: () => void navigate('/ranking') },
  ];
  return (
    <Page title={t('Replays')} onBack={() => void navigate('/')} width="narrow">
      <MenuList label={t('Replays')} items={items} autoFocus />
      <input
        ref={file}
        type="file"
        accept=".ogr"
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) void navigate('/replay', { state: { file: f } });
        }}
      />
    </Page>
  );
}

