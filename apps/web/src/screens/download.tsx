// SPDX-License-Identifier: GPL-2.0-or-later
// "Jogar no computador" (OG-325, D-58): instalar pelo navegador (OG-323) ou baixar o instalador para
// Windows (OG-324). Os dois abrem o próprio site, então a versão é sempre a mesma da web.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { isDesktopClient, isInstalledApp, useInstallPrompt } from '../app/install.js';
import { usePrefs } from '../app/prefs.js';
import { Button } from '../ui/Button.js';
import { TextPage } from '../ui/TextPage.js';

/** Servido pelo Caddy da VPS a partir de /opt/outgun/downloads (deploy/vps/upload-desktop.sh). */
export const DESKTOP_INSTALLER = '/download/Outgun-Setup.exe';

export function DownloadScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const install = useInstallPrompt();
  const [installed, setInstalled] = useState(false);
  const inApp = isInstalledApp();
  return (
    <TextPage caption={t('Play on your computer')} onBack={() => void navigate('/')}>
      <section className="stats-section legal">
        {inApp ? (
          <p className="stats-line">{isDesktopClient() ? t('You are already playing in the Outgun app for Windows.') : t('You are already playing in the installed Outgun app.')}</p>
        ) : (
          <p className="stats-line">{t('Outgun runs in the browser, but you can also open it from an icon on your computer, in its own window. It is the same game and always the same version as the site: nothing to update.')}</p>
        )}
        <h2>{t('Install from the browser')}</h2>
        <p className="stats-line">{t('In Chrome or Edge: no download, a desktop shortcut and its own window. Takes a few seconds.')}</p>
        {installed ? (
          <p className="stats-line">{t('Installed. Open Outgun from the icon on your computer.')}</p>
        ) : install ? (
          <p>
            <Button variant="primary" onClick={() => void install().then(setInstalled)}>
              {t('Install Outgun')}
            </Button>
          </p>
        ) : (
          !inApp && <p className="stats-line ui-muted">{t('If no button appears here, open the browser menu and choose "Install Outgun" (Chrome: the icon at the right of the address bar). Firefox and Safari do not install sites.')}</p>
        )}
        <h2>{t('Download for Windows')}</h2>
        <p className="stats-line">{t('An installer for Windows 10 and 11 (64 bits), about 110 MB. The game itself still comes from the site, so it is always up to date.')}</p>
        {!isDesktopClient() && (
          <p>
            <a className="ui-button ui-button-secondary ui-button-md" href={DESKTOP_INSTALLER} download>
              {t('Download Outgun-Setup.exe')}
            </a>
          </p>
        )}
        <p className="stats-line ui-muted">{t('The installer has no digital signature yet, so Windows may show "Windows protected your PC". Click "More info" and then "Run anyway".')}</p>
      </section>
    </TextPage>
  );
}
