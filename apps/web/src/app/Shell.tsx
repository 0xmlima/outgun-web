// SPDX-License-Identifier: GPL-2.0-or-later
// Moldura das telas: escala inteira dos pixels, fonte escolhida e, nos menus, rodapé com o link para
// o código-fonte (GPL, OG-005).
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { BitmapText } from '../ui/BitmapText.js';
import { FontProvider, GAME_FONT } from '../ui/fonts.js';
import { useGamepadKeys } from '../ui/gamepad.js';
import { ToastProvider } from '../ui/Toast.js';
import { usePrefs } from './prefs.js';

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
  const label = <BitmapText text={t('Source code (GPL)')} />;
  return SOURCE_URL.startsWith('/') ? (
    <Link to={SOURCE_URL}>{label}</Link>
  ) : (
    <a href={SOURCE_URL}>{label}</a>
  );
}

/** Termos, privacidade e sobre (OG-107), no rodapé de todas as telas de menu. */
function LegalLinks() {
  const { t } = usePrefs();
  return (
    <span className="shell-legal">
      <Link to="/about">
        <BitmapText text={t('About')} />
      </Link>{' '}
      <Link to="/terms">
        <BitmapText text={t('Terms')} />
      </Link>{' '}
      <Link to="/privacy">
        <BitmapText text={t('Privacy')} />
      </Link>
    </span>
  );
}

/** Raiz de todas as rotas: idioma do documento, escala dos pixels, fonte bitmap e avisos (OG-200). */
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
        <Outlet />
      </ToastProvider>
    </FontProvider>
  );
}

/** Telas de menu: conteúdo centralizado, rodapé com o código-fonte e gamepad (OG-200). */
export function Shell() {
  useGamepadKeys();
  return (
    <div className="shell">
      <main className="shell-main">
        <Outlet />
      </main>
      <footer className="shell-footer">
        <BitmapText text="Outgun Web" />
        <LegalLinks />
        <SourceLink />
      </footer>
    </div>
  );
}
