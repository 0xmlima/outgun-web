// SPDX-License-Identifier: GPL-2.0-or-later
// "Jogar no computador" (OG-325, OG-326, D-58): instalar pelo navegador (OG-323) ou baixar o cliente
// para Windows, macOS ou Ubuntu (OG-324, OG-326). Todos abrem o próprio site, então a versão é sempre
// a mesma da web.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { isDesktopClient, isInstalledApp, useInstallPrompt } from '../app/install.js';
import { usePrefs } from '../app/prefs.js';
import { Badge, Button } from '../ui/Button.js';
import { TextPage } from '../ui/TextPage.js';

type Platform = 'windows' | 'mac' | 'linux';

/** Servidos pelo Caddy da VPS a partir de /opt/outgun/downloads (deploy/vps/upload-desktop.sh). */
export const DESKTOP_DOWNLOADS: Readonly<Record<Platform, string>> = {
  windows: '/download/Outgun-Setup.exe',
  mac: '/download/Outgun-mac.dmg',
  linux: '/download/Outgun-linux.deb',
};

/** Sistema de quem visita, para destacar o download certo. */
function visitorPlatform(): Platform | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Linux|X11/.test(ua) && !/Android/.test(ua)) return 'linux';
  return null;
}

// Windows: as quatro janelas, desenhadas aqui; Apple e Ubuntu: Simple Icons 16.34.0 (CC0)
const OS_ICONS: Readonly<Record<Platform, ReactNode>> = {
  windows: <path d="M1 3.5 10.5 2.2v9.1H1zM11.5 2.05 23 .5v10.8H11.5zM1 12.7h9.5v9.1L1 20.5zM11.5 12.7H23v10.8l-11.5-1.55z" />,
  mac: (
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  ),
  linux: (
    <path d="M17.61.455a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zM12.92.8C8.923.777 5.137 2.941 3.148 6.451a4.5 4.5 0 0 1 .26-.007 4.92 4.92 0 0 1 2.585.737A8.316 8.316 0 0 1 12.688 3.6 4.944 4.944 0 0 1 13.723.834 11.008 11.008 0 0 0 12.92.8zm9.226 4.994a4.915 4.915 0 0 1-1.918 2.246 8.36 8.36 0 0 1-.273 8.303 4.89 4.89 0 0 1 1.632 2.54 11.156 11.156 0 0 0 .559-13.089zM3.41 7.932A3.41 3.41 0 0 0 0 11.342a3.41 3.41 0 0 0 3.41 3.409 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zm2.027 7.866a4.908 4.908 0 0 1-2.915.358 11.1 11.1 0 0 0 7.991 6.698 11.234 11.234 0 0 0 2.422.249 4.879 4.879 0 0 1-.999-2.85 8.484 8.484 0 0 1-.836-.136 8.304 8.304 0 0 1-5.663-4.32zm11.405.928a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41z" />
  ),
};

function OsIcon({ platform }: { platform: Platform }) {
  return (
    <svg className="download-os-icon" width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {OS_ICONS[platform]}
    </svg>
  );
}

export function DownloadScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const install = useInstallPrompt();
  const [installed, setInstalled] = useState(false);
  const inApp = isInstalledApp();
  const mine = visitorPlatform();
  const platforms: { id: Platform; name: string; detail: string; file: string; note: string }[] = [
    {
      id: 'windows',
      name: 'Windows',
      detail: t('Windows 10 and 11, 64 bits. About 110 MB.'),
      file: 'Outgun-Setup.exe',
      note: t('No digital signature yet: if Windows shows "Windows protected your PC", click "More info" and then "Run anyway".'),
    },
    {
      id: 'mac',
      name: 'macOS',
      detail: t('Apple Silicon and Intel, macOS 12 or newer. About 230 MB.'),
      file: 'Outgun-mac.dmg',
      note: t('Open the .dmg and drag Outgun to Applications. The first time, the Mac blocks the app because it does not come from the App Store: go to System Settings > Privacy & Security and click "Open Anyway".'),
    },
    {
      id: 'linux',
      name: 'Ubuntu',
      detail: t('Ubuntu 22.04 or newer (and Debian-based systems), 64 bits. About 110 MB.'),
      file: 'Outgun-linux.deb',
      note: t('Open the .deb to install it from the App Center, or run: sudo apt install ./Outgun-linux.deb'),
    },
  ];
  return (
    <TextPage caption={t('Play on your computer')} onBack={() => void navigate('/')}>
      <section className="stats-section legal">
        {inApp ? (
          <p className="stats-line">{isDesktopClient() ? t('You are already playing in the Outgun app for your computer.') : t('You are already playing in the installed Outgun app.')}</p>
        ) : (
          <p className="stats-line">{t('Outgun runs in the browser, but you can also open it from an icon on your computer, in its own window. It is the same game and always the same version as the site: nothing to update.')}</p>
        )}
        <h2>{t('Download the app')}</h2>
        <p className="stats-line">{t('The game itself still comes from the site, so the app is always up to date.')}</p>
        <div className="download-grid">
          {platforms.map((p) => (
            <article key={p.id} className={p.id === mine ? 'download-os mine' : 'download-os'} aria-labelledby={`download-${p.id}`}>
              <OsIcon platform={p.id} />
              <div className="download-os-text">
                <h3 id={`download-${p.id}`}>
                  {p.name}
                  {p.id === mine && <Badge tone="accent">{t('Your system')}</Badge>}
                </h3>
                <p className="download-os-detail">{p.detail}</p>
              </div>
              {!isDesktopClient() && (
                <a className={`ui-button ${p.id === mine ? 'ui-button-primary' : 'ui-button-secondary'} ui-button-md`} href={DESKTOP_DOWNLOADS[p.id]} download>
                  {t('Download $1', p.file)}
                </a>
              )}
              <p className="download-os-note">{p.note}</p>
            </article>
          ))}
        </div>
        <h2>{t('Or install from the browser')}</h2>
        <p className="stats-line">{t('In Chrome or Edge: no download, a desktop shortcut and its own window. Takes a few seconds.')}</p>
        {installed ? (
          <p className="stats-line">{t('Installed. Open Outgun from the icon on your computer.')}</p>
        ) : install ? (
          <p>
            <Button onClick={() => void install().then(setInstalled)}>{t('Install Outgun')}</Button>
          </p>
        ) : (
          !inApp && <p className="stats-line ui-muted">{t('If no button appears here, open the browser menu and choose "Install Outgun" (Chrome: the icon at the right of the address bar). Firefox and Safari do not install sites.')}</p>
        )}
      </section>
    </TextPage>
  );
}
