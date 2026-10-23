// SPDX-License-Identifier: GPL-2.0-or-later
// Ponte mínima entre o site e o cliente (OG-373): a página não ganha Node, só a opção de VSync, que
// o processo principal grava e aplica na próxima abertura (os switches do Chromium só valem no início),
// e os ids dos marcos para as conquistas da Steam (OG-396).
// preload com sandbox só aceita CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('outgunDesktop', {
  /** 'unlocked' (padrão) ou 'vsync', como está gravado (vale ao reabrir). */
  frameRate: () => ipcRenderer.sendSync('outgun:frame-rate'),
  /** O modo que está valendo nesta abertura. */
  frameRateActive: () => ipcRenderer.sendSync('outgun:frame-rate-active'),
  setFrameRate: (mode) =>
    ipcRenderer.send('outgun:set-frame-rate', mode === 'unlocked' ? 'unlocked' : 'vsync'),
  /** Conquistas da Steam (OG-396): só quando a Steam abriu o jogo. */
  steamAvailable: () => ipcRenderer.sendSync('outgun:steam-available'),
  /** Ids dos marcos da conta; o app desbloqueia na Steam os que faltarem. */
  syncSteamAchievements: (ids) =>
    ipcRenderer.send('outgun:steam-sync', Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []),
});
