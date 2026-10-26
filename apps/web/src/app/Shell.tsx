// SPDX-License-Identifier: GPL-2.0-or-later
// Moldura das telas fora da partida (OG-201, design system v2): barra superior com logo, navegação
// (OG-360: tudo o que saiu do menu inicial), o sino das notificações (OG-361) e a conta; rodapé com Sobre, Termos, Privacidade e o código-fonte (GPL, OG-005). As telas ainda no
// visual antigo (caixas de menu com fonte bitmap) aparecem centralizadas no meio, com a escala
// inteira de pixels, até migrarem (OG-202, OG-203).
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAccount } from './account.js';
import { NotificationBell, NotificationsProvider } from './notifications.js';
import { MusicButton } from './music/MusicButton.js';
import { useMusicMode } from './music/MusicProvider.js';
import { usePlayNow } from './play-now.js';
import { isPhone, isPortalPath } from './phone.js';
import { usePrefs } from './prefs.js';
import { Button } from '../ui/Button.js';
import { FontProvider, GAME_FONT } from '../ui/fonts.js';
import { useGamepadKeys } from '../ui/gamepad.js';
import { PLAYER_COLOURS, PlayerAvatar } from '../ui/icons.js';
import { ToastProvider } from '../ui/Toast.js';
import './shell.css';
import '../ui/theme-campo.css';
import '../ui/theme-placar.css';
import '../ui/retro.css';
import '../ui/phone.css';

/** Endereço do código-fonte; até existir o repositório público, a página /source explica a GPL. */
export const SOURCE_URL: string = import.meta.env.VITE_SOURCE_URL ?? '/source';

/** Os menus do original foram desenhados para 640×480: escala inteira que cabe na janela. */
function pixelScale(): number {
  return Math.max(1, Math.min(4, Math.floor(Math.min(innerWidth / 640, innerHeight / 480))));
}

function usePixelScale(): number {
  const [scale, setScale] = useState(pixelScale);
  useEffect(() => {
    const update = () => setScale(pixelScale());
    addEventListener('resize', update);
    return () => removeEventListener('resize', update);
  }, []);
  return scale;
}

export function SourceLink() {
  const { t } = usePrefs();
  const label = t('Source code (GPL)');
  return SOURCE_URL.startsWith('/') ? <Link to={SOURCE_URL}>{label}</Link> : <a href={SOURCE_URL}>{label}</a>;
}

function PhoneNotice() {
  const { t } = usePrefs();
  return (
    <main className="phone-notice">
      <h1 className="home-title">Outgun</h1>
      <p>{t('This part of Outgun is not available on phones yet.')}</p>
      <p className="ui-muted">{t('Open this page on a computer to play.')}</p>
      <Link to="/" className="ui-button ui-button-primary">
        {t('Back to the start')}
      </Link>
    </main>
  );
}

/** Raiz de todas as rotas: idioma do documento, escala dos pixels, fonte bitmap e avisos (OG-200). */
export function Root() {
  const phone = isPhone();
  const { prefs, t } = usePrefs();
  const scale = usePixelScale();
  const { pathname } = useLocation();
  useEffect(() => {
    document.documentElement.lang = prefs.locale;
    document.documentElement.style.setProperty('--px', String(scale));
  }, [prefs.locale, scale]);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-phone', phone); // estilos do celular (OG-418, ui/phone.css)
  }, [phone]);
  return (
    <FontProvider name={GAME_FONT}>
      <ToastProvider closeLabel={t('Close')}>
        {phone && !isPortalPath(pathname) ? <PhoneNotice /> : <Outlet />}
      </ToastProvider>
    </FontProvider>
  );
}

/** Conta na barra: "Entrar" para o convidado; nome e clã para quem entrou. */
export function AccountChip() {
  const { prefs, t } = usePrefs();
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
      <PlayerAvatar colour={PLAYER_COLOURS[prefs.favoriteColors[0] ?? 0] ?? PLAYER_COLOURS[0]!} />
      <span className="app-account-name">
        {user.clanTag && <span className="app-clan">{user.clanTag}</span>}
        {user.username}
      </span>
    </Link>
  );
}

/** Links da navegação principal (OG-360): a barra superior e o rodapé da tela inicial. */
export function useNavLinks(): readonly (readonly [string, string])[] {
  const { t } = usePrefs();
  const { user } = useAccount();
  const links: (readonly [string, string])[] = [
    ['/rooms', t('Rooms')],
    ['/ranking', t('Ranking')],
    ['/players', t('Players')],
    [user?.clanTag ? `/clans/${encodeURIComponent(user.clanTag)}` : '/clans', t('Clans')],
    ['/replays', t('Replays')],
    ['/options', t('Options')],
    ['/feedback?tipo=bug', t('Send feedback')], // relato de bug sem precisar de GitHub (OG-433)
    ['/help', t('Help')],
  ];
  return isPhone() ? links.filter(([to]) => isPortalPath(to.split('?')[0]!)) : links; // celular: só o portal (D-80)
}

function TopBar() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const playNow = usePlayNow();
  const links = useNavLinks();
  const phone = isPhone();
  // celular (OG-418): a navegação vira uma gaveta aberta pelo botão de menu; fecha ao trocar de tela
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="app-topbar">
      <Link to="/" className="app-logo">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Outgun</span>
      </Link>
      <nav id="app-nav" className={open ? 'app-nav open' : 'app-nav'} aria-label={t('Main navigation')}>
        {!phone && (
          <Button variant="primary" className="app-nav-play" onClick={playNow}>
            {t('Play now')}
          </Button>
        )}
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className="app-nav-link">
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="app-user">
        <MusicButton />
        {user && <NotificationBell />}
        <AccountChip />
        {phone && (
          <button type="button" className="app-bell-button app-menu-button" aria-label={t('Menu')} aria-expanded={open} aria-controls="app-nav" onClick={() => setOpen((v) => !v)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true" focusable="false">
              <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

function Footer() {
  const { t } = usePrefs();
  return (
    <footer className="app-footer">
      <span>Outgun Web</span>
      <nav aria-label={t('Legal')}>
        {!isPhone() && <Link to="/download">{t('Play on your computer')}</Link>}
        <Link to="/about">{t('About')}</Link>
        <Link to="/terms">{t('Terms')}</Link>
        <Link to="/privacy">{t('Privacy')}</Link>
        <SourceLink />
      </nav>
    </footer>
  );
}

/**
 * Telas fora da partida: barra superior, conteúdo, rodapé e gamepad (OG-200). A tela inicial monta
 * o próprio topo e rodapé (a navegação embaixo), sem a barra e o rodapé comuns.
 */
export function Shell() {
  const { prefs } = usePrefs();
  // a tela inicial do computador monta o próprio topo e rodapé; a do celular usa a barra (gaveta)
  const home = useLocation().pathname === '/' && !isPhone();
  useGamepadKeys();
  useMusicMode('menu'); // o tema na primeira vez da sessão, depois a rotação das faixas (RN-MUS-01)
  return (
    <NotificationsProvider>
    <div className="ui-page app-shell" data-menu-theme={prefs.menuTheme}>
      <div className="app-backdrop" aria-hidden="true" />
      {!home && <TopBar />}
      <main className="app-main">
        <Outlet />
      </main>
      {!home && <Footer />}
    </div>
    </NotificationsProvider>
  );
}
