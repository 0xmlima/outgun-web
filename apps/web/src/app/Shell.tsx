// SPDX-License-Identifier: GPL-2.0-or-later
// Moldura das telas fora da partida (OG-201, design system v2): barra superior com logo, navegação e
// conta; rodapé com Sobre, Termos, Privacidade e o código-fonte (GPL, OG-005).
import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAccount } from './account.js';
import { useMusicMode } from './music/MusicProvider.js';
import { usePlayNow } from './play-now.js';
import { usePrefs } from './prefs.js';
import { Button } from '../ui/Button.js';
import { useGamepadKeys } from '../ui/gamepad.js';
import { ToastProvider } from '../ui/Toast.js';
import './shell.css';

/** Endereço do código-fonte; até existir o repositório público, a página /source explica a GPL. */
export const SOURCE_URL: string = import.meta.env.VITE_SOURCE_URL ?? '/source';

export function SourceLink() {
  const { t } = usePrefs();
  const label = t('Source code (GPL)');
  return SOURCE_URL.startsWith('/') ? <Link to={SOURCE_URL}>{label}</Link> : <a href={SOURCE_URL}>{label}</a>;
}

/** Raiz de todas as rotas: idioma do documento e avisos (OG-200). */
export function Root() {
  const { prefs, t } = usePrefs();
  useEffect(() => {
    document.documentElement.lang = prefs.locale;
  }, [prefs.locale]);
  return (
    <ToastProvider closeLabel={t('Close')}>
      <Outlet />
    </ToastProvider>
  );
}

/** Conta na barra: "Entrar" para o convidado; nome e clã para quem entrou. */
function AccountChip() {
  const { t } = usePrefs();
  const { user } = useAccount();
  if (user === undefined) return null;
  if (!user)
    return (
      <Link className="app-account ui-button ui-button-secondary" to="/login">
        {t('Sign in')}
      </Link>
    );
  return (
    <Link className="app-account app-account-user" to="/account" aria-label={`${t('Account')}: ${user.username}`}>
      <span className="app-avatar" aria-hidden="true">
        {user.username.slice(0, 1).toUpperCase()}
      </span>
      <span className="app-account-name">
        {user.clanTag && <span className="app-clan">{user.clanTag}</span>}
        {user.username}
      </span>
    </Link>
  );
}

function TopBar() {
  const { t } = usePrefs();
  const playNow = usePlayNow();
  const links = [
    ['/rooms', t('Rooms')],
    ['/ranking', t('Ranking')],
    ['/replays', t('Replays')],
  ] as const;
  return (
    <header className="app-topbar">
      <Link to="/" className="app-logo">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Outgun</span>
      </Link>
      <nav className="app-nav" aria-label={t('Main navigation')}>
        <Button variant="primary" className="app-nav-play" onClick={playNow}>
          {t('Play now')}
        </Button>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className="app-nav-link">
            {label}
          </NavLink>
        ))}
      </nav>
      <AccountChip />
    </header>
  );
}

function Footer() {
  const { t } = usePrefs();
  return (
    <footer className="app-footer">
      <span>Outgun Web</span>
      <nav aria-label={t('Legal')}>
        <Link to="/about">{t('About')}</Link>
        <Link to="/terms">{t('Terms')}</Link>
        <Link to="/privacy">{t('Privacy')}</Link>
        <SourceLink />
      </nav>
    </footer>
  );
}

/** Telas fora da partida: barra superior, conteúdo, rodapé e gamepad (OG-200). */
export function Shell() {
  useGamepadKeys();
  useMusicMode('menu'); // "Outgun Epic" em loop nas telas fora da partida (RN-MUS-01)
  return (
    <div className="ui-page app-shell">
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
