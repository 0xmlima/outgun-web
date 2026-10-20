// SPDX-License-Identifier: GPL-2.0-or-later
// Moldura das telas fora da partida (OG-201, design system v2): barra superior com logo, navegação e
// conta; rodapé com Sobre, Termos, Privacidade e o código-fonte (GPL, OG-005). As telas ainda no
// visual antigo (caixas de menu com fonte bitmap) aparecem centralizadas no meio, com a escala
// inteira de pixels, até migrarem (OG-202, OG-203).
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAccount } from './account.js';
import { useMusicMode } from './music/MusicProvider.js';
import { usePlayNow } from './play-now.js';
import { usePrefs } from './prefs.js';
import { Button } from '../ui/Button.js';
import { FontProvider, GAME_FONT } from '../ui/fonts.js';
import { useGamepadKeys } from '../ui/gamepad.js';
import { PLAYER_COLOURS, PlayerAvatar } from '../ui/icons.js';
import { ToastProvider } from '../ui/Toast.js';
import './shell.css';
import '../ui/theme-campo.css';
import '../ui/theme-placar.css';

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

/** Raiz de todas as rotas: idioma do documento, escala dos pixels, fonte bitmap e avisos (OG-200). */
/**
 * Celular (D-50, OG-209): o jogo ainda não é para celular. Toque sem mouse e tela curta (o lado menor
 * abaixo de 600 px) pega celulares e deixa de fora tablets com teclado e notebooks com toque.
 */
export function isPhone(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse) and (hover: none)').matches && Math.min(screen.width, screen.height) < 600;
}

function PhoneNotice() {
  const { t } = usePrefs();
  return (
    <main className="phone-notice">
      <h1 className="home-title">Outgun</h1>
      <p>{t('Outgun is not available on phones yet.')}</p>
      <p className="ui-muted">{t('Open this page on a computer to play.')}</p>
    </main>
  );
}

export function Root() {
  const { prefs, t } = usePrefs();
  const scale = usePixelScale();
  useEffect(() => {
    document.documentElement.lang = prefs.locale;
    document.documentElement.style.setProperty('--px', String(scale));
  }, [prefs.locale, scale]);
  return (
    <FontProvider name={GAME_FONT}>
      <ToastProvider closeLabel={t('Close')}>
        {isPhone() ? <PhoneNotice /> : <Outlet />}
      </ToastProvider>
    </FontProvider>
  );
}

/** Conta na barra: "Entrar" para o convidado; nome e clã para quem entrou. */
function AccountChip() {
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
      <PlayerAvatar colour={PLAYER_COLOURS[prefs.favoriteColors[0] ?? 0] ?? PLAYER_COLOURS[0]} />
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
    ['/players', t('Players')],
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
        <Link to="/download">{t('Play on your computer')}</Link>
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
  const { prefs } = usePrefs();
  useGamepadKeys();
  useMusicMode('menu'); // o tema na primeira vez da sessão, depois a rotação das faixas (RN-MUS-01)
  return (
    <div className="ui-page app-shell" data-menu-theme={prefs.menuTheme}>
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
