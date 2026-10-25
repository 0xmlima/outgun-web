// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente para Windows (OG-324, D-58): uma janela que carrega o site do jogo. Nada do jogo vem no
// instalador, então a versão é sempre a do site. Segurança pelo checklist do Electron: sem Node na
// página, sandbox, navegação só no domínio do jogo e links externos no navegador do sistema.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, screen, session, shell } from 'electron';
import {
  applyMode,
  formatMode,
  listModes,
  parseMode,
  restoreMode,
  systemMode,
} from './display-win.js';

const GAME_URL = new URL(process.env.OUTGUN_URL ?? 'https://outgunweb.com.br/');

// a trilha começa sem esperar o primeiro clique ou tecla (no navegador, a política de autoplay pede)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// FPS livre (OG-373, OG-400): o Chromium prende o requestAnimationFrame à taxa do monitor; sem VSync
// e sem o limite de quadros, quem limita é o jogo (no mínimo 240). Sempre ligado, sem opção: um
// VSync gravado pelos clientes antigos (`outgun-desktop.json`) não vale mais. As pontes de VSync
// ficam para o site novo falar com o mesmo preload: o modo é sempre 'unlocked'.
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
ipcMain.on('outgun:frame-rate', (event) => {
  event.returnValue = 'unlocked';
});
ipcMain.on('outgun:frame-rate-active', (event) => {
  event.returnValue = 'unlocked';
});
ipcMain.on('outgun:set-frame-rate', () => undefined);

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

// Resolução do monitor (OG-401, só Windows): o modo escolhido em Opções (gravado em userData) ou o da
// opção de inicialização `--resolution=1920x1080@144` (vale por cima; `--resolution=system` desliga).
// Vale só em tela cheia, com a janela no monitor principal e em foco; Alt+Tab, minimizar, sair da
// tela cheia ou fechar devolvem a resolução do sistema, e voltar ao jogo aplica de novo.
const settingsFile = join(app.getPath('userData'), 'outgun-desktop.json');
/** @type {{ displayMode?: string | null }} */
const settings = (() => {
  try {
    const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
    return { displayMode: typeof saved.displayMode === 'string' ? saved.displayMode : null };
  } catch {
    return { displayMode: null };
  }
})();
const launchMode = app.commandLine.getSwitchValue('resolution') || null;
/** @type {string[] | null} */
let modes = null;
const displayModes = () => (modes ??= listModes().map(formatMode));
/** O modo que vale agora: o da inicialização, senão o das Opções; só se o monitor o tiver. */
function wantedMode() {
  const text = launchMode ?? settings.displayMode;
  return text && text !== 'system' && displayModes().includes(text) ? text : null;
}
/** @type {string | null} */
let appliedMode = null;
function syncDisplay() {
  if (process.platform !== 'win32') return;
  const onPrimary =
    win !== null &&
    !win.isDestroyed() &&
    screen.getDisplayMatching(win.getBounds()).id === screen.getPrimaryDisplay().id;
  const active =
    onPrimary && win.isFullScreen() && win.isFocused() && !win.isMinimized() ? wantedMode() : null;
  if (active === appliedMode) return;
  if (active) {
    const mode = parseMode(active);
    appliedMode = mode && applyMode(mode) ? active : null;
  } else {
    restoreMode();
    appliedMode = null;
  }
}
// a troca de modo também mexe no foco e no tamanho da janela: espera os eventos assentarem
/** @type {ReturnType<typeof setTimeout> | undefined} */
let syncTimer;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncDisplay, 300);
}
function releaseDisplay() {
  clearTimeout(syncTimer);
  if (appliedMode) restoreMode();
  appliedMode = null;
}
app.on('will-quit', releaseDisplay);
process.on('exit', releaseDisplay);
ipcMain.on('outgun:display-modes', (event) => {
  event.returnValue =
    process.platform === 'win32' && sameOrigin(event.senderFrame?.url ?? '')
      ? {
          modes: displayModes(),
          current: settings.displayMode ?? null,
          launch: launchMode,
          system: ((m) => (m ? formatMode(m) : null))(systemMode()),
        }
      : null;
});
ipcMain.on('outgun:set-display-mode', (event, mode) => {
  if (process.platform !== 'win32' || !sameOrigin(event.senderFrame?.url ?? '')) return;
  settings.displayMode = typeof mode === 'string' && displayModes().includes(mode) ? mode : null;
  try {
    writeFileSync(settingsFile, JSON.stringify(settings));
  } catch {
    // sem disco gravável a escolha vale só até fechar
  }
  // troca na hora, direto do modo atual para o novo
  scheduleSync();
});

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
      // só o modo do FPS, a resolução do monitor e as conquistas; sem Node na página
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
  for (const event of [
    'ready-to-show',
    'focus',
    'blur',
    'minimize',
    'restore',
    'enter-full-screen',
    'leave-full-screen',
  ]) {
    win.on(/** @type {any} */ (event), scheduleSync);
  }
  win.on('closed', () => {
    win = null;
    releaseDisplay();
  });
  void win.loadURL(GAME_URL.href);
}

// Conquistas da Steam (OG-396, D-77): o marco da conta é a fonte de verdade e o app só desbloqueia na
// Steam o que a conta já tem (o site manda os ids). Só quando a Steam abriu o jogo (ela põe o
// SteamAppId no ambiente); fora dela, ou se o SDK falhar, nada muda. O SDK só liga na primeira
// sincronização, com a janela e a GPU já de pé (OG-400: nada da Steam antes de o jogo desenhar).
const STEAM_APP_ID = 663760;
const MILESTONE_ID = /^[a-z0-9_]{1,64}$/;
const launchedBySteam = Number(process.env.SteamAppId ?? process.env.SteamGameId) === STEAM_APP_ID;
/** @type {typeof import('steamworks.js/client.d') | null | undefined} undefined = ainda não ligado */
let steam;
function steamClient() {
  if (steam !== undefined) return steam;
  steam = null;
  if (!launchedBySteam) return steam;
  try {
    steam = createRequire(import.meta.url)('steamworks.js').init(STEAM_APP_ID);
  } catch (error) {
    console.error('Steam indisponível:', error);
  }
  return steam;
}
// "Abrir o Outgun na web" (tela inicial): o site no navegador do sistema, mesmo sendo a origem do app
ipcMain.on('outgun:open-external', (event, url) => {
  // só a página do jogo pode pedir, e só endereços http(s) (openOutside)
  if (sameOrigin(event.senderFrame?.url ?? '') && typeof url === 'string') openOutside(url);
});

ipcMain.on('outgun:steam-available', (event) => {
  event.returnValue = launchedBySteam && sameOrigin(event.senderFrame?.url ?? '');
});
ipcMain.on('outgun:steam-sync', (event, ids) => {
  if (!launchedBySteam || !sameOrigin(event.senderFrame?.url ?? '') || !Array.isArray(ids)) return;
  const steam = steamClient();
  if (!steam) return;
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
    // modo novo do monitor: a janela em tela cheia acompanha o tamanho da tela (OG-401)
    screen.on('display-metrics-changed', (_event, display) => {
      if (appliedMode && win?.isFullScreen() && display.id === screen.getPrimaryDisplay().id) {
        win.setBounds(display.bounds);
      }
    });
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.on('window-all-closed', () => app.quit());
}
