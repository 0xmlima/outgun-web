// SPDX-License-Identifier: GPL-2.0-or-later
// Telas de menu do shell (OG-060). Replays: abrir arquivo ou ir às partidas (OG-091); lobby em
// lobby.tsx (OG-069), opções em options.tsx (OG-068) e conta em account.tsx (OG-081).
import { ORIGINAL_CREDITS, WEB_CREDITS } from '@outgun/content';
import { catalog } from '@outgun/i18n';
import { useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { SourceLink, SOURCE_URL } from '../app/Shell.js';
import { useAccount } from '../app/account.js';
import { usePrefs } from '../app/prefs.js';
import { usePlayNow } from '../app/play-now.js';
import { APP_VERSION, isOutdated, useServerVersion } from '../app/version.js';
import { Badge, Button } from '../ui/Button.js';
import { MenuList, type MenuListItem } from '../ui/MenuList.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Table } from '../ui/Table.js';
import { type HistoryEntry, useApi } from './stats.js';
import { inboxCount, useClanInbox } from './clans.js';
import { MonthRanking, NowPlaying } from './home-panels.js';
import { TextLines, TextPage } from '../ui/TextPage.js';

/** Até 5 partidas recentes de quem tem conta, na tela inicial. */
function RecentMatches({ username }: { readonly username: string }) {
  const { t, prefs } = usePrefs();
  const navigate = useNavigate();
  const history = useApi<{ matches: HistoryEntry[] }>(`/players/${encodeURIComponent(username)}/matches?limit=5`);
  return (
    <Panel title={t('Your recent matches')} actions={<Link to={`/players/${encodeURIComponent(username)}`}>{t('Profile')}</Link>}>
      {history.data === undefined && !history.error ? (
        <p className="ui-muted">{t('Loading...')}</p>
      ) : history.error ? (
        <p className="ui-muted">{t('Could not reach the server.')}</p>
      ) : (
        <Table
          caption={t('Your recent matches')}
          rows={history.data?.matches ?? []}
          rowKey={(m) => m.id}
          onRowActivate={(m) => void navigate(`/matches/${m.id}`)}
          empty={t('No matches yet. "Play now" starts one.')}
          columns={[
            { key: 'date', header: t('Date'), cell: (m) => new Date(m.endedAt).toLocaleDateString(prefs.locale, { day: '2-digit', month: '2-digit' }) },
            { key: 'map', header: t('Map'), cell: (m) => m.mapTitle },
            {
              key: 'result',
              header: t('Result'),
              cell: (m) => {
                const mine = m.player.team === 0 ? m.redScore : m.blueScore;
                const theirs = m.player.team === 0 ? m.blueScore : m.redScore;
                return mine > theirs ? <Badge tone="success">{t('Win')}</Badge> : mine < theirs ? <Badge tone="danger">{t('Loss')}</Badge> : <Badge>{t('Draw')}</Badge>;
              },
            },
            { key: 'kd', header: 'K/D', cell: (m) => `${m.player.kills}/${m.player.deaths}`, align: 'end' },
          ]}
        />
      )}
    </Panel>
  );
}

/** Tela inicial (OG-201): "Jogar agora" em destaque (RN-UI-04), o resto do menu e as últimas partidas. */
export function HomeScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const playNow = usePlayNow();
  const { inbox } = useClanInbox();
  const pending = inboxCount(inbox);
  const go = (to: string) => () => void navigate(to);
  const items: MenuListItem[] = [
    { icon: 'play', label: t('Play now'), description: t('Casual: power-ups on, guests welcome, does not count for the ranking.'), primary: true, onActivate: playNow },
    { icon: 'rooms', label: t('Rooms'), description: t('Open rooms, Casual and Ranked'), onActivate: go('/rooms') },
    {
      icon: 'lock',
      label: t('Create private room'),
      description: t('Play with friends using an invite link'),
      aside: user ? undefined : <Badge>{t('needs an account')}</Badge>,
      onActivate: go(user ? '/rooms/new' : '/login'),
    },
    { icon: 'trophy', label: t('Ranking'), description: t('Season leaderboard'), onActivate: go('/ranking') },
    { icon: 'players', label: t('Players'), description: t('Find players and clans'), onActivate: go('/players') },
    ...(user ? [{ icon: 'player' as const, label: t('My profile'), description: t('Statistics, milestones and matches'), onActivate: go(`/players/${encodeURIComponent(user.username)}`) }] : []),
    {
      icon: 'clan',
      label: t('Clans'),
      description: user?.clanTag ? t('Your clan and the clan directory') : t('Create or join a clan'),
      aside: pending > 0 ? <Badge tone="accent">{pending}</Badge> : undefined,
      onActivate: go(pending > 0 ? '/clans/inbox' : user?.clanTag ? `/clans/${encodeURIComponent(user.clanTag)}` : '/clans'),
    },
    { icon: 'replay', label: t('Replays'), description: t('Watch recorded matches'), onActivate: go('/replays') },
    { icon: 'options', label: t('Options'), onActivate: go('/options') },
    { icon: 'help', label: t('Help'), onActivate: go('/help') },
    { icon: 'credits', label: t('Credits'), onActivate: go('/credits') },
    ...(user ? [{ icon: 'feedback' as const, label: t('Send feedback'), onActivate: go('/feedback') }] : []),
    ...(user && (user.isAdmin || user.isModerator) ? [{ icon: 'shield' as const, label: t('Moderation'), onActivate: go('/admin') }] : []),
    user ? { icon: 'account', label: t('Account'), aside: user.username, onActivate: go('/account') } : { icon: 'account', label: t('Sign in'), onActivate: go('/login') },
  ];
  return (
    <div className="ui-container home">
      <section className="home-hero">
        <h1 className="home-title">
          Out<span className="home-title-accent">gun</span>
        </h1>
        <p className="home-tagline">{t('Capture the flag with friends, right in the browser.')}</p>
        <GameVersion />
      </section>
      <div className="home-grid">
        <MenuList label={t('Main menu')} items={items} autoFocus className="home-menu" />
        <div className="home-side">
          <NowPlaying />
          <MonthRanking />
          {user && <RecentMatches username={user.username} />}
        </div>
      </div>
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

