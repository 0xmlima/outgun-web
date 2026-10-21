// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente para Windows (OG-324, D-58): uma janela que carrega o site do jogo. Nada do jogo vem no
// instalador, então a versão é sempre a do site. Segurança pelo checklist do Electron: sem Node na
// página, sandbox, navegação só no domínio do jogo e links externos no navegador do sistema.
import { app, BrowserWindow, Menu, session, shell } from 'electron';

const GAME_URL = new URL(process.env.OUTGUN_URL ?? 'https://outgunweb.com.br/');

// a trilha começa sem esperar o primeiro clique ou tecla (no navegador, a política de autoplay pede)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const sameOrigin = (url) => {
  try {
    return new URL(url).origin === GAME_URL.origin;
  } catch {
    return false;
  }
};

const openOutside = (url) => {
  if (/^https?:/.test(url)) void shell.openExternal(url);
};

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#000040',
    title: 'Outgun',
    autoHideMenuBar: true,
    // no Windows abre em tela cheia, como o jogo antigo (OG-337); F11 volta para a janela
    fullscreen: process.platform === 'win32',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  // o site reconhece o cliente (página de download: "você já está no cliente")
  win.webContents.setUserAgent(
    `${win.webContents.getUserAgent()} OutgunDesktop/${app.getVersion()}`,
  );

  win.webContents.on('will-navigate', (event, url) => {
    if (!sameOrigin(url)) {
      event.preventDefault();
      openOutside(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) void win?.loadURL(url);
    else openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    // Ctrl+W/Ctrl+R/F5 no meio da partida fechariam ou recarregariam o jogo; F11 alterna a tela cheia
    if ((input.control || input.meta) && (key === 'w' || key === 'r')) event.preventDefault();
    else if (key === 'f5') event.preventDefault();
    else if (key === 'f11') {
      event.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    }
  });
  win.on('closed', () => {
    win = null;
  });
  void win.loadURL(GAME_URL.href);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    // no macOS, Cmd+Q e copiar/colar nos campos de texto dependem dos menus do aplicativo
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])
        : null,
    );
    // o jogo não usa câmera, microfone, notificações etc.; o gamepad não passa por permissão
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(permission === 'fullscreen'),
    );
    session.defaultSession.setPermissionCheckHandler(
      (_wc, permission) => permission === 'fullscreen',
    );
    createWindow();
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.on('window-all-closed', () => app.quit());
}
