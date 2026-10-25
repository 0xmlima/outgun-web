// SPDX-License-Identifier: GPL-2.0-or-later
// Tela inicial do celular (OG-419, D-80): o que dá para fazer ali (perfil, clã, ranking, partidas,
// moderação) e quem está jogando agora, só para leitura; para jogar, o computador.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAccount } from '../app/account.js';
import { usePrefs } from '../app/prefs.js';
import { Icon, type IconName } from '../ui/icons.js';
import { Panel } from '../ui/Panel.js';
import { MonthRanking, NowPlaying } from './home-panels.js';
import { HomeClan, HomeFooter, HomeMilestones, HomeRank, RecentMatchesSlide, SteamLink } from './home-start.js';

function Shortcut({ to, icon, children }: { readonly to: string; readonly icon: IconName; readonly children: ReactNode }) {
  return (
    <li>
      <Link className="phone-shortcut" to={to}>
        <Icon name={icon} size={22} />
        <span>{children}</span>
      </Link>
    </li>
  );
}

export function PhoneHome() {
  const { t } = usePrefs();
  const { user } = useAccount();
  return (
    <div className="ui-container phone-home">
      <section className="phone-home-hero">
        <h1 className="home-logo">
          <img src="/home-logo.png" alt="Outgun" width={156} height={83} />
        </h1>
        <p className="home-tagline">{t('Capture the flag with friends, right in the browser.')}</p>
      </section>
      <p className="phone-home-play" role="note">
        {t('To play, open Outgun on a computer. Here you follow stats, profiles, clans and match reports.')}
      </p>
      {user ? (
        <Panel title={user.username}>
          <ul className="home-stats">
            <HomeClan tag={user.clanTag} />
            <HomeRank username={user.username} />
            <HomeMilestones username={user.username} />
          </ul>
        </Panel>
      ) : (
        <Panel>
          <div className="phone-home-guest">
            <p>{t('Sign in to see your profile, your clan and your matches.')}</p>
            <Link className="ui-button ui-button-primary" to="/login">
              {t('Sign in')}
            </Link>
            <Link to="/register">{t('Create account')}</Link>
          </div>
        </Panel>
      )}
      <nav aria-label={t('Main navigation')}>
        <ul className="phone-shortcuts">
          {user && (
            <Shortcut to={`/players/${encodeURIComponent(user.username)}`} icon="player">
              {t('My profile')}
            </Shortcut>
          )}
          {user?.clanTag && (
            <Shortcut to={`/clans/${encodeURIComponent(user.clanTag)}`} icon="clan">
              {t('My clan')}
            </Shortcut>
          )}
          <Shortcut to="/ranking" icon="trophy">
            {t('Ranking')}
          </Shortcut>
          <Shortcut to="/hall-da-fama" icon="flag">
            {t('Hall of fame')}
          </Shortcut>
          <Shortcut to="/players" icon="players">
            {t('Players')}
          </Shortcut>
          <Shortcut to="/clans" icon="clan">
            {t('Clans')}
          </Shortcut>
          {user && (user.isAdmin || user.isModerator) && (
            <Shortcut to="/admin" icon="shield">
              {t('Moderation')}
            </Shortcut>
          )}
        </ul>
      </nav>
      {user && (
        <Panel title={t('My last matches')}>
          <RecentMatchesSlide username={user.username} />
        </Panel>
      )}
      <NowPlaying readOnly />
      <MonthRanking />
      <SteamLink />
      <HomeFooter />
    </div>
  );
}
