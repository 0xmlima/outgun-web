// SPDX-License-Identifier: GPL-2.0-or-later
// Ponte mínima entre o site e o cliente (OG-373): a página não ganha Node, só a opção de VSync, que
// o processo principal grava e aplica na próxima abertura (os switches do Chromium só valem no início).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('outgunDesktop', {
  /** 'vsync' (padrão) ou 'unlocked', como está gravado (vale ao reabrir). */
  frameRate: () => ipcRenderer.sendSync('outgun:frame-rate'),
  /** O modo que está valendo nesta abertura. */
  frameRateActive: () => ipcRenderer.sendSync('outgun:frame-rate-active'),
  setFrameRate: (mode) => ipcRenderer.send('outgun:set-frame-rate', mode === 'unlocked' ? 'unlocked' : 'vsync'),
});
