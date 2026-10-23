// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente para Windows (OG-324, D-58): uma janela que carrega o site do jogo. Nada do jogo vem no
// instalador, então a versão é sempre a do site. Segurança pelo checklist do Electron: sem Node na
// página, sandbox, navegação só no domínio do jogo e links externos no navegador do sistema.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';

const GAME_URL = new URL(process.env.OUTGUN_URL ?? 'https://outgunweb.com.br/');

// a trilha começa sem esperar o primeiro clique ou tecla (no navegador, a política de autoplay pede)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// VSync (OG-373, D-73): o Chromium prende o requestAnimationFrame à taxa do monitor; desligado (o
// padrão: menos atraso na tela), o jogo passa dela e o limite de FPS do jogo vale de verdade (no
// automático, 240). Os switches só valem no início do processo: a opção fica gravada em userData e
// vale na próxima abertura.
const settingsFile = join(app.getPath('userData'), 'outgun-desktop.json');
/** @returns {{ frameRate: 'vsync' | 'unlocked' }} */
function readSettings() {
  try {
    const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
    return { frameRate: saved.frameRate === 'vsync' ? 'vsync' : 'unlocked' };
  } catch {
    return { frameRate: 'unlocked' };
  }
}
const settings = readSettings();
const activeFrameRate = settings.frameRate;
if (activeFrameRate === 'unlocked') {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
ipcMain.on('outgun:frame-rate', (event) => {
  event.returnValue = settings.frameRate;
});
ipcMain.on('outgun:frame-rate-active', (event) => {
  event.returnValue = activeFrameRate;
});
ipcMain.on('outgun:set-frame-rate', (event, mode) => {
  if (!sameOrigin(event.senderFrame?.url ?? '')) return;
  settings.frameRate = mode === 'unlocked' ? 'unlocked' : 'vsync';
  try {
    writeFileSync(settingsFile, JSON.stringify(settings));
  } catch {
    // sem disco gravável a opção vale só até fechar
  }
});

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
      // só a opção de VSync (OG-373); sem Node na página
      preload: fileURLToPath(new URL('preload.cjs', import.meta.url)),
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

// Conquistas da Steam (OG-396, D-77): o marco da conta é a fonte de verdade e o app só desbloqueia na
// Steam o que a conta já tem (o site manda os ids). Só quando a Steam abriu o jogo (ela põe o
// SteamAppId no ambiente); fora dela, ou se o SDK falhar, nada muda.
const STEAM_APP_ID = 663760;
const MILESTONE_ID = /^[a-z0-9_]{1,64}$/;
/** @type {typeof import('steamworks.js/client.d') | null} */
let steam = null;
if (Number(process.env.SteamAppId ?? process.env.SteamGameId) === STEAM_APP_ID) {
  try {
    steam = createRequire(import.meta.url)('steamworks.js').init(STEAM_APP_ID);
  } catch (error) {
    console.error('Steam indisponível:', error);
  }
}
ipcMain.on('outgun:steam-available', (event) => {
  event.returnValue = steam !== null && sameOrigin(event.senderFrame?.url ?? '');
});
ipcMain.on('outgun:steam-sync', (event, ids) => {
  if (!steam || !sameOrigin(event.senderFrame?.url ?? '') || !Array.isArray(ids)) return;
  let changed = false;
  for (const id of ids.slice(0, 200)) {
    if (typeof id !== 'string' || !MILESTONE_ID.test(id)) continue;
    const name = id.toUpperCase();
    try {
      // conquista que não existe no Steamworks (ainda não cadastrada) devolve false: ignorada
      if (!steam.achievement.isActivated(name) && steam.achievement.activate(name)) changed = true;
    } catch {
      // idem
    }
  }
  if (changed) steam.stats.store();
});

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
